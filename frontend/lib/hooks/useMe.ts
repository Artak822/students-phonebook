"use client";

import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/types";

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: () => apiJson<MeResponse>("/api/auth/me"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function hasPermission(me: MeResponse | undefined, perm: string): boolean {
  return me?.permissions?.includes(perm) ?? false;
}
