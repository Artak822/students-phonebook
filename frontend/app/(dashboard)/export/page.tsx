"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listGroups } from "@/lib/api/employees";
import { listRooms } from "@/lib/api/rooms";
import { useMemo } from "react";
import s from "./export.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Filters {
  group_id: string;
  building: string;
  entrance: string;
  sick: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const [filters, setFilters] = useState<Filters>({
    group_id: "",
    building: "",
    entrance: "",
    sick: "",
  });
  const [loading, setLoading] = useState(false);

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: () => listRooms(),
  });

  // Derive available buildings and entrances from rooms
  const buildings = useMemo(() => {
    const all = roomsQuery.data ?? [];
    return [...new Set(all.map((r) => r.building))].sort((a, b) => a - b);
  }, [roomsQuery.data]);

  const entrances = useMemo(() => {
    const all = roomsQuery.data ?? [];
    const filtered = filters.building
      ? all.filter((r) => r.building === Number(filters.building))
      : all;
    return [...new Set(filtered.map((r) => r.entrance))].sort((a, b) => a - b);
  }, [roomsQuery.data, filters.building]);

  function set(key: keyof Filters, value: string) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Reset entrance if building cleared
      if (key === "building") next.entrance = "";
      return next;
    });
  }

  function buildUrl() {
    const q = new URLSearchParams();
    if (filters.group_id) q.set("group_id", filters.group_id);
    if (filters.building) q.set("building", filters.building);
    if (filters.entrance) q.set("entrance", filters.entrance);
    if (filters.sick) q.set("sick", filters.sick);
    const qs = q.toString();
    return `/api/employees/export${qs ? `?${qs}` : ""}`;
  }

  function describeFilters(): string {
    const parts: string[] = [];
    if (filters.group_id) {
      const g = groupsQuery.data?.find((g) => String(g.id) === filters.group_id);
      if (g) parts.push(`Группа: ${g.name}`);
    }
    if (filters.building) {
      let label = `Корпус ${filters.building}`;
      if (filters.entrance) label += `, подъезд ${filters.entrance}`;
      parts.push(label);
    }
    if (filters.sick === "true") parts.push("На больничном");
    if (filters.sick === "false") parts.push("Без больничного");
    return parts.length ? parts.join(" · ") : "Все студенты";
  }

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(), { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка экспорта");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `students_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // noop — browser will show network error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Экспорт студентов</h1>
          <div className={s.pageMeta}>Выгрузка списка в Excel (.xlsx)</div>
        </div>
      </div>

      <div className={s.layout}>
        {/* ─── Filters panel ─── */}
        <div className={s.panel}>
          <div className={s.panelTitle}>Фильтры</div>

          <div className={s.fields}>
            {/* Group */}
            <label className={s.fieldLabel}>Группа</label>
            <select
              className={s.select}
              value={filters.group_id}
              onChange={(e) => set("group_id", e.target.value)}
            >
              <option value="">Все группы</option>
              {groupsQuery.data?.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            {/* Building */}
            <label className={s.fieldLabel}>Корпус</label>
            <select
              className={s.select}
              value={filters.building}
              onChange={(e) => set("building", e.target.value)}
            >
              <option value="">Все корпуса</option>
              {buildings.map((b) => (
                <option key={b} value={b}>Корпус {b}</option>
              ))}
            </select>

            {/* Entrance */}
            <label className={s.fieldLabel}>Подъезд</label>
            <select
              className={s.select}
              value={filters.entrance}
              onChange={(e) => set("entrance", e.target.value)}
              disabled={!filters.building}
            >
              <option value="">Все подъезды</option>
              {entrances.map((e) => (
                <option key={e} value={e}>Подъезд {e}</option>
              ))}
            </select>

            {/* Sick */}
            <label className={s.fieldLabel}>Статус болезни</label>
            <select
              className={s.select}
              value={filters.sick}
              onChange={(e) => set("sick", e.target.value)}
            >
              <option value="">Все студенты</option>
              <option value="true">На больничном</option>
              <option value="false">Без больничного</option>
            </select>
          </div>

          <div className={s.divider} />

          <div className={s.previewRow}>
            <IconFilter />
            <span className={s.previewText}>{describeFilters()}</span>
          </div>

          <button
            className={s.downloadBtn}
            onClick={handleDownload}
            disabled={loading}
          >
            {loading ? (
              <span className={s.spinner} />
            ) : (
              <IconExcel />
            )}
            {loading ? "Формируется..." : "Скачать Excel"}
          </button>
        </div>

        {/* ─── Info panel ─── */}
        <div className={s.infoPanel}>
          <div className={s.panelTitle}>Состав выгрузки</div>
          <ul className={s.fieldList}>
            {EXPORT_FIELDS.map((f) => (
              <li key={f.label} className={s.fieldItem}>
                <span className={s.fieldBullet} />
                <div>
                  <div className={s.fieldItemLabel}>{f.label}</div>
                  {f.note && <div className={s.fieldItemNote}>{f.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Static data ──────────────────────────────────────────────────────────────

const EXPORT_FIELDS = [
  { label: "№", note: "Порядковый номер в выгрузке" },
  { label: "ФИО", note: null },
  { label: "Группа", note: null },
  { label: "Дата рождения", note: "В формате ДД.ММ.ГГГГ" },
  { label: "Комната", note: "Корпус-подъезд-номер" },
  { label: "Телефон", note: null },
  { label: "Заметки", note: null },
  { label: "На больничном", note: "Да / Нет" },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconExcel() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 5.5l3 5 3-5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10.5h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M1.5 3h10M3.5 6.5h6M5.5 10h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
