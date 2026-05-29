"use client";

import { useState } from "react";
import Link from "next/link";
import { DatePicker } from "@/components/ui/DatePicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import {
  listIllnesses,
  createIllness,
  addIllnessNote,
  recoverIllness,
  updateIllness,
  deleteIllness,
} from "@/lib/api/employees";
import { listRooms, roomLabel } from "@/lib/api/rooms";
import type { IllnessRead } from "@/lib/api/employees";
import s from "./illness-block.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function dayWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function illnessDuration(start: string, end: string | null): string {
  // Parse as local date to avoid UTC midnight shift
  const [sy, sm, sd] = start.split("-").map(Number);
  const startD = new Date(sy, sm - 1, sd);
  let endD: Date;
  if (end) {
    const [ey, em, ed] = end.split("-").map(Number);
    endD = new Date(ey, em - 1, ed);
  } else {
    const now = new Date();
    endD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const days = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000));
  return `${days} ${dayWord(days)}`;
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ─── IllnessBlock ─────────────────────────────────────────────────────────────

interface Props {
  empId: number;
  canEdit: boolean;
}

export function IllnessBlock({ empId, canEdit }: Props) {
  const qc = useQueryClient();
  const toast = useToast();

  // ── Dialogs ──────────────────────────────────────────────────────────────
  const [startOpen, setStartOpen] = useState(false);
  const [startDate, setStartDate] = useState(today());
  const [startNote, setStartNote] = useState("");
  const [startRoomId, setStartRoomId] = useState<number | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);

  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [noteDate, setNoteDate] = useState(today());
  const [noteText, setNoteText] = useState("");
  const [noteErr, setNoteErr] = useState<string | null>(null);

  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverDate, setRecoverDate] = useState(today());
  const [recoverNote, setRecoverNote] = useState("");
  const [recoverErr, setRecoverErr] = useState<string | null>(null);

  const [expandedPast, setExpandedPast] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null); // illness id to delete

  // Edit temp room inline
  const [editRoomMode, setEditRoomMode] = useState(false);
  const [editRoomId, setEditRoomId] = useState<number | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const illnessesQuery = useQuery({
    queryKey: ["illnesses", empId],
    queryFn: () => listIllnesses(empId),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: () => listRooms(),
  });

  const illnesses = illnessesQuery.data ?? [];
  const active = illnesses.find((i) => i.end_date === null) ?? null;
  const past = illnesses.filter((i) => i.end_date !== null);

  // Only single-capacity rooms for temp stays
  const tempRooms = (roomsQuery.data ?? []).filter((r) => r.capacity === 1);

  function getRoomLabel(roomId: number | null): string {
    if (!roomId) return "не указана";
    const r = (roomsQuery.data ?? []).find((x) => x.id === roomId);
    return r ? roomLabel(r) : `#${roomId}`;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: () => createIllness(empId, {
      temp_room_id: startRoomId,
      start_date: startDate,
      first_note: startNote,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["illnesses", empId] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      setStartOpen(false);
      setStartNote("");
      setStartRoomId(null);
      setStartErr(null);
      toast.success("Болезнь зафиксирована");
    },
    onError: (err: any) => {
      const msg = err?.body?.message ?? "Не удалось зафиксировать болезнь.";
      setStartErr(msg);
      toast.error(msg);
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => addIllnessNote(empId, active!.id, { note: noteText, date: noteDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["illnesses", empId] });
      setAddNoteOpen(false);
      setNoteText("");
      setNoteErr(null);
      toast.success("Запись добавлена");
    },
    onError: () => {
      setNoteErr("Не удалось сохранить запись.");
      toast.error("Не удалось сохранить запись.");
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: (temp_room_id: number | null) => updateIllness(empId, active!.id, { temp_room_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["illnesses", empId] });
      setEditRoomMode(false);
      toast.success("Временная комната обновлена");
    },
    onError: () => toast.error("Не удалось изменить временную комнату."),
  });

  const deleteMutation = useMutation({
    mutationFn: (illnessId: number) => deleteIllness(empId, illnessId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["illnesses", empId] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      setDeleteTarget(null);
      toast.success("Болезнь удалена");
    },
    onError: () => toast.error("Не удалось удалить болезнь."),
  });

  const recoverMutation = useMutation({
    mutationFn: () => recoverIllness(empId, active!.id, {
      end_date: recoverDate,
      final_note: recoverNote,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["illnesses", empId] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      setRecoverOpen(false);
      setRecoverNote("");
      setRecoverErr(null);
      toast.success("Выздоровление отмечено");
    },
    onError: () => {
      setRecoverErr("Не удалось отметить выздоровление.");
      toast.error("Не удалось отметить выздоровление.");
    },
  });

  if (illnessesQuery.isLoading) {
    return <div className={s.empty}>Загрузка…</div>;
  }

  return (
    <div className={s.block}>

      {/* ── Active illness ── */}
      {active ? (
        <div className={s.activeCard}>
          <div className={s.activeHeader}>
            <div className={s.activeHeaderLeft}>
              <span className={s.sickDot} />
              <span className={s.activeTitle}>Болеет с {fmtDate(active.start_date)}</span>
              <span className={s.activeDuration}>{illnessDuration(active.start_date, null)}</span>
            </div>
            {canEdit && (
              <div className={s.activeActions}>
                <button type="button" className={s.btnNote} onClick={() => { setNoteDate(today()); setNoteText(""); setAddNoteOpen(true); }}>
                  + Запись
                </button>
                <button type="button" className={s.btnRecover} onClick={() => { setRecoverDate(today()); setRecoverNote(""); setRecoverOpen(true); }}>
                  Выздоровел
                </button>
                <button type="button" className={s.btnDeleteIllness} title="Удалить болезнь"
                  onClick={() => setDeleteTarget(active.id)}>
                  <IconTrash />
                </button>
              </div>
            )}
          </div>

          <div className={s.activeMeta}>
            <span className={s.metaLabel}>Временная комната:</span>
            {editRoomMode ? (
              <div className={s.editRoomInline}>
                <select
                  className={s.editRoomSelect}
                  value={editRoomId ?? ""}
                  onChange={(e) => setEditRoomId(e.target.value ? Number(e.target.value) : null)}
                  autoFocus
                >
                  <option value="">Не указана</option>
                  {tempRooms.map((r) => (
                    <option key={r.id} value={r.id}>{roomLabel(r)}</option>
                  ))}
                </select>
                <button type="button" className={s.editRoomSave}
                  onClick={() => updateRoomMutation.mutate(editRoomId)}
                  disabled={updateRoomMutation.isPending}>
                  Сохранить
                </button>
                <button type="button" className={s.editRoomCancel}
                  onClick={() => setEditRoomMode(false)}>
                  Отмена
                </button>
              </div>
            ) : (
              <>
                {active.temp_room_id ? (
                  <Link href={`/rooms/${active.temp_room_id}`} className={s.roomLink}>
                    {getRoomLabel(active.temp_room_id)}
                  </Link>
                ) : (
                  <span className={s.roomEmpty}>не указана</span>
                )}
                {canEdit && (
                  <button type="button" className={s.editRoomBtn}
                    onClick={() => { setEditRoomId(active.temp_room_id); setEditRoomMode(true); }}>
                    <IconPencil />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Notes timeline */}
          <div className={s.timeline}>
            {active.notes.length === 0 && (
              <div className={s.timelineEmpty}>Записей пока нет</div>
            )}
            {active.notes.map((n, idx) => (
              <div key={n.id} className={s.timelineItem}>
                <div className={s.timelineDot} data-last={idx === active.notes.length - 1} />
                <div className={s.timelineContent}>
                  <div className={s.timelineDate}>{fmtDate(n.date)}</div>
                  <div className={s.timelineNote}>{n.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={s.healthyRow}>
          <span className={s.healthyLabel}>Здоров</span>
          {canEdit && (
            <button type="button" className={s.btnSick} onClick={() => { setStartDate(today()); setStartNote(""); setStartRoomId(null); setStartOpen(true); }}>
              <IconVirus />
              Заболел
            </button>
          )}
        </div>
      )}

      {/* ── Past illnesses ── */}
      {past.length > 0 && (
        <div className={s.pastSection}>
          <div className={s.pastTitle}>История болезней</div>
          {past.map((ill) => (
            <div key={ill.id} className={s.pastItem}>
              <button
                type="button"
                className={s.pastHeader}
                onClick={() => setExpandedPast(expandedPast === ill.id ? null : ill.id)}
              >
                <div className={s.pastHeaderLeft}>
                  <IconChevronRight className={`${s.pastChevron} ${expandedPast === ill.id ? s.pastChevronOpen : ""}`} />
                  <span className={s.pastDates}>{fmtDate(ill.start_date)} — {ill.end_date ? fmtDate(ill.end_date) : "…"}</span>
                  <span className={s.pastDuration}>{illnessDuration(ill.start_date, ill.end_date)}</span>
                </div>
                <span className={s.pastNoteCount}>{ill.notes.length} {noteWord(ill.notes.length)}</span>
              </button>

              {expandedPast === ill.id && (
                <div className={s.pastExpanded}>
                  <div className={s.activeMeta}>
                    <span className={s.metaLabel}>Временная комната:</span>
                    {ill.temp_room_id ? (
                      <Link href={`/rooms/${ill.temp_room_id}`} className={s.roomLink}>
                        {getRoomLabel(ill.temp_room_id)}
                      </Link>
                    ) : (
                      <span className={s.roomEmpty}>не указана</span>
                    )}
                  </div>
                  <div className={s.timeline}>
                    {ill.notes.length === 0 && <div className={s.timelineEmpty}>Нет записей</div>}
                    {ill.notes.map((n, idx) => {
                      const isLast = idx === ill.notes.length - 1;
                      return (
                        <div key={n.id} className={s.timelineItem}>
                          <div className={s.timelineDot} data-last={isLast ? "recovered" : undefined} />
                          <div className={s.timelineContent}>
                            <div className={s.timelineDate}>{fmtDate(n.date)}</div>
                            <div className={s.timelineNote}>{n.note}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {canEdit && (
                    <div className={s.pastExpandedActions}>
                      <button type="button" className={s.btnDeletePast}
                        onClick={() => setDeleteTarget(ill.id)}>
                        <IconTrash /> Удалить болезнь
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Dialog: start illness ── */}
      {startOpen && (
        <div className={s.overlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Зафиксировать болезнь</div>
            {startErr && <div className={s.dialogError}>{startErr}</div>}
            <div className={s.dialogFields}>
              <div className={s.dialogField}>
                <label className={s.dialogLabel}>Дата начала</label>
                <DatePicker mode="date" value={startDate} onChange={setStartDate} />
              </div>
              <div className={s.dialogField}>
                <label className={s.dialogLabel}>Временная комната</label>
                <select
                  className={s.dialogSelect}
                  value={startRoomId ?? ""}
                  onChange={(e) => setStartRoomId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Не указана</option>
                  {tempRooms.map((r) => (
                    <option key={r.id} value={r.id}>{roomLabel(r)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={s.dialogField} style={{ marginBottom: 20 }}>
              <label className={s.dialogLabel}>Первая запись (необязательно)</label>
              <textarea
                className={s.dialogTextarea}
                rows={3}
                placeholder="Первичный осмотр, симптомы…"
                value={startNote}
                onChange={(e) => setStartNote(e.target.value)}
              />
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => setStartOpen(false)} disabled={startMutation.isPending}>Отмена</button>
              <button className={s.btnDanger} onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
                {startMutation.isPending && <span className={s.spinner} />}
                Зафиксировать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: add note ── */}
      {addNoteOpen && (
        <div className={s.overlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Добавить запись</div>
            {noteErr && <div className={s.dialogError}>{noteErr}</div>}
            <div className={s.dialogField}>
              <label className={s.dialogLabel}>Дата</label>
              <DatePicker mode="date" value={noteDate} onChange={setNoteDate} />
            </div>
            <div className={s.dialogField} style={{ marginBottom: 20 }}>
              <label className={s.dialogLabel}>Статус / Наблюдение</label>
              <textarea
                className={s.dialogTextarea}
                rows={4}
                placeholder="Состояние нормальное, идёт на поправку…"
                value={noteText}
                autoFocus
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => setAddNoteOpen(false)} disabled={noteMutation.isPending}>Отмена</button>
              <button className={s.btnPrimary} onClick={() => { if (!noteText.trim()) { setNoteErr("Введите текст записи."); return; } noteMutation.mutate(); }} disabled={noteMutation.isPending}>
                {noteMutation.isPending && <span className={s.spinner} />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: delete illness ── */}
      {deleteTarget !== null && (
        <div className={s.overlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Удалить болезнь?</div>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              Все записи этой болезни будут удалены без возможности восстановления.
            </p>
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>Отмена</button>
              <button className={s.btnDanger} onClick={() => deleteMutation.mutate(deleteTarget)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending && <span className={s.spinner} />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: recover ── */}
      {recoverOpen && (
        <div className={s.overlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Выздоровление</div>
            {recoverErr && <div className={s.dialogError}>{recoverErr}</div>}
            <div className={s.dialogField}>
              <label className={s.dialogLabel}>Дата выздоровления</label>
              <DatePicker mode="date" value={recoverDate} onChange={setRecoverDate} />
            </div>
            <div className={s.dialogField} style={{ marginBottom: 20 }}>
              <label className={s.dialogLabel}>Финальная запись (необязательно)</label>
              <textarea
                className={s.dialogTextarea}
                rows={3}
                placeholder="Студент выздоровел, возвращается в комнату…"
                value={recoverNote}
                onChange={(e) => setRecoverNote(e.target.value)}
              />
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => setRecoverOpen(false)} disabled={recoverMutation.isPending}>Отмена</button>
              <button className={s.btnPrimary} onClick={() => recoverMutation.mutate()} disabled={recoverMutation.isPending}>
                {recoverMutation.isPending && <span className={s.spinner} />}
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function noteWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "записей";
  if (mod10 === 1) return "запись";
  if (mod10 >= 2 && mod10 <= 4) return "записи";
  return "записей";
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IconVirus() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
    <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.25" />
    <path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.5 1.5M9.5 9.5L11 11M11 3l-1.5 1.5M4.5 9.5L3 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>;
}

function IconChevronRight({ className }: { className?: string }) {
  return <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
