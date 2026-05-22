import { apiJson } from "@/lib/api/client";
import type { RoleRead } from "./types";

export function listRoles(): Promise<RoleRead[]> {
  return apiJson<RoleRead[]>("/api/roles");
}

export interface CreateRolePayload {
  name: string;
  label: string;
  description?: string;
  permissions: string[];
}

export function createRole(payload: CreateRolePayload): Promise<RoleRead> {
  return apiJson<RoleRead>("/api/roles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface UpdateRolePayload {
  label?: string;
  description?: string;
  permissions?: string[];
}

export function updateRole(id: number, payload: UpdateRolePayload): Promise<RoleRead> {
  return apiJson<RoleRead>(`/api/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteRole(id: number): Promise<void> {
  return apiJson<void>(`/api/roles/${id}`, { method: "DELETE" });
}
