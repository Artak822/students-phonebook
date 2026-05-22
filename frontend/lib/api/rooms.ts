import { apiJson } from "@/lib/api/client";

export interface RoomRead {
  id: number;
  building: number;
  entrance: number;
  room_number: number;
  capacity: number;
  created_at: string;
  updated_at: string;
}

export interface RoomCreatePayload {
  building: number;
  entrance: number;
  room_number: number;
  capacity: number;
}

export interface RoomUpdatePayload {
  building?: number;
  entrance?: number;
  room_number?: number;
  capacity?: number;
}

export interface BulkCreateItem {
  room_number: number;
  capacity: number;
}

export interface BulkCreateRequest {
  building: number;
  entrance: number;
  items: BulkCreateItem[];
}

export interface BulkCreateResult {
  created: number;
  skipped: number;
  skipped_numbers: number[];
}

export interface RoomStudent {
  id: number;
  fio: string;
  phone: string;
}

export function listRooms(params?: { building?: number; entrance?: number }): Promise<RoomRead[]> {
  const q = new URLSearchParams();
  if (params?.building != null) q.set("building", String(params.building));
  if (params?.entrance != null) q.set("entrance", String(params.entrance));
  const qs = q.toString();
  return apiJson<RoomRead[]>(`/api/rooms${qs ? `?${qs}` : ""}`);
}

export function createRoom(payload: RoomCreatePayload): Promise<RoomRead> {
  return apiJson<RoomRead>("/api/rooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRoom(id: number, payload: RoomUpdatePayload): Promise<RoomRead> {
  return apiJson<RoomRead>(`/api/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteRoom(id: number): Promise<void> {
  return apiJson<void>(`/api/rooms/${id}`, { method: "DELETE" });
}

export function bulkCreateRooms(payload: BulkCreateRequest): Promise<BulkCreateResult> {
  return apiJson<BulkCreateResult>("/api/rooms/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRoomStudents(id: number): Promise<RoomStudent[]> {
  return apiJson<RoomStudent[]>(`/api/rooms/${id}/students`);
}
