"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getEmployee, getEmployeeHistory, type HistoryEntry } from "@/lib/api/employees";
import s from "./history.module.css";

// ─── Locale maps ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  fio: "ФИО",
  phone: "Телефон",
  group_id: "Группа",
  birth_date: "Дата рождения",
  room_id: "Комната",
  notes: "Заметки",
  email: "Email",
};

// ─── Grouping ─────────────────────────────────────────────────────────────────

interface EventGroup {
  id: string;
  action: "create" | "update" | "delete";
  entries: HistoryEntry[];
  at: string; // changed_at of first entry
}

function groupEntries(items: HistoryEntry[]): EventGroup[] {
  if (!items.length) return [];

  const sorted = [...items].sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  const groups: EventGroup[] = [];
  let current: EventGroup | null = null;

  for (const entry of sorted) {
    const t = new Date(entry.changed_at).getTime();
    const last = current ? new Date(current.at).getTime() : 0;
    const sameOp = current && current.action === entry.action && Math.abs(t - last) < 3000;

    if (sameOp) {
      current!.entries.push(entry);
    } else {
      current = {
        id: `${entry.id}`,
        action: entry.action,
        entries: [entry],
        at: entry.changed_at,
      };
      groups.push(current);
    }
  }

  return groups;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayKey(iso) === dayKey(today.toISOString())) return "Сегодня";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatValue(field: string | null, val: string | null): string {
  if (val === null || val === "") return "—";
  if (field === "birth_date" && val.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [y, m, d] = val.split("-");
    return `${d}.${m}.${y}`;
  }
  return val;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const empId = Number(id);
  const router = useRouter();

  const empQuery = useQuery({
    queryKey: ["employee", empId],
    queryFn: () => getEmployee(empId),
  });

  const historyQuery = useQuery({
    queryKey: ["employee-history", empId],
    queryFn: () => getEmployeeHistory(empId),
  });

  const emp = empQuery.data;
  const groups = groupEntries(historyQuery.data?.items ?? []);

  // Group events by calendar day
  const byDay: { day: string; label: string; events: EventGroup[] }[] = [];
  for (const evt of groups) {
    const dk = dayKey(evt.at);
    const last = byDay[byDay.length - 1];
    if (last && last.day === dk) {
      last.events.push(evt);
    } else {
      byDay.push({ day: dk, label: formatDay(evt.at), events: [evt] });
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <button type="button" className={s.backBtn} title="Назад к карточке" onClick={() => router.back()}>
          <IconChevronLeft />
        </button>
        <div>
          <h1 className={s.pageTitle}>История изменений</h1>
          {emp && <div className={s.pageMeta}>{emp.fio}</div>}
        </div>
      </div>

      {historyQuery.isLoading && (
        <div className={s.timeline}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={s.skeletonEvent}>
              <div className={s.skeletonDot} />
              <div className={s.skeletonCard}>
                <div className={s.skeletonBar} style={{ width: 80, marginBottom: 8 }} />
                <div className={s.skeletonBar} style={{ width: "60%" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!historyQuery.isLoading && groups.length === 0 && (
        <div className={s.empty}>
          <div className={s.emptyTitle}>История пуста</div>
          <div className={s.emptyText}>Изменений пока не было.</div>
        </div>
      )}

      {!historyQuery.isLoading && byDay.length > 0 && (
        <div className={s.timeline}>
          {byDay.map(({ day, label, events }) => (
            <div key={day} className={s.dayGroup}>
              <div className={s.dayLabel}>{label}</div>

              {events.map((evt) => (
                <div key={evt.id} className={s.event}>
                  <div className={`${s.eventDot} ${s[`dot_${evt.action}`]}`}>
                    {evt.action === "create" && <IconPlus />}
                    {evt.action === "update" && <IconPencil />}
                    {evt.action === "delete" && <IconTrash />}
                  </div>

                  <div className={s.eventBody}>
                    <div className={s.eventHeader}>
                      <span className={`${s.eventAction} ${s[`action_${evt.action}`]}`}>
                        {evt.action === "create" && "Создан"}
                        {evt.action === "update" && "Изменение"}
                        {evt.action === "delete" && "Удалён"}
                      </span>
                      {evt.entries[0]?.admin_fio && (
                        <span className={s.eventAuthor}>
                          <IconUser />
                          {evt.entries[0].admin_fio}
                        </span>
                      )}
                      <span className={s.eventTime}>{formatTime(evt.at)}</span>
                    </div>

                    {evt.action === "update" && (
                      <div className={s.changes}>
                        {evt.entries.map((e) => (
                          <div key={e.id} className={s.changeRow}>
                            <span className={s.changeField}>
                              {e.field_name ? (FIELD_LABELS[e.field_name] ?? e.field_name) : "—"}
                            </span>
                            <span className={s.changeOld}>{formatValue(e.field_name, e.old_value)}</span>
                            <IconArrow className={s.changeArrow} />
                            <span className={s.changeNew}>{formatValue(e.field_name, e.new_value)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {evt.action === "create" && (
                      <div className={s.changes}>
                        {evt.entries
                          .filter((e) => e.new_value !== null && e.field_name !== null)
                          .map((e) => (
                            <div key={e.id} className={s.changeRow}>
                              <span className={s.changeField}>
                                {FIELD_LABELS[e.field_name!] ?? e.field_name}
                              </span>
                              <span className={s.changeNew}>{formatValue(e.field_name, e.new_value)}</span>
                            </div>
                          ))}
                        {evt.entries.filter((e) => e.field_name !== null).length === 0 && (
                          <span className={s.eventDesc}>Запись создана</span>
                        )}
                      </div>
                    )}

                    {evt.action === "delete" && (
                      <span className={s.eventDesc}>Запись удалена</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M1.5 3h7M4 3V2h2v1M2.5 3l.5 5.5h4L7.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 11c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 6h8M7 3.5L9.5 6 7 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
