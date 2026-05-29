"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listEmployees, listGroups, photoUrl } from "@/lib/api/employees";
import { listRooms } from "@/lib/api/rooms";
import { useMe, hasPermission } from "@/lib/hooks/useMe";
import s from "./students.module.css";

const LIMIT = 50;

function incompleteFields(emp: { photo_url: string | null; room_id: number | null; contacts: string }): string[] {
  const missing: string[] = [];
  if (!emp.photo_url) missing.push("фото");
  if (!emp.room_id) missing.push("комната");
  if (!emp.contacts?.trim()) missing.push("законные представители");
  return missing;
}

function calcAge(birthDate: string): number {
  const today = new Date();
  const bd = new Date(birthDate);
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export default function StudentsPage() {
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "employees:edit");
  const canView = hasPermission(me, "employees:view");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  const [building, setBuilding] = useState<number | undefined>(undefined);
  const [sickOnly, setSickOnly] = useState(false);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Debounce search
  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as any)._t);
    (handleSearch as any)._t = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(1);
    }, 300);
  }, []);

  const employeesQuery = useQuery({
    queryKey: ["employees", debouncedSearch, groupId, building, sickOnly, page],
    queryFn: () =>
      listEmployees({ search: debouncedSearch || undefined, group_id: groupId, building, sick: sickOnly || undefined, page, limit: LIMIT }),
    enabled: canView,
  });

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
    enabled: canView,
  });

  const roomsQuery = useQuery({ queryKey: ["rooms"], queryFn: () => listRooms(), enabled: canView });

  // Fetch sick student IDs for red ring in list
  const sickQuery = useQuery({
    queryKey: ["employees-sick-ids"],
    queryFn: () => listEmployees({ sick: true, limit: 200 }).then((r) => new Set(r.items.map((e) => e.id))),
    enabled: canView,
    staleTime: 30_000,
  });
  const sickIds: Set<number> = sickQuery.data ?? new Set();

  const rawData = employeesQuery.data;
  const groups = groupsQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];

  // Client-side incomplete filter (server returns full page, we filter locally)
  const filteredItems = incompleteOnly
    ? (rawData?.items ?? []).filter((e) => incompleteFields(e).length > 0)
    : (rawData?.items ?? []);
  const data = rawData ? { ...rawData, items: filteredItems } : undefined;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Студенты</h1>
          {data && <div className={s.pageMeta}>{data.total} студентов</div>}
        </div>
        {canEdit && (
          <Link href="/students/new" className={s.btnPrimary}>
            <IconPlus />
            Добавить студента
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className={s.filters}>
        <input
          className={s.filterSearch}
          type="text"
          placeholder="Поиск по ФИО или телефону…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <select
          className={s.filterSelect}
          value={groupId ?? ""}
          onChange={(e) => { setGroupId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
        >
          <option value="">Все группы</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={`${s.filterToggle} ${sickOnly ? s.filterToggleActive : ""}`}
          onClick={() => { setSickOnly(!sickOnly); setPage(1); }}
        >
          <IconVirus />
          Больные
        </button>
        <button
          type="button"
          className={`${s.filterToggle} ${incompleteOnly ? s.filterToggleIncomplete : ""}`}
          onClick={() => setIncompleteOnly(!incompleteOnly)}
        >
          <IconIncomplete />
          Неполные
        </button>
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Телефон</th>
              <th>Группа</th>
              <th>Комната</th>
              <th>Дата рождения</th>
            </tr>
          </thead>
          <tbody>
            {employeesQuery.isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={s.skeletonRow}>
                  <td><div className={s.skeletonBar} style={{ width: 160 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 120 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 60 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 50 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 90 }} /></td>
                </tr>
              ))}

            {!employeesQuery.isLoading && (data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className={s.emptyState}>
                    <div className={s.emptyStateTitle}>Нет студентов</div>
                    
                  </div>
                </td>
              </tr>
            )}

            {!employeesQuery.isLoading &&
              (data?.items ?? []).map((emp) => {
                const age = calcAge(emp.birth_date);
                const isMinor = age < 18;
                const room = rooms.find((r) => r.id === emp.room_id);
                const group = groups.find((g) => g.id === emp.group_id);
                const missing = incompleteFields(emp);
                return (
                  <tr key={emp.id} onClick={() => { window.location.href = `/students/${emp.id}`; }}>
                    <td className={s.tdFio}>
                      <div className={s.fioCell}>
                        <div className={`${s.avatar} ${sickIds.has(emp.id) ? s.avatarSick : ""}`}>
                          {emp.photo_url ? (
                            <img src={photoUrl(emp.id)} alt="" className={s.avatarImg} />
                          ) : (
                            <span className={s.avatarInitial}>{emp.fio.trim()[0] ?? "?"}</span>
                          )}
                        </div>
                        <div className={s.fioName}>
                          {emp.fio}
                          {missing.length > 0 && (
                            <span
                              className={s.incompleteBadge}
                              data-tip={`Не заполнено: ${missing.join(", ")}`}
                            >
                              <IconWarning />
                              Неполный
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={s.tdPhone}>{emp.phone}</td>
                    <td className={s.tdGroup}>{group?.name ?? "—"}</td>
                    <td className={s.tdRoom}>
                      {room ? `${room.building}-${room.entrance}-${room.room_number}` : "—"}
                    </td>
                    <td className={s.tdBirth}>
                      {formatDate(emp.birth_date)}
                      <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                        {age} л.
                      </span>
                      {isMinor && <span className={s.minorBadge}>несов.</span>}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className={s.pagination}>
          <button
            className={s.pageBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </button>
          {Array.from({ length: data.total_pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === data.total_pages || Math.abs(p - page) <= 2)
            .reduce<(number | "…")[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "…" ? (
                <span key={`el-${i}`} className={s.pageBtn} style={{ cursor: "default", opacity: 0.4 }}>…</span>
              ) : (
                <button
                  key={p}
                  className={`${s.pageBtn} ${p === page ? s.pageBtnActive : ""}`}
                  onClick={() => setPage(p as number)}
                >
                  {p}
                </button>
              )
            )}
          <button
            className={s.pageBtn}
            disabled={page >= data.total_pages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function IconVirus() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.5 1.5M9.5 9.5L11 11M11 3l-1.5 1.5M4.5 9.5L3 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconIncomplete() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.25" strokeDasharray="3 2" />
      <path d="M6.5 4v3M6.5 9v.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M5 1.5L9 8.5H1L5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M5 4.5v2M5 7.5v.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
