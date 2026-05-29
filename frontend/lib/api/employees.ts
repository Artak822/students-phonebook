import { apiFetch, apiJson } from "@/lib/api/client";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EmployeeRead {
  id: number;
  fio: string;
  phone: string;
  group_id: number;
  birth_date: string; // ISO date "YYYY-MM-DD"
  photo_url: string | null;
  room_id: number | null;
  notes: string;
  contacts: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeListResponse {
  items: EmployeeRead[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface EmployeeCreatePayload {
  fio: string;
  phone: string;
  group_id: number;
  birth_date: string;
  notes?: string;
}

export interface EmployeeUpdatePayload {
  fio?: string;
  phone?: string;
  group_id?: number;
  birth_date?: string;
  notes?: string;
  contacts?: string;
}

export interface HistoryEntry {
  id: number;
  employee_id: number;
  admin_id: number | null;
  admin_fio: string | null;
  action: "create" | "update" | "delete";
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface HistoryResponse {
  items: HistoryEntry[];
}

export interface GroupRead {
  id: number;
  name: string;
  created_at: string;
}

// ─── Groups ─────────────────────────────────────────────────────────────────

export function listGroups(search?: string): Promise<GroupRead[]> {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  const qs = q.toString();
  return apiJson<GroupRead[]>(`/api/groups${qs ? `?${qs}` : ""}`);
}

export function createGroup(name: string): Promise<GroupRead> {
  return apiJson<GroupRead>("/api/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

// ─── Employees ──────────────────────────────────────────────────────────────

export interface EmployeeListParams {
  search?: string;
  group_id?: number;
  building?: number;
  room_id?: number;
  sick?: boolean;
  page?: number;
  limit?: number;
}

export function listEmployees(params: EmployeeListParams = {}): Promise<EmployeeListResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.group_id != null) q.set("group_id", String(params.group_id));
  if (params.building != null) q.set("building", String(params.building));
  if (params.room_id != null) q.set("room_id", String(params.room_id));
  if (params.sick != null) q.set("sick", String(params.sick));
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiJson<EmployeeListResponse>(`/api/employees${qs ? `?${qs}` : ""}`);
}

export function getEmployee(id: number): Promise<EmployeeRead> {
  return apiJson<EmployeeRead>(`/api/employees/${id}`);
}

export function createEmployee(payload: EmployeeCreatePayload): Promise<EmployeeRead> {
  return apiJson<EmployeeRead>("/api/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEmployee(id: number, payload: EmployeeUpdatePayload): Promise<EmployeeRead> {
  return apiJson<EmployeeRead>(`/api/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEmployee(id: number): Promise<void> {
  return apiJson<void>(`/api/employees/${id}`, { method: "DELETE" });
}

export function assignRoom(id: number, room_id: number | null): Promise<EmployeeRead> {
  return apiJson<EmployeeRead>(`/api/employees/${id}/room`, {
    method: "PATCH",
    body: JSON.stringify({ room_id }),
  });
}

export function getEmployeeHistory(id: number): Promise<HistoryResponse> {
  return apiJson<HistoryResponse>(`/api/employees/${id}/history`);
}

export function getRoommates(id: number): Promise<EmployeeRead[]> {
  return apiJson<EmployeeRead[]>(`/api/employees/${id}/roommates`);
}

export async function uploadPhoto(id: number, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  // Use raw fetch — browser must set Content-Type with multipart boundary automatically.
  // apiFetch always injects "Content-Type: application/json" which breaks multipart parsing.
  const res = await fetch(`/api/employees/${id}/photo`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ code: "UPLOAD_ERROR", message: "Ошибка загрузки" }));
    const { HttpError } = await import("@/lib/api/client");
    throw new HttpError(res.status, body);
  }
}

export function deletePhoto(id: number): Promise<void> {
  return apiJson<void>(`/api/employees/${id}/photo`, { method: "DELETE" });
}

export function photoUrl(id: number): string {
  return `/api/employees/${id}/photo`;
}

// ─── Statements ─────────────────────────────────────────────────────────────

export interface StatementRead {
  id: number;
  employee_id: number;
  start_date: string; // ISO datetime
  end_date: string | null;
  created_at: string;
}

export interface StatementCreatePayload {
  start_date: string; // ISO datetime
  end_date?: string | null;
}

export function listStatements(id: number): Promise<StatementRead[]> {
  return apiJson<StatementRead[]>(`/api/employees/${id}/statements`);
}

export function createStatement(id: number, payload: StatementCreatePayload): Promise<StatementRead> {
  return apiJson<StatementRead>(`/api/employees/${id}/statements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteStatement(id: number, stmtId: number): Promise<void> {
  return apiJson<void>(`/api/employees/${id}/statements/${stmtId}`, { method: "DELETE" });
}

// ─── Illnesses ───────────────────────────────────────────────────────────────

export interface IllnessNoteRead {
  id: number;
  illness_id: number;
  admin_id: number | null;
  note: string;
  date: string; // ISO date
  created_at: string;
}

export interface IllnessRead {
  id: number;
  employee_id: number;
  temp_room_id: number | null;
  start_date: string; // ISO date
  end_date: string | null;
  created_at: string;
  notes: IllnessNoteRead[];
}

export interface IllnessCreatePayload {
  temp_room_id?: number | null;
  start_date: string;
  first_note?: string;
}

export interface IllnessNoteCreatePayload {
  note: string;
  date: string;
}

export interface IllnessRecoverPayload {
  end_date: string;
  final_note?: string;
}

export interface IllnessUpdatePayload {
  temp_room_id: number | null;
}

export function updateIllness(id: number, illnessId: number, payload: IllnessUpdatePayload): Promise<IllnessRead> {
  return apiJson<IllnessRead>(`/api/employees/${id}/illnesses/${illnessId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listIllnesses(id: number): Promise<IllnessRead[]> {
  return apiJson<IllnessRead[]>(`/api/employees/${id}/illnesses`);
}

export function createIllness(id: number, payload: IllnessCreatePayload): Promise<IllnessRead> {
  return apiJson<IllnessRead>(`/api/employees/${id}/illnesses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addIllnessNote(id: number, illnessId: number, payload: IllnessNoteCreatePayload): Promise<IllnessNoteRead> {
  return apiJson<IllnessNoteRead>(`/api/employees/${id}/illnesses/${illnessId}/notes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteIllness(id: number, illnessId: number): Promise<void> {
  return apiJson<void>(`/api/employees/${id}/illnesses/${illnessId}`, { method: "DELETE" });
}

export function recoverIllness(id: number, illnessId: number, payload: IllnessRecoverPayload): Promise<IllnessRead> {
  return apiJson<IllnessRead>(`/api/employees/${id}/illnesses/${illnessId}/recover`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
