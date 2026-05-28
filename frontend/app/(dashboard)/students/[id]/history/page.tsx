"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getEmployee, getEmployeeHistory } from "@/lib/api/employees";
import s from "./history.module.css";

const FIELD_LABELS: Record<string, string> = {
  fio: "ФИО",
  phone: "Телефон",
  group_id: "Группа",
  birth_date: "Дата рождения",
  room_id: "Комната",
  notes: "Заметки",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Создан",
  update: "Изменение",
  delete: "Удалён",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StudentHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const empId = Number(id);

  const empQuery = useQuery({
    queryKey: ["employee", empId],
    queryFn: () => getEmployee(empId),
  });

  const historyQuery = useQuery({
    queryKey: ["employee-history", empId],
    queryFn: () => getEmployeeHistory(empId),
  });

  const emp = empQuery.data;
  const items = historyQuery.data?.items ?? [];

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <Link href={`/students/${empId}`} className={s.backBtn} title="Назад к карточке">
          <IconChevronLeft />
        </Link>
        <div>
          <h1 className={s.pageTitle}>История изменений</h1>
          {emp && (
            <div className={s.pageMeta}>{emp.fio}</div>
          )}
        </div>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Действие</th>
              <th>Поле</th>
              <th>Было</th>
              <th>Стало</th>
              <th>Когда</th>
            </tr>
          </thead>
          <tbody>
            {historyQuery.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className={s.skeletonRow}>
                  <td><div className={s.skeletonBar} style={{ width: 70 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 80 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 120 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 120 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 130 }} /></td>
                </tr>
              ))}

            {!historyQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className={s.emptyState}>
                    <div className={s.emptyStateTitle}>История пуста</div>
                    <div className={s.emptyStateText}>Изменений пока не было.</div>
                  </div>
                </td>
              </tr>
            )}

            {!historyQuery.isLoading &&
              items.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className={`${s.actionBadge} ${s[`action_${entry.action}`]}`}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </td>
                  <td className={s.tdField}>
                    {entry.field_name ? (FIELD_LABELS[entry.field_name] ?? entry.field_name) : "—"}
                  </td>
                  <td className={s.tdValue}>{entry.old_value ?? "—"}</td>
                  <td className={s.tdValue}>{entry.new_value ?? "—"}</td>
                  <td className={s.tdDate}>{formatDate(entry.changed_at)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
