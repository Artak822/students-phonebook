"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  assignRoom,
  uploadPhoto,
  deletePhoto,
  photoUrl,
  listGroups,
  createGroup,
  getRoommates,
  listStatements,
  createStatement,
  deleteStatement,
} from "@/lib/api/employees";
import type { StatementRead } from "@/lib/api/employees";
import { IllnessBlock } from "./IllnessBlock";
import { listRooms } from "@/lib/api/rooms";
import { HttpError } from "@/lib/api/client";
import { useMe, hasPermission } from "@/lib/hooks/useMe";
import type { RoomRead } from "@/lib/api/rooms";
import s from "./student-form.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────

function calcAge(iso: string): number | null {
  if (!iso || iso.length < 10) return null;
  const bd = new Date(iso);
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

function dmyToIso(dmy: string): string {
  const [d, m, y] = dmy.split(".");
  if (!d || !m || !y || y.length !== 4) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function isoToDmy(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function applyPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let d = digits;
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (d.startsWith("7")) d = d.slice(1);
  d = d.slice(0, 10);
  let out = "+7";
  if (d.length > 0) out += " (" + d.slice(0, 3);
  if (d.length >= 3) out += ") " + d.slice(3, 6);
  if (d.length >= 6) out += "-" + d.slice(6, 8);
  if (d.length >= 8) out += "-" + d.slice(8, 10);
  return out;
}

function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += "." + digits.slice(2, 4);
  if (digits.length > 4) out += "." + digits.slice(4, 8);
  return out;
}

function phoneToApi(masked: string): string {
  const digits = masked.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "7") return "+" + digits;
  if (digits.length === 10) return "+7" + digits;
  return "+" + digits;
}

function ageWord(age: number): string {
  const mod10 = age % 10;
  const mod100 = age % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лет";
  if (mod10 === 1) return "год";
  if (mod10 >= 2 && mod10 <= 4) return "года";
  return "лет";
}

// ─── Representatives ─────────────────────────────────────────────────────

interface Representative {
  role: string;
  fio: string;
  phone: string;
  email: string;
}

const ROLES = ["Мать", "Отец", "Опекун", "Бабушка", "Дедушка", "Другое"];

