"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listRooms, createRoom, updateRoom, deleteRoom } from "@/lib/api/rooms";
import type { RoomRead } from "@/lib/api/rooms";
import { HttpError } from "@/lib/api/client";
import { useMe, hasPermission } from "@/lib/hooks/useMe";
import s from "./rooms.module.css";

// ─── Schema ────────────────────────────────────────────────────────────

const roomSchema = z.object({
  building: z.coerce.number().min(1, "Укажите корпус"),
  entrance: z.coerce.number().min(1, "Укажите подъезд"),
  room_number: z.coerce.number().min(1, "Укажите номер"),
  capacity: z.coerce.number().min(1, "Вместимость не менее 1"),
});

type RoomForm = z.infer<typeof roomSchema>;

// ─── Main page ──────────────────────────────────────────────────────────

export default function RoomsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();

  const canManage = hasPermission(me, "rooms:manage");

  const [filterBuilding, setFilterBuilding] = useState<number | undefined>(undefined);
  const [filterEntrance, setFilterEntrance] = useState<number | undefined>(undefined);
  const [panel, setPanel] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<RoomRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoomRead | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── Query ────────────────────────────────────────────────────────────

  // Загружаем все комнаты без серверной фильтрации — список небольшой,
  // клиентская фильтрация позволяет корректно строить опции фильтров.
  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: () => listRooms(),
  });

  const allRooms = roomsQuery.data ?? [];

  const rooms = useMemo(() => {
    let data = allRooms;
    if (filterBuilding) data = data.filter((r) => r.building === filterBuilding);
    if (filterEntrance) data = data.filter((r) => r.entrance === filterEntrance);
    return data;
  }, [allRooms, filterBuilding, filterEntrance]);

  const buildings = useMemo(
    () => Array.from(new Set(allRooms.map((r) => r.building))).sort((a, b) => a - b),
    [allRooms]
  );

  const entrances = useMemo(() => {
    const src = filterBuilding ? allRooms.filter((r) => r.building === filterBuilding) : allRooms;
    return Array.from(new Set(src.map((r) => r.entrance))).sort((a, b) => a - b);
  }, [allRooms, filterBuilding]);

  // ─── Form ─────────────────────────────────────────────────────────────

  const form = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
    defaultValues: { building: 1, entrance: 1, room_number: undefined, capacity: 2 },
  });

  // ─── Create mutation ──────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: RoomForm) => createRoom(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setPanel(null);
      form.reset();
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof HttpError && err.body.code === "ROOM_DUPLICATE"
          ? "Комната с таким адресом уже существует."
          : "Не удалось создать комнату."
      );
    },
  });

  // ─── Edit mutation ────────────────────────────────────────────────────

  const editMutation = useMutation({
    mutationFn: (data: RoomForm) => updateRoom(editTarget!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setPanel(null);
      setEditTarget(null);
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof HttpError && err.body.code === "ROOM_DUPLICATE"
          ? "Комната с таким адресом уже существует."
          : "Не удалось сохранить изменения."
      );
    },
  });

  const openEdit = useCallback(
    (room: RoomRead) => {
      setEditTarget(room);
      setFormError(null);
      form.reset({
        building: room.building,
        entrance: room.entrance,
        room_number: room.room_number,
        capacity: room.capacity,
      });
      setPanel("edit");
    },
    [form]
  );

  const openCreate = useCallback(() => {
    setFormError(null);
    form.reset({ building: 1, entrance: 1, room_number: undefined, capacity: 2 });
    setPanel("create");
  }, [form]);

  // ─── Delete mutation ──────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRoom(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setDeleteTarget(null);
    },
  });

  const onSubmit = (data: RoomForm) => {
    setFormError(null);
    if (panel === "create") createMutation.mutate(data);
    else if (panel === "edit") editMutation.mutate(data);
  };

  const isPending = createMutation.isPending || editMutation.isPending;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Комнаты</h1>
          {!roomsQuery.isLoading && (
            <div className={s.pageMeta}>{rooms.length} комнат</div>
          )}
        </div>
        {canManage && (
          <div className={s.headerActions}>
            <Link href="/rooms/bulk-create" className={s.btnGhost}>
              <IconGrid />
              Добавить пачкой
            </Link>
            <button className={s.btnPrimary} onClick={openCreate}>
              <IconPlus />
              Добавить
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={s.filters}>
        <select
          className={s.filterSelect}
          value={filterBuilding ?? ""}
          onChange={(e) => {
            setFilterBuilding(e.target.value ? Number(e.target.value) : undefined);
            setFilterEntrance(undefined);
          }}
        >
          <option value="">Все корпуса</option>
          {buildings.map((b) => (
            <option key={b} value={b}>Корпус {b}</option>
          ))}
        </select>
        <select
          className={s.filterSelect}
          value={filterEntrance ?? ""}
          onChange={(e) => setFilterEntrance(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">Все подъезды</option>
          {entrances.map((e) => (
            <option key={e} value={e}>Подъезд {e}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Корпус</th>
              <th>Подъезд</th>
              <th>Номер комнаты</th>
              <th>Вместимость</th>
              {canManage && <th className={s.colActions}></th>}
            </tr>
          </thead>
          <tbody>
            {roomsQuery.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className={s.skeletonRow}>
                  <td><div className={s.skeletonBar} style={{ width: 40 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 40 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 60 }} /></td>
                  <td><div className={s.skeletonBar} style={{ width: 50 }} /></td>
                  {canManage && <td><div className={s.skeletonBar} style={{ width: 60, marginLeft: "auto" }} /></td>}
                </tr>
              ))}

            {!roomsQuery.isLoading && rooms.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4}>
                  <div className={s.emptyState}>
                    <div className={s.emptyStateTitle}>Нет комнат</div>
                    <div className={s.emptyStateText}>
                      {filterBuilding || filterEntrance
                        ? "Попробуйте изменить фильтры."
                        : canManage
                        ? "Добавьте первую комнату или создайте пачкой."
                        : "Комнаты пока не добавлены."}
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {!roomsQuery.isLoading &&
              rooms.map((room) => (
                <tr key={room.id}>
                  <td className={s.numericCell}>{room.building}</td>
                  <td className={s.numericCell}>{room.entrance}</td>
                  <td className={s.numericCell}>{room.room_number}</td>
                  <td className={s.numericCell}>{room.capacity}</td>
                  {canManage && (
                    <td className={s.colActions}>
                      <div className={s.actions}>
                        <button
                          className={s.iconBtn}
                          title="Редактировать"
                          onClick={() => openEdit(room)}
                        >
                          <IconEdit />
                        </button>
                        <button
                          className={`${s.iconBtn} ${s.danger}`}
                          title="Удалить"
                          onClick={() => setDeleteTarget(room)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* ─── Create / Edit panel ─────────────────── */}

      {(panel === "create" || panel === "edit") && (
        <>
          <div className={s.overlay} onClick={() => setPanel(null)} />
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>
                {panel === "create" ? "Новая комната" : "Редактировать комнату"}
              </div>
              <button className={s.panelClose} onClick={() => setPanel(null)}>
                <IconX />
              </button>
            </div>
            <form
              className={s.panelBody}
              onSubmit={form.handleSubmit(onSubmit)}
              id="room-form"
            >
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>Корпус</label>
                  <input
                    className={`${s.input} ${form.formState.errors.building ? s.inputError : ""}`}
                    type="number"
                    min={1}
                    {...form.register("building")}
                  />
                  {form.formState.errors.building && (
                    <span className={s.fieldError}>{form.formState.errors.building.message}</span>
                  )}
                </div>
                <div className={s.field}>
                  <label className={s.label}>Подъезд</label>
                  <input
                    className={`${s.input} ${form.formState.errors.entrance ? s.inputError : ""}`}
                    type="number"
                    min={1}
                    {...form.register("entrance")}
                  />
                  {form.formState.errors.entrance && (
                    <span className={s.fieldError}>{form.formState.errors.entrance.message}</span>
                  )}
                </div>
              </div>
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>Номер комнаты</label>
                  <input
                    className={`${s.input} ${form.formState.errors.room_number ? s.inputError : ""}`}
                    type="number"
                    min={1}
                    placeholder="101"
                    {...form.register("room_number")}
                  />
                  {form.formState.errors.room_number && (
                    <span className={s.fieldError}>{form.formState.errors.room_number.message}</span>
                  )}
                </div>
                <div className={s.field}>
                  <label className={s.label}>Вместимость</label>
                  <input
                    className={`${s.input} ${form.formState.errors.capacity ? s.inputError : ""}`}
                    type="number"
                    min={1}
                    {...form.register("capacity")}
                  />
                  {form.formState.errors.capacity && (
                    <span className={s.fieldError}>{form.formState.errors.capacity.message}</span>
                  )}
                </div>
              </div>
              {formError && <div className={s.errorBanner}>{formError}</div>}
            </form>
            <div className={s.panelFooter}>
              <button className={s.btnGhost} onClick={() => setPanel(null)}>
                Отмена
              </button>
              <button
                className={s.btnPrimary}
                form="room-form"
                type="submit"
                disabled={isPending}
              >
                {isPending && <span className={s.spinner} />}
                {panel === "create" ? "Создать" : "Сохранить"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Delete confirm ───────────────────────── */}

      {deleteTarget && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Удалить комнату?</div>
            <div className={s.dialogText}>
              Комната <strong>
                {deleteTarget.building}/{deleteTarget.entrance}/{deleteTarget.room_number}
              </strong> будет удалена. Это действие необратимо.
            </div>
            {deleteMutation.isError && (
              <div className={s.errorBanner} style={{ marginBottom: 16 }}>
                {deleteMutation.error instanceof HttpError &&
                deleteMutation.error.body.code === "ROOM_HAS_STUDENTS"
                  ? "В комнате есть жильцы. Выселите их перед удалением."
                  : "Не удалось удалить комнату."}
              </div>
            )}
            <div className={s.dialogActions}>
              <button
                className={s.btnGhost}
                onClick={() => {
                  setDeleteTarget(null);
                  deleteMutation.reset();
                }}
              >
                Отмена
              </button>
              <button
                className={s.btnDanger}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <span className={s.spinnerDark} />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 4h10M5 4V2.5h4V4M3 4l.75 7.5h6.5L11 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
