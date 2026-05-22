import { apiJson } from "@/lib/api/client";
import type {
  AdminRead,
  AdminListResponse,
  AdminCreateResponse,
  GeneratedPasswordResponse,
} from "./types";

export interface ListAdminsParams {
  search?: string;
  role_id?: number;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export function listAdmins(params: ListAdminsParams): Promise<AdminListResponse> {
  const q = new URLSearchParams();
  if (params.search)                    q.set("search", params.search);
  if (params.role_id != null)           q.set("role_id", String(params.role_id));
  if (params.is_active != null)         q.set("is_active", String(params.is_active));
  if (params.page != null)              q.set("page", String(params.page));
  if (params.limit != null)             q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiJson<AdminListResponse>(`/api/admins${qs ? `?${qs}` : ""}`);
}

export interface CreateAdminPayload {
  username: string;
  fio: string;
  role_id: number;
  is_active: boolean;
}

export function createAdmin(payload: CreateAdminPayload): Promise<AdminCreateResponse> {
  return apiJson<AdminCreateResponse>("/api/admins", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface UpdateAdminPayload {
  fio?: string;
  role_id?: number;
  is_active?: boolean;
}

export function updateAdmin(id: number, payload: UpdateAdminPayload): Promise<AdminRead> {
  return apiJson<AdminRead>(`/api/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdmin(id: number): Promise<void> {
  return apiJson<void>(`/api/admins/${id}`, { method: "DELETE" });
}

export function resetAdminPassword(id: number): Promise<GeneratedPasswordResponse> {
  return apiJson<GeneratedPasswordResponse>(`/api/admins/${id}/reset-password`, {
    method: "POST",
  });
}
