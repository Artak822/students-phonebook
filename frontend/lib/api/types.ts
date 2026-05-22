export interface MeResponse {
  id: number;
  username: string;
  fio: string;
  role: string;
  permissions: string[];
}

export interface RoleShort {
  id: number;
  name: string;
  label: string;
}

export interface AdminRead {
  id: number;
  username: string;
  fio: string;
  role: RoleShort;
  is_active: boolean;
  password_changed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminListResponse {
  items: AdminRead[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AdminCreateResponse extends AdminRead {
  generated_password: string;
}

export interface GeneratedPasswordResponse {
  generated_password: string;
}

export interface RoleRead {
  id: number;
  name: string;
  label: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  created_at: string;
}

export const ALL_PERMISSIONS: { key: string; label: string }[] = [
  { key: "employees:view",        label: "Жильцы: просмотр" },
  { key: "employees:edit",        label: "Жильцы: редактирование" },
  { key: "employees:delete",      label: "Жильцы: удаление" },
  { key: "employees:assign_room", label: "Жильцы: назначение комнат" },
  { key: "rooms:view",            label: "Комнаты: просмотр" },
  { key: "rooms:manage",          label: "Комнаты: управление" },
  { key: "admins:manage",         label: "Администраторы: управление" },
  { key: "roles:manage",          label: "Роли: управление" },
  { key: "history:view",          label: "История: просмотр" },
];

export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries(
  ALL_PERMISSIONS.map(({ key, label }) => [key, label])
);
