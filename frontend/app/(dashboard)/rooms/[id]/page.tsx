"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRoom, updateRoom, deleteRoom, getRoomStudents, listRooms } from "@/lib/api/rooms";
import { listEmployees, assignRoom, photoUrl } from "@/lib/api/employees";
import { HttpError } from "@/lib/api/client";
import { useMe, hasPermission } from "@/lib/hooks/useMe";
import { useToast } from "@/lib/toast";
import s from "./room-card.module.css";

// ─── Main ────────────────────────────────────────────────────────────────────

interface Props {
  params: { id: string };
}

export default function RoomCardPage({ params }: Props) {
  const roomId = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const toast = useToast();

  const canManage = hasPermission(me, "rooms:manage");

  // ── Room edit state ────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [building, setBuilding] = useState("");
  const [entrance, setEntrance] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [capacity, setCapacity] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ── Add resident state ─────────────────────────────────────────────────────
  const [addMode, setAddMode] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSearchDebounced, setAddSearchDebounced] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Evict state ────────────────────────────────────────────────────────────
  const [evictTarget, setEvictTarget] = useState<{ id: number; fio: string } | null>(null);

  // ── Transfer state ─────────────────────────────────────────────────────────
  const [transferTarget, setTransferTarget] = useState<{ id: number; fio: string } | null>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferRoomId, setTransferRoomId] = useState<number | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const transferDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transferSearchDebounced, setTransferSearchDebounced] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────
  const roomQuery = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => getRoom(roomId),
  });

  const studentsQuery = useQuery({
    queryKey: ["room-students", roomId],
    queryFn: () => getRoomStudents(roomId),
  });

  const allRoomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: () => listRooms(),
    enabled: transferTarget !== null,
  });

  const addSearchQuery = useQuery({
    queryKey: ["employee-search", addSearchDebounced],
    queryFn: () => listEmployees({ search: addSearchDebounced, limit: 20 }),
    enabled: addMode && addSearchDebounced.length >= 2,
  });

  const room = roomQuery.data;
  const students = studentsQuery.data ?? [];
  const occupancy = students.length;
  const cap = room?.capacity ?? 0;
  const occupancyFull = cap > 0 && occupancy >= cap;

  // Filter add candidates: exclude already in this room
  const addCandidates = (addSearchQuery.data?.items ?? []).filter(
    (e) => e.room_id !== roomId
  );

  // Filter rooms for transfer: exclude current room, smart compact search
  const transferRooms = (allRoomsQuery.data ?? []).filter((r) => {
    if (r.id === roomId) return false;
    const q = transferSearch.trim();
    if (!q) return true;
    const digits = q.replace(/\D/g, "");
    const compact = `${r.building}${r.entrance}${r.room_number}`;
    const full = `${r.building}-${r.entrance}-${r.room_number}`;
    if (digits.length >= 2 && compact.startsWith(digits)) return true;
    return full.includes(q) || String(r.room_number).includes(q);
  });

  // ── Sync room form ─────────────────────────────────────────────────────────
  function syncFromRoom() {
    if (!room) return;
    setBuilding(String(room.building));
    setEntrance(String(room.entrance));
    setRoomNumber(String(room.room_number));
    setCapacity(String(room.capacity));
  }
  useEffect(() => { syncFromRoom(); }, [room]);

  // ── Debounce add search ────────────────────────────────────────────────────
  const handleAddSearch = useCallback((v: string) => {
    setAddSearch(v);
    setAddOpen(true);
    if (addDebounceRef.current) clearTimeout(addDebounceRef.current);
    addDebounceRef.current = setTimeout(() => setAddSearchDebounced(v), 300);
  }, []);

  // ── Debounce transfer search ───────────────────────────────────────────────
  const handleTransferSearch = useCallback((v: string) => {
    setTransferSearch(v);
    setTransferRoomId(null);
    setTransferOpen(true);
    if (transferDebounceRef.current) clearTimeout(transferDebounceRef.current);
    transferDebounceRef.current = setTimeout(() => setTransferSearchDebounced(v), 150);
  }, []);

  // ── Assign mutation (used for add, evict, transfer) ────────────────────────
  const assignMutation = useMutation({
    mutationFn: ({ empId, targetRoomId }: { empId: number; targetRoomId: number | null }) =>
      assignRoom(empId, targetRoomId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["room-students", roomId] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      // If transfer to another room, also invalidate that room's students
      if (vars.targetRoomId !== null && vars.targetRoomId !== roomId) {
        qc.invalidateQueries({ queryKey: ["room-students", vars.targetRoomId] });
      }
      if (vars.targetRoomId === null) {
        toast.success("Жилец выселен");
      } else if (vars.targetRoomId === roomId) {
        toast.success("Жилец добавлен");
      } else {
        toast.success("Жилец переселён");
      }
      setAddMode(false);
      setAddSearch("");
      setAddSearchDebounced("");
      setAddError(null);
      setAddOpen(false);
      setEvictTarget(null);
      setTransferTarget(null);
      setTransferSearch("");
      setTransferRoomId(null);
      setTransferError(null);
      setTransferOpen(false);
    },
    onError: (err: unknown, vars) => {
      const isRoomFull = err instanceof HttpError && err.body.code === "ROOM_FULL";
      if (vars.targetRoomId === null) {
        toast.error("Не удалось выселить жильца.");
      } else if (vars.targetRoomId === roomId) {
        const msg = isRoomFull ? "Комната заполнена." : "Не удалось добавить жильца.";
        setAddError(msg);
        toast.error(msg);
      } else {
        const msg = isRoomFull ? "Выбранная комната заполнена." : "Не удалось переселить.";
        setTransferError(msg);
        toast.error(msg);
      }
    },
  });

  // ── Room save mutation ─────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!building || Number(building) < 1) e.building = "Укажите корпус";
    if (!entrance || Number(entrance) < 1) e.entrance = "Укажите подъезд";
    if (!roomNumber || Number(roomNumber) < 1) e.room_number = "Укажите номер";
    if (!capacity || Number(capacity) < 1) e.capacity = "Вместимость не менее 1";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateRoom(roomId, {
        building: Number(building),
        entrance: Number(entrance),
        room_number: Number(roomNumber),
        capacity: Number(capacity),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setEditMode(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
      toast.success("Изменения сохранены");
    },
    onError: (err: unknown) => {
      const msg = err instanceof HttpError && err.body.code === "ROOM_DUPLICATE"
        ? "Комната с таким адресом уже существует."
        : "Не удалось сохранить.";
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRoom(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("Комната удалена");
      router.push("/rooms");
    },
    onError: () => toast.error("Не удалось удалить комнату."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!validate()) return;
    saveMutation.mutate();
  }

  function handleCancelEdit() {
    syncFromRoom();
    setErrors({});
    setSaveError(null);
    setEditMode(false);
  }

  function handleAddModeOpen() {
    setAddMode(true);
    setAddError(null);
    setTimeout(() => addInputRef.current?.focus(), 50);
  }

  function handleAddCancel() {
    setAddMode(false);
    setAddSearch("");
    setAddSearchDebounced("");
    setAddError(null);
    setAddOpen(false);
  }

  function handleAddSelect(empId: number) {
    setAddError(null);
    assignMutation.mutate({ empId, targetRoomId: roomId });
  }

  function handleEvict() {
    if (!evictTarget) return;
    assignMutation.mutate({ empId: evictTarget.id, targetRoomId: null });
  }

  function handleTransfer() {
    if (!transferTarget || transferRoomId === null) return;
    setTransferError(null);
    assignMutation.mutate({ empId: transferTarget.id, targetRoomId: transferRoomId });
  }

  function openTransfer(st: { id: number; fio: string }) {
    setTransferTarget(st);
    setTransferSearch("");
    setTransferSearchDebounced("");
    setTransferRoomId(null);
    setTransferError(null);
    setTransferOpen(false);
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (roomQuery.isLoading) {
    return <div className={s.page}><div className={s.loadingState}>Загрузка…</div></div>;
  }
  if (!room) {
    return <div className={s.page}><div className={s.loadingState}>Комната не найдена.</div></div>;
  }

  const title = `${room.building}-${room.entrance}-${room.room_number}`;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <button type="button" className={s.backBtn} title="Назад" onClick={() => router.back()}>
          <IconChevronLeft />
        </button>
        <div className={s.headerMeta}>
          <h1 className={s.pageTitle}>{title}</h1>
        </div>
        <div className={s.headerActions}>
          {!editMode && canManage && (
            <button className={s.btnPrimary} onClick={() => setEditMode(true)}>
              <IconEdit />
              Редактировать
            </button>
          )}
        </div>
      </div>

      {savedOk && <div className={s.successBanner}>Изменения сохранены.</div>}

      <form onSubmit={handleSubmit}>
        <div className={s.layout}>

          {/* Left: room details */}
          <div className={s.leftCol}>
          <div className={s.leftPanel}>
            <div className={s.section}>
              <div className={s.sectionTitle}>Параметры</div>
              {editMode ? (
                <>
                  <div className={s.fieldRow}>
                    <div className={s.field}>
                      <label className={s.label}>Корпус</label>
                      <input className={`${s.input} ${errors.building ? s.inputError : ""}`}
                        type="number" min={1} value={building}
                        onChange={(e) => setBuilding(e.target.value)} />
                      {errors.building && <span className={s.fieldError}>{errors.building}</span>}
                    </div>
                    <div className={s.field}>
                      <label className={s.label}>Подъезд</label>
                      <input className={`${s.input} ${errors.entrance ? s.inputError : ""}`}
                        type="number" min={1} value={entrance}
                        onChange={(e) => setEntrance(e.target.value)} />
                      {errors.entrance && <span className={s.fieldError}>{errors.entrance}</span>}
                    </div>
                  </div>
                  <div className={s.fieldRow}>
                    <div className={s.field}>
                      <label className={s.label}>Номер комнаты</label>
                      <input className={`${s.input} ${errors.room_number ? s.inputError : ""}`}
                        type="number" min={1} value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)} />
                      {errors.room_number && <span className={s.fieldError}>{errors.room_number}</span>}
                    </div>
                    <div className={s.field}>
                      <label className={s.label}>Вместимость</label>
                      <input className={`${s.input} ${errors.capacity ? s.inputError : ""}`}
                        type="number" min={1} value={capacity}
                        onChange={(e) => setCapacity(e.target.value)} />
                      {errors.capacity && <span className={s.fieldError}>{errors.capacity}</span>}
                    </div>
                  </div>
                </>
              ) : (
                <div className={s.statGrid}>
                  <div className={s.stat}>
                    <div className={s.statLabel}>Корпус</div>
                    <div className={s.statValue}>{room.building}</div>
                  </div>
                  <div className={s.stat}>
                    <div className={s.statLabel}>Подъезд</div>
                    <div className={s.statValue}>{room.entrance}</div>
                  </div>
                  <div className={s.stat}>
                    <div className={s.statLabel}>Номер</div>
                    <div className={s.statValue}>{room.room_number}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Occupancy */}
            <div className={s.section}>
              <div className={s.sectionTitleRow}>
                <div className={s.sectionTitle}>Заполненность</div>
                <span className={occupancyFull ? s.badgeFull : s.badgeFree}>
                  {occupancyFull ? "Заполнена" : "Есть места"}
                </span>
              </div>
              <div className={s.dotGrid}>
                {Array.from({ length: cap }).map((_, i) => (
                  <div key={i} className={i < occupancy ? s.dotOccupied : s.dotFree} />
                ))}
              </div>
              <div className={s.occupancyMeta}>
                <span className={s.occupancyMetaItem}>
                  <span className={s.occupancyMetaDot} data-occupied="true" />
                  {occupancy} занято
                </span>
                <span className={s.occupancyMetaSep}>·</span>
                <span className={s.occupancyMetaItem}>
                  <span className={s.occupancyMetaDot} />
                  {Math.max(cap - occupancy, 0)} свободно
                </span>
                <span className={s.occupancyMetaSep}>·</span>
                <span className={s.occupancyMetaItem} style={{ color: "var(--text-muted)" }}>
                  {cap} мест
                </span>
              </div>
            </div>

          </div>{/* /leftPanel */}

            {/* Footer */}
            {editMode && (
              <div className={s.formFooter}>
                {saveError && <div className={s.errorBanner}>{saveError}</div>}
                <div className={s.footerActions}>
                  {canManage && (
                    <button type="button" className={s.btnDanger} onClick={() => setDeleteConfirm(true)}>
                      <IconTrash />
                      Удалить
                    </button>
                  )}
                  <div className={s.footerSpacer} />
                  <button type="button" className={s.btnGhost} onClick={handleCancelEdit}>
                    Отмена
                  </button>
                  <button type="submit" className={s.btnPrimary} disabled={saveMutation.isPending}>
                    {saveMutation.isPending && <span className={s.spinner} />}
                    Сохранить
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: residents */}
          <div className={s.rightCol}>
          <div className={s.rightPanel}>
            <div className={s.section}>
              <div className={s.sectionTitleRow}>
                <div className={s.sectionTitle}>Жильцы</div>
                <div className={s.sectionTitleRight}>
                  {!studentsQuery.isLoading && (
                    <span className={s.residentCount}>{occupancy}</span>
                  )}
                  {canManage && !addMode && (
                    <button
                      type="button"
                      className={s.btnAddResident}
                      onClick={handleAddModeOpen}
                      title="Добавить жильца"
                    >
                      <IconPlus />
                      Добавить
                    </button>
                  )}
                </div>
              </div>

              {studentsQuery.isLoading && (
                <div className={s.residentSkeleton}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={s.residentSkeletonRow}>
                      <div className={s.skeletonCircle} />
                      <div className={s.skeletonLine} />
                    </div>
                  ))}
                </div>
              )}

              {!studentsQuery.isLoading && students.length === 0 && !addMode && (
                <div className={s.emptyResidents}>Жильцов нет</div>
              )}

              {!studentsQuery.isLoading && students.length > 0 && (
                <div className={s.residentList}>
                  {students.map((st) => (
                    <div key={st.id} className={s.residentRow}>
                      <Link href={`/students/${st.id}`} className={s.residentLink}>
                        <div className={s.residentAvatar}>
                          <img
                            src={photoUrl(st.id)}
                            alt=""
                            className={s.residentAvatarImg}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                              (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("style");
                            }}
                          />
                          <span className={s.residentAvatarInitial} style={{ display: "none" }}>
                            {st.fio.trim()[0] ?? "?"}
                          </span>
                        </div>
                        <div className={s.residentInfo}>
                          <div className={s.residentName}>{st.fio}</div>
                          <div className={s.residentPhone}>{st.phone}</div>
                        </div>
                      </Link>
                      {canManage && (
                        <div className={s.residentActions}>
                          <button
                            type="button"
                            className={s.residentActionBtn}
                            title="Переселить"
                            onClick={() => openTransfer({ id: st.id, fio: st.fio })}
                          >
                            <IconTransfer />
                          </button>
                          <button
                            type="button"
                            className={`${s.residentActionBtn} ${s.residentActionBtnDanger}`}
                            title="Выселить"
                            onClick={() => setEvictTarget({ id: st.id, fio: st.fio })}
                          >
                            <IconEvict />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add resident inline */}
              {addMode && (
                <div className={s.addResidentBox}>
                  {addError && <div className={s.addError}>{addError}</div>}
                  <div className={s.addSearchWrap} onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setAddOpen(false);
                  }}>
                    <input
                      ref={addInputRef}
                      className={s.addSearchInput}
                      placeholder="Поиск по ФИО или телефону…"
                      value={addSearch}
                      onChange={(e) => handleAddSearch(e.target.value)}
                      onFocus={() => addSearch.length >= 2 && setAddOpen(true)}
                      autoComplete="off"
                    />
                    {addOpen && addSearchDebounced.length >= 2 && (
                      <div className={s.addDropdown} onMouseDown={(e) => e.preventDefault()}>
                        {addSearchQuery.isLoading && (
                          <div className={s.addDropdownMsg}>Поиск…</div>
                        )}
                        {!addSearchQuery.isLoading && addCandidates.length === 0 && (
                          <div className={s.addDropdownMsg}>Ничего не найдено</div>
                        )}
                        {addCandidates.map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            className={s.addDropdownItem}
                            onClick={() => handleAddSelect(emp.id)}
                            disabled={assignMutation.isPending}
                          >
                            <div className={s.addDropdownAvatar}>
                              <img
                                src={photoUrl(emp.id)}
                                alt=""
                                className={s.addDropdownAvatarImg}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("style");
                                }}
                              />
                              <span className={s.addDropdownAvatarInitial} style={{ display: "none" }}>
                                {emp.fio.trim()[0] ?? "?"}
                              </span>
                            </div>
                            <div className={s.addDropdownInfo}>
                              <div className={s.addDropdownName}>{emp.fio}</div>
                              <div className={s.addDropdownSub}>
                                {emp.phone}
                                {emp.room_id !== null && emp.room_id !== roomId && (
                                  <span className={s.addDropdownCurrentRoom}> · сейчас в другой комнате</span>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={s.addActions}>
                    <button type="button" className={s.btnGhost} onClick={handleAddCancel}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>{/* /rightPanel */}
          </div>

        </div>
      </form>

      {/* Delete room confirm */}
      {deleteConfirm && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Удалить комнату?</div>
            <div className={s.dialogText}>
              Комната <strong>{title}</strong> будет удалена. Это действие необратимо.
            </div>
            {deleteMutation.isError && (
              <div className={s.errorBanner} style={{ marginBottom: 16 }}>
                {deleteMutation.error instanceof HttpError &&
                deleteMutation.error.body.code === "ROOM_HAS_STUDENTS"
                  ? "В комнате есть жильцы. Выселите их перед удалением."
                  : "Не удалось удалить."}
              </div>
            )}
            <div className={s.dialogActions}>
              <button className={s.btnGhost}
                onClick={() => { setDeleteConfirm(false); deleteMutation.reset(); }}>
                Отмена
              </button>
              <button className={s.btnDanger}
                onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending && <span className={s.spinnerDark} />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evict confirm */}
      {evictTarget && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Выселить жильца?</div>
            <div className={s.dialogText}>
              <strong>{evictTarget.fio}</strong> будет выселен из комнаты. Комната в карточке студента очистится.
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => setEvictTarget(null)}
                disabled={assignMutation.isPending}>
                Отмена
              </button>
              <button className={s.btnDanger} onClick={handleEvict}
                disabled={assignMutation.isPending}>
                {assignMutation.isPending && <span className={s.spinnerDark} />}
                Выселить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer dialog */}
      {transferTarget && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog} style={{ maxWidth: 440 }}>
            <div className={s.dialogTitle}>Переселить жильца</div>
            <div className={s.dialogText}>
              <strong>{transferTarget.fio}</strong> — выберите новую комнату.
            </div>
            {transferError && (
              <div className={s.errorBanner} style={{ marginBottom: 12 }}>{transferError}</div>
            )}
            <div
              className={s.addSearchWrap}
              style={{ marginBottom: 20 }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setTransferOpen(false);
              }}
            >
              <input
                className={s.addSearchInput}
                placeholder="Введите номер комнаты (напр. 814361)…"
                value={transferRoomId !== null
                  ? (() => {
                    const r = (allRoomsQuery.data ?? []).find(x => x.id === transferRoomId);
                    return r ? `${r.building}-${r.entrance}-${r.room_number}` : transferSearch;
                  })()
                  : transferSearch}
                onChange={(e) => handleTransferSearch(e.target.value)}
                onFocus={() => setTransferOpen(true)}
                autoComplete="off"
              />
              {transferOpen && transferRoomId === null && (
                <div className={s.addDropdown} onMouseDown={(e) => e.preventDefault()}>
                  {allRoomsQuery.isLoading && (
                    <div className={s.addDropdownMsg}>Загрузка…</div>
                  )}
                  {!allRoomsQuery.isLoading && transferRooms.length === 0 && (
                    <div className={s.addDropdownMsg}>Комнат не найдено</div>
                  )}
                  {transferRooms.slice(0, 30).map((r) => {
                    const occupied = r.id === roomId ? occupancy : undefined;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={s.addDropdownItem}
                        onClick={() => {
                          setTransferRoomId(r.id);
                          setTransferSearch(`${r.building}-${r.entrance}-${r.room_number}`);
                          setTransferOpen(false);
                        }}
                      >
                        <div className={s.transferRoomInfo}>
                          <span className={s.transferRoomName}>
                            {r.building}-{r.entrance}-{r.room_number}
                          </span>
                          <span className={s.transferRoomCap}>{r.capacity} мест</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost}
                onClick={() => { setTransferTarget(null); setTransferError(null); }}
                disabled={assignMutation.isPending}>
                Отмена
              </button>
              <button className={s.btnPrimary}
                onClick={handleTransfer}
                disabled={transferRoomId === null || assignMutation.isPending}>
                {assignMutation.isPending && <span className={s.spinner} />}
                Переселить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function IconEdit() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
  </svg>;
}
function IconTrash() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M2 4h10M5 4V2.5h4V4M3 4l.75 7.5h6.5L11 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function IconPlus() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}
function IconTransfer() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M1 4h9M7 1.5L10 4 7 6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 10H4m3 2.5L4 10l3-2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function IconEvict() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>;
}