function parseContacts(raw: string): Representative[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

function serializeContacts(reps: Representative[]): string {
  const nonEmpty = reps.filter((r) => r.role || r.fio || r.phone || r.email);
  return nonEmpty.length > 0 ? JSON.stringify(nonEmpty) : "";
}

interface RepresentativesProps {
  reps: Representative[];
  onChange: (reps: Representative[]) => void;
  editMode: boolean;
}

function RepresentativesList({ reps, onChange, editMode }: RepresentativesProps) {
  function add() {
    onChange([...reps, { role: "Мать", fio: "", phone: "", email: "" }]);
  }
  function remove(i: number) {
    onChange(reps.filter((_, idx) => idx !== i));
  }
  function update(i: number, field: keyof Representative, val: string) {
    onChange(reps.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  if (!editMode) {
    if (reps.length === 0) return <div className={s.viewValue}><span className={s.viewEmpty}>—</span></div>;
    return (
      <div className={s.repViewList}>
        {reps.map((r, i) => (
          <div key={i} className={s.repViewCard}>
            <div className={s.repViewRole}>{r.role}</div>
            <div className={s.repViewName}>{r.fio || <span className={s.viewEmpty}>—</span>}</div>
            <div className={s.repViewMeta}>
              {r.phone && <span>{r.phone}</span>}
              {r.phone && r.email && <span className={s.dot}>·</span>}
              {r.email && <span>{r.email}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={s.repEditList}>
      {reps.map((r, i) => (
        <div key={i} className={s.repEditRow}>
          <select className={s.repRoleSelect} value={r.role} onChange={(e) => update(i, "role", e.target.value)}>
            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <div className={s.repField}>
            <input className={s.input} type="text" placeholder="ФИО" value={r.fio} onChange={(e) => update(i, "fio", e.target.value)} />
          </div>
          <div className={s.repField}>
            <input className={s.input} type="text" placeholder="+7 (___) ___-__-__" value={r.phone} onChange={(e) => update(i, "phone", applyPhoneMask(e.target.value))} />
          </div>
          <div className={s.repField}>
            <input className={s.input} type="email" placeholder="email@example.com" value={r.email} onChange={(e) => update(i, "email", e.target.value)} />
          </div>
          <button type="button" className={s.repDeleteBtn} onClick={() => remove(i)} title="Удалить">
            <IconTrash />
          </button>
        </div>
      ))}
      <button type="button" className={s.repAddBtn} onClick={add}>
        <IconPlus />
        Добавить представителя
      </button>
    </div>
  );
}

// ─── Group combobox ───────────────────────────────────────────────────────

interface GroupComboboxProps {
  value: number | null;
  inputVal: string;
  onInputChange: (v: string) => void;
  onChange: (id: number, name: string) => void;
  error?: string;
}

function GroupCombobox({ value, inputVal, onInputChange, onChange, error }: GroupComboboxProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const groupsQuery = useQuery({
    queryKey: ["groups", inputVal],
    queryFn: () => listGroups(inputVal || undefined),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createGroup(name),
    onSuccess: (group) => {
      onChange(group.id, group.name);
      onInputChange(group.name);
      setOpen(false);
    },
  });

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  const groups = groupsQuery.data ?? [];
  const trimmed = inputVal.trim();
  const exactMatch = groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;

  return (
    <div className={s.comboWrap} ref={wrapRef}>
      <input
        className={`${s.input} ${error ? s.inputError : ""}`}
        type="text"
        placeholder="Введите название группы…"
        value={inputVal}
        onChange={(e) => { onInputChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <div className={s.comboDropdown}>
          {groups.length === 0 && !showCreate && (
            <div className={s.comboEmpty}>Группы не найдены</div>
          )}
          {groups.map((g) => (
            <div key={g.id} className={s.comboOption}
              onMouseDown={() => { onChange(g.id, g.name); onInputChange(g.name); setOpen(false); }}>
              {g.name}
            </div>
          ))}
          {showCreate && (
            <div className={s.comboOptionCreate}
              onMouseDown={() => createMutation.mutate(trimmed)}>
              + Создать группу «{trimmed}»
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Room combobox ────────────────────────────────────────────────────────

interface RoomComboboxProps {
  value: number | null;
  rooms: RoomRead[];
  onChange: (id: number | null) => void;
  disabled?: boolean;
}

function RoomCombobox({ value, rooms, onChange, disabled }: RoomComboboxProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  const selected = rooms.find((r) => r.id === value) ?? null;
  const displayVal = selected
    ? `${selected.building}-${selected.entrance}-${selected.room_number}`
    : "";

  const filtered = rooms.filter((r) => {
    const q = search.trim();
    if (!q) return true;
    const digits = q.replace(/\D/g, "");
    const compact = `${r.building}${r.entrance}${r.room_number}`;
    const full = `${r.building}-${r.entrance}-${r.room_number}`;
    if (digits.length >= 2 && compact.startsWith(digits)) return true;
    return full.includes(q) || String(r.room_number).includes(q);
  });

  function select(id: number | null) {
    onChange(id);
    setSearch("");
    setOpen(false);
  }

  return (
    <div className={s.comboWrap} ref={wrapRef}>
      <div className={s.roomComboInput} data-disabled={disabled}>
        <input
          className={s.input}
          type="text"
          placeholder="Поиск: корпус, подъезд, номер…"
          value={open ? search : displayVal}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => { setSearch(""); setOpen(true); }}
          disabled={disabled}
          autoComplete="off"
        />
        {value !== null && !disabled && (
          <button type="button" className={s.roomClearBtn} onClick={() => select(null)} tabIndex={-1}>
            ×
          </button>
        )}
      </div>
      {open && (
        <div className={s.comboDropdown}>
          {filtered.length === 0 && (
            <div className={s.comboEmpty}>Комнаты не найдены</div>
          )}
          <div className={s.comboOption} onMouseDown={() => select(null)}>
            <span style={{ color: "var(--text-muted)" }}>Без комнаты</span>
          </div>
          {filtered.map((r) => (
            <div
              key={r.id}
              className={`${s.comboOption} ${r.id === value ? s.comboOptionActive : ""}`}
              onMouseDown={() => select(r.id)}
            >
              {r.building}-{r.entrance}-{r.room_number}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Read-only field display ──────────────────────────────────────────────

function ViewField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={s.viewField}>
      <div className={s.viewLabel}>{label}</div>
      <div className={s.viewValue}>{value || <span className={s.viewEmpty}>—</span>}</div>
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────

interface Props {
  empId?: number;
}

export default function StudentForm({ empId }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();

  const canEdit = hasPermission(me, "employees:edit");
  const canDelete = hasPermission(me, "employees:delete");
  const canAssignRoom = hasPermission(me, "employees:assign_room");

  const isNew = empId == null;
  const [editMode, setEditMode] = useState(isNew);

  const empQuery = useQuery({
    queryKey: ["employee", empId],
    queryFn: () => getEmployee(empId!),
    enabled: !isNew,
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: () => listRooms(),
  });

  const roommatesQuery = useQuery({
    queryKey: ["roommates", empId],
    queryFn: () => getRoommates(empId!),
    enabled: !isNew,
  });

  const statementsQuery = useQuery({
    queryKey: ["statements", empId],
    queryFn: () => listStatements(empId!),
    enabled: !isNew,
  });

  const illnessesQuery = useQuery({
    queryKey: ["illnesses", empId],
    queryFn: () => import("@/lib/api/employees").then((m) => m.listIllnesses(empId!)),
    enabled: !isNew,
  });
  const isSick = (illnessesQuery.data ?? []).some((i) => i.end_date === null);

  const emp = empQuery.data;
  const rooms: RoomRead[] = roomsQuery.data ?? [];

  // Form state
  const [fio, setFio] = useState("");
  const [phone, setPhone] = useState("+7");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupInput, setGroupInput] = useState("");
  const [birthDmy, setBirthDmy] = useState("");
  const [notes, setNotes] = useState("");
  const [reps, setReps] = useState<Representative[]>([]);
  const [roomId, setRoomId] = useState<number | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [roomAssigning, setRoomAssigning] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Statements state
  const [stmtDialogOpen, setStmtDialogOpen] = useState(false);
  const [stmtStartInput, setStmtStartInput] = useState("");
  const [stmtEndInput, setStmtEndInput] = useState("");
  const [stmtErrors, setStmtErrors] = useState<Record<string, string>>({});
  const [stmtSaveError, setStmtSaveError] = useState<string | null>(null);
  const [stmtDeleteTarget, setStmtDeleteTarget] = useState<number | null>(null);

  function syncFromEmp() {
    if (!emp) return;
    setFio(emp.fio);
    setPhone(applyPhoneMask(emp.phone));
    setGroupId(emp.group_id);
    setGroupInput(""); // will be resolved from groups query
    setBirthDmy(isoToDmy(emp.birth_date));
    setNotes(emp.notes);
    setReps(parseContacts(emp.contacts ?? ""));
    setRoomId(emp.room_id);
    if (emp.photo_url) setPhotoPreview(photoUrl(emp.id) + "?t=" + Date.now());
    else setPhotoPreview(null);
  }

  useEffect(() => { syncFromEmp(); }, [emp]);

  // Resolve group name for display
  const groupsForName = useQuery({
    queryKey: ["groups", ""],
    queryFn: () => listGroups(),
    staleTime: 60_000,
  });
  const groupName = groupsForName.data?.find((g) => g.id === (emp?.group_id ?? groupId))?.name ?? "";

  // Sync groupInput when groupName resolves
  useEffect(() => {
    if (groupName) setGroupInput(groupName);
  }, [groupName]);

  // Validation
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!fio.trim()) e.fio = "Введите ФИО";
    if (phone.replace(/\D/g, "").length !== 11) e.phone = "Введите полный номер телефона";
    if (!groupId) e.group_id = "Выберите группу";
    if (!dmyToIso(birthDmy)) e.birth_date = "Введите дату в формате ДД.ММ.ГГГГ";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Save
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fio: fio.trim(),
        phone: phoneToApi(phone),
        group_id: groupId!,
        birth_date: dmyToIso(birthDmy),
        notes,
        contacts: serializeContacts(reps),
      };
      return isNew ? createEmployee(payload) : updateEmployee(empId!, payload);
    },
    onSuccess: async (result) => {
      if (photoFile) {
        setPhotoUploading(true);
        try {
          await uploadPhoto(result.id, photoFile);
          setPhotoFile(null);
        } catch { /* non-fatal */ }
        finally { setPhotoUploading(false); }
      }
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee", empId] });

      // Warn about missing optional fields
      const missing: string[] = [];
      if (!photoFile && !result.photo_url) missing.push("фото");
      if (!result.room_id) missing.push("комната");
      if (!serializeContacts(reps)) missing.push("законные представители");

      if (isNew) {
        toast.success("Студент создан");
        if (missing.length > 0)
          toast.warning(`Не заполнено: ${missing.join(", ")}`);
        router.push(`/students/${result.id}`);
      } else {
        setEditMode(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 3000);
        toast.success("Изменения сохранены");
        if (missing.length > 0)
          toast.warning(`Не заполнено: ${missing.join(", ")}`);
      }
    },
    onError: (err: unknown) => {
      if (err instanceof HttpError && err.body.code === "PHONE_ALREADY_EXISTS") {
        const msg = "Студент с таким телефоном уже существует.";
        setSaveError(msg);
        toast.error(msg);
      } else {
        setSaveError("Не удалось сохранить.");
        toast.error("Не удалось сохранить.");
      }
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: () => deleteEmployee(empId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Студент удалён");
      router.push("/students");
    },
    onError: () => toast.error("Не удалось удалить студента."),
  });

  // Room assign
  async function handleRoomAssign(newId: number | null) {
    if (!empId) return;
    setRoomAssigning(true);
    setRoomError(null);
    try {
      await assignRoom(empId, newId);
      setRoomId(newId);
      qc.invalidateQueries({ queryKey: ["employee", empId] });
      toast.success(newId ? "Комната назначена" : "Комната снята");
    } catch (err) {
      if (err instanceof HttpError && err.body.code === "ROOM_FULL") {
        setRoomError("Комната заполнена — нет свободных мест.");
        toast.error("Комната заполнена — нет свободных мест.");
      } else {
        setRoomError("Не удалось изменить комнату.");
        toast.error("Не удалось изменить комнату.");
      }
    }
    finally { setRoomAssigning(false); }
  }

  // Photo
  function handlePhotoFile(file: File) {
    setPhotoError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic"))
        setPhotoError("HEIC не поддерживается. Сохраните как JPEG.");
      else setPhotoError("Допустимые форматы: JPEG, PNG, WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) { setPhotoError("Файл не должен превышать 5 МБ."); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handlePhotoDelete() {
    setPhotoError(null);
    if (photoFile) { setPhotoFile(null); setPhotoPreview(emp?.photo_url ? photoUrl(empId!) + "?t=" + Date.now() : null); return; }
    if (empId && emp?.photo_url) {
      try { await deletePhoto(empId); setPhotoPreview(null); qc.invalidateQueries({ queryKey: ["employee", empId] }); }
      catch { setPhotoError("Не удалось удалить фото."); }
    }
  }

  // Statements
  const stmtCreateMutation = useMutation({
    mutationFn: (payload: { start_date: string; end_date?: string | null }) =>
      createStatement(empId!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["statements", empId] });
      setStmtDialogOpen(false);
      setStmtStartInput("");
      setStmtEndInput("");
      setStmtErrors({});
      setStmtSaveError(null);
      toast.success("Заявление добавлено");
    },
    onError: () => {
      setStmtSaveError("Не удалось сохранить заявление.");
      toast.error("Не удалось сохранить заявление.");
    },
  });

  const stmtDeleteMutation = useMutation({
    mutationFn: (stmtId: number) => deleteStatement(empId!, stmtId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["statements", empId] });
      setStmtDeleteTarget(null);
      toast.success("Заявление удалено");
    },
    onError: () => toast.error("Не удалось удалить заявление."),
  });

  function formatStmtDatetime(iso: string): string {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${day}.${mon}.${year} ${hh}:${mm}`;
  }

  function formatStmtRange(stmt: StatementRead): string {
    const start = formatStmtDatetime(stmt.start_date);
    const end = stmt.end_date ? formatStmtDatetime(stmt.end_date) : "по настоящее время";
    return `${start} — ${end}`;
  }

  // datetime-local value → ISO string with timezone offset
  function localToIso(local: string): string {
    if (!local) return "";
    return new Date(local).toISOString();
  }

  function handleStmtSave() {
    const e: Record<string, string> = {};
    if (!stmtStartInput) e.start = "Укажите дату и время начала";
    if (stmtEndInput && stmtStartInput && stmtEndInput < stmtStartInput)
      e.end = "Конец не может быть раньше начала";
    setStmtErrors(e);
    if (Object.keys(e).length > 0) return;
    stmtCreateMutation.mutate({
      start_date: localToIso(stmtStartInput),
      end_date: stmtEndInput ? localToIso(stmtEndInput) : null,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!validate()) return;
    saveMutation.mutate();
  }

  function handleCancelEdit() {
    syncFromEmp();
    setErrors({});
    setSaveError(null);
    setEditMode(false);
  }

  const isoDate = dmyToIso(birthDmy);
  const age = isoDate ? calcAge(isoDate) : null;
  const isMinor = age !== null && age < 18;
  const isPending = saveMutation.isPending || photoUploading;

  const currentRoom = rooms.find((r) => r.id === (emp?.room_id ?? roomId));
  const roomLabel = currentRoom
    ? `${currentRoom.building}-${currentRoom.entrance}-${currentRoom.room_number}`
    : null;

  // Which optional fields are empty (shown only in view mode for existing students)
  const missingPhoto = !isNew && !editMode && !emp?.photo_url && !photoPreview;
  const missingRoom  = !isNew && !editMode && !emp?.room_id;
  const missingReps  = !isNew && !editMode && !emp?.contacts?.trim();

  if (!isNew && empQuery.isLoading) {
    return (
      <div className={s.page}>
        <div className={s.loadingState}>Загрузка…</div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <button type="button" className={s.backBtn} title="Назад" onClick={() => router.back()}>
          <IconChevronLeft />
        </button>
        <div className={s.headerMeta}>
          <h1 className={s.pageTitle}>
            {isNew ? "Новый студент" : (emp?.fio ?? "Студент")}
            {isSick && <span className={s.sickBadge} title="Болеет">✕</span>}
          </h1>
        </div>
        <div className={s.headerActions}>
          {!isNew && (
            <Link href={`/students/${empId}/history`} className={s.btnGhost}>
              <IconHistory />
              История
            </Link>
          )}
          {!isNew && !editMode && canEdit && (
            <button className={s.btnPrimary} onClick={() => { if (groupName) setGroupInput(groupName); setEditMode(true); }}>
              <IconEdit />
              Редактировать
            </button>
          )}
        </div>
      </div>

      {savedOk && <div className={s.successBanner}>Изменения сохранены.</div>}

      {/* ── Layout ── */}
      <form onSubmit={handleSubmit}>
        <div className={s.layout}>

          {/* ── Left column: Photo + Room ── */}
          <div className={s.leftCol}>

            {/* Photo */}
            <div className={`${s.section} ${missingPhoto ? s.sectionMissing : ""}`}>
              <div className={s.sectionTitle}>
                Фото
                {missingPhoto && <span className={s.missingHint}>не загружено</span>}
              </div>
              <div className={s.photoBlock}>
                <div className={s.photoFrame}>
                  {photoPreview ? (
                    <img src={photoPreview} alt="Фото студента" className={s.photoImg} />
                  ) : (
                    <div className={s.photoPlaceholder}><IconUser /></div>
                  )}
                </div>
                {editMode && canEdit && (
                  <div className={s.photoActions}>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = ""; }} />
                    <button type="button" className={s.btnSmall} onClick={() => fileInputRef.current?.click()}>
                      {photoPreview ? "Заменить" : "Загрузить"}
                    </button>
                    {photoPreview && (
                      <button type="button" className={s.btnSmallDanger} onClick={handlePhotoDelete}>
                        Удалить
                      </button>
                    )}
                    {photoError && <span className={s.fieldError}>{photoError}</span>}
                    <span className={s.photoHint}>JPEG, PNG, WebP · до 5 МБ</span>
                  </div>
                )}
              </div>
            </div>

            {/* Room */}
            {!isNew && (
              <div className={`${s.section} ${missingRoom ? s.sectionMissing : ""}`}>
                <div className={s.sectionTitle}>
                  Комната
                  {missingRoom && <span className={s.missingHint}>не назначена</span>}
                </div>
                {editMode && canAssignRoom ? (
                  <div className={s.field}>
                    <RoomCombobox
                      value={roomId}
                      rooms={rooms}
                      onChange={handleRoomAssign}
                      disabled={roomAssigning}
                    />
                    {roomError && <span className={s.fieldError}>{roomError}</span>}
                  </div>
                ) : (
                  currentRoom ? (
                    <Link href={`/rooms/${currentRoom.id}`} className={s.roomLink}>
                      {roomLabel}
                    </Link>
                  ) : (
                    <span className={s.viewEmpty}>Не назначена</span>
                  )
                )}
              </div>
            )}
            {/* Roommates */}
            {!isNew && emp?.room_id && (
              <div className={s.section}>
                <div className={s.sectionTitle}>Соседи</div>
                {roommatesQuery.isLoading && (
                  <div className={s.viewValue} style={{ color: "var(--text-muted)" }}>Загрузка…</div>
                )}
                {!roommatesQuery.isLoading && (roommatesQuery.data ?? []).length === 0 && (
                  <div className={s.viewEmpty}>Нет соседей</div>
                )}
                {!roommatesQuery.isLoading && (roommatesQuery.data ?? []).length > 0 && (
                  <div className={s.roommateList}>
                    {(roommatesQuery.data ?? []).map((r) => (
                      <Link key={r.id} href={`/students/${r.id}`} className={s.roommateRow}>
                        <div className={s.roommateAvatar}>
                          {r.photo_url ? (
                            <img src={photoUrl(r.id)} alt="" className={s.roommateAvatarImg}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <span className={s.roommateAvatarInitial}>{r.fio.trim()[0] ?? "?"}</span>
                          )}
                        </div>
                        <span className={s.roommateName}>{r.fio}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right column: Main info + Contacts + Notes + Footer ── */}
          <div className={s.rightCol}>
          <div className={s.rightPanel}>

            {/* Main info */}
            <div className={s.section}>
              <div className={s.sectionTitle}>Основные данные</div>

              {editMode ? (
                <>
                  <div className={s.field}>
                    <label className={s.label}>ФИО</label>
                    <input className={`${s.input} ${errors.fio ? s.inputError : ""}`}
                      type="text" placeholder="Фамилия Имя Отчество"
                      value={fio} onChange={(e) => setFio(e.target.value)} />
                    {errors.fio && <span className={s.fieldError}>{errors.fio}</span>}
                  </div>

                  <div className={s.fieldRow}>
                    <div className={s.field}>
                      <label className={s.label}>Телефон</label>
                      <input className={`${s.input} ${errors.phone ? s.inputError : ""}`}
                        type="text" placeholder="+7 (___) ___-__-__"
                        value={phone} onChange={(e) => setPhone(applyPhoneMask(e.target.value))} />
                      {errors.phone && <span className={s.fieldError}>{errors.phone}</span>}
                    </div>
                    <div className={s.field}>
                      <label className={s.label}>Дата рождения</label>
                      <div className={s.birthRow}>
                        <input className={`${s.input} ${errors.birth_date ? s.inputError : ""}`}
                          type="text" placeholder="ДД.ММ.ГГГГ" maxLength={10}
                          value={birthDmy} onChange={(e) => setBirthDmy(applyDateMask(e.target.value))} />
                        {age !== null && (
                          <span className={s.ageLabel}>{age} {ageWord(age)}</span>
                        )}
                        {isMinor && <span className={s.minorBadge}>несов.</span>}
                      </div>
                      {errors.birth_date && <span className={s.fieldError}>{errors.birth_date}</span>}
                    </div>
                  </div>

                  <div className={s.field}>
                    <label className={s.label}>Группа</label>
                    <GroupCombobox value={groupId} inputVal={groupInput}
                      onInputChange={setGroupInput}
                      onChange={(id, name) => { setGroupId(id); setGroupInput(name); setErrors((e) => ({ ...e, group_id: "" })); }}
                      error={errors.group_id} />
                    {errors.group_id && <span className={s.fieldError}>{errors.group_id}</span>}
                  </div>
                </>
              ) : (
                <>
                  <ViewField label="ФИО" value={emp?.fio} />
                  <div className={s.viewRow}>
                    <ViewField label="Телефон" value={emp?.phone} />
                    <ViewField label="Дата рождения" value={emp?.birth_date ? (() => {
                      const a = calcAge(emp.birth_date);
                      return `${isoToDmy(emp.birth_date)}${a !== null ? ` (${a} ${ageWord(a)})` : ""}`;
                    })() : undefined} />
                  </div>
                  <ViewField label="Группа" value={groupName || undefined} />
                </>
              )}
            </div>

            {/* Statements */}
            {!isNew && (
              <div className={s.section}>
                <div className={s.sectionTitleRow}>
                  <div className={s.sectionTitle}>Заявления</div>
                  {canEdit && (
                    <button
                      type="button"
                      className={s.btnAddStmt}
                      onClick={() => { setStmtDialogOpen(true); setStmtStartInput(""); setStmtEndInput(""); setStmtErrors({}); setStmtSaveError(null); }}
                    >
                      <IconPlus />
                      Добавить
                    </button>
                  )}
                </div>
                {statementsQuery.isLoading && (
                  <div className={s.viewEmpty}>Загрузка…</div>
                )}
                {!statementsQuery.isLoading && (statementsQuery.data ?? []).length === 0 && (
                  <div className={s.viewEmpty}>Нет заявлений</div>
                )}
                {!statementsQuery.isLoading && (statementsQuery.data ?? []).length > 0 && (
                  <div className={s.stmtList}>
                    {(statementsQuery.data ?? []).map((stmt) => (
                      <div key={stmt.id} className={s.stmtRow}>
                        <div className={s.stmtRange}>{formatStmtRange(stmt)}</div>
                        {canEdit && (
                          <button
                            type="button"
                            className={s.stmtDeleteBtn}
                            title="Удалить заявление"
                            onClick={() => setStmtDeleteTarget(stmt.id)}
                          >
                            <IconTrash />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Illnesses */}
            {!isNew && (
              <div className={s.section}>
                <div className={s.sectionTitle}>Болезни</div>
                <IllnessBlock empId={empId!} canEdit={canEdit} />
              </div>
            )}

            {/* Contacts */}
            <div className={`${s.section} ${missingReps ? s.sectionMissing : ""}`}>
              <div className={s.sectionTitle}>
                Законные представители
                {missingReps && <span className={s.missingHint}>не указаны</span>}
              </div>
              <RepresentativesList reps={reps} onChange={setReps} editMode={editMode} />
            </div>

            {/* Notes */}
            <div className={s.section}>
              <div className={s.sectionTitle}>Заметки</div>
              {editMode ? (
                <div className={s.field}>
                  <textarea className={s.textarea}
                    placeholder="Дополнительная информация…"
                    value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                  <p style={{ marginTop: 6, fontSize: 12, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚠️</span>
                    <span>Это поле не предназначено для медицинских и дисциплинарных сведений</span>
                  </p>
                </div>
              ) : (
                <ViewField label="" value={notes || undefined} />
              )}
            </div>

          </div>{/* /rightPanel */}

            {/* Form footer */}
            {editMode && (
              <div className={s.formFooter}>
                {saveError && <div className={s.errorBanner}>{saveError}</div>}
                <div className={s.footerActions}>
                  {!isNew && canDelete && (
                    <button type="button" className={s.btnDanger} onClick={() => setDeleteConfirm(true)}>
                      <IconTrash />
                      Удалить
                    </button>
                  )}
                  <div className={s.footerSpacer} />
                  {!isNew && (
                    <button type="button" className={s.btnGhost} onClick={handleCancelEdit}>
                      Отмена
                    </button>
                  )}
                  {isNew && (
                    <Link href="/students" className={s.btnGhost}>Отмена</Link>
                  )}
                  <button type="submit" className={s.btnPrimary} disabled={isPending}>
                    {isPending && <span className={s.spinner} />}
                    {isNew ? "Создать" : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </form>

      {/* Add statement dialog */}
      {stmtDialogOpen && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog} style={{ maxWidth: 460 }}>
            <div className={s.dialogTitle}>Добавить заявление</div>
            {stmtSaveError && (
              <div className={s.errorBanner} style={{ marginBottom: 12 }}>{stmtSaveError}</div>
            )}
            <div className={s.stmtDialogFields}>
              <div className={s.field}>
                <label className={s.label}>Начало</label>
                <DatePicker
                  mode="datetime"
                  value={stmtStartInput}
                  onChange={setStmtStartInput}
                  hasError={!!stmtErrors.start}
                />
                {stmtErrors.start && <span className={s.fieldError}>{stmtErrors.start}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>Окончание</label>
                <DatePicker
                  mode="datetime"
                  value={stmtEndInput}
                  onChange={setStmtEndInput}
                  hasError={!!stmtErrors.end}
                />
                {stmtErrors.end && <span className={s.fieldError}>{stmtErrors.end}</span>}
              </div>
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost}
                onClick={() => setStmtDialogOpen(false)}
                disabled={stmtCreateMutation.isPending}>
                Отмена
              </button>
              <button className={s.btnPrimary}
                onClick={handleStmtSave}
                disabled={stmtCreateMutation.isPending}>
                {stmtCreateMutation.isPending && <span className={s.spinner} />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete statement confirm */}
      {stmtDeleteTarget !== null && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Удалить заявление?</div>
            <div className={s.dialogText}>
              Заявление будет удалено без возможности восстановления.
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => setStmtDeleteTarget(null)}
                disabled={stmtDeleteMutation.isPending}>
                Отмена
              </button>
              <button className={s.btnDanger} onClick={() => stmtDeleteMutation.mutate(stmtDeleteTarget)}
                disabled={stmtDeleteMutation.isPending}>
                {stmtDeleteMutation.isPending && <span className={s.spinnerDark} />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Удалить студента?</div>
            <div className={s.dialogText}>
              Карточка <strong>{emp?.fio}</strong> будет помечена как удалённая.
            </div>
            {deleteMutation.isError && (
              <div className={s.errorBanner} style={{ marginBottom: 16 }}>Не удалось удалить.</div>
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
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────

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
function IconHistory() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" />
    <path d="M7 4.5V7.5l2 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
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
function IconUser() {
  return <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
    <circle cx="20" cy="14" r="7" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 34c0-7.5 6.5-12 15-12s15 4.5 15 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}
