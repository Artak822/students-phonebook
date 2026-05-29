"use client";

import { createContext, useCallback, useContext, useReducer, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

type Action =
  | { type: "ADD"; toast: Toast }
  | { type: "REMOVE"; id: number };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case "ADD":
      return [...state.slice(-4), action.toast]; // max 5
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ToastContextValue {
  toasts: Toast[];
  dispatch: React.Dispatch<Action>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);
  return (
    <ToastContext.Provider value={{ toasts, dispatch }}>
      {children}
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

let nextId = 0;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  const { dispatch } = ctx;

  const timerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timerRef.current.get(id);
    if (t) clearTimeout(t);
    timerRef.current.delete(id);
    dispatch({ type: "REMOVE", id });
  }, [dispatch]);

  const show = useCallback((kind: ToastKind, message: string, duration = kind === "error" ? 5000 : 3500) => {
    const id = ++nextId;
    dispatch({ type: "ADD", toast: { id, kind, message } });
    const timer = setTimeout(() => dismiss(id), duration);
    timerRef.current.set(id, timer);
    return id;
  }, [dispatch, dismiss]);

  return {
    success: (msg: string) => show("success", msg),
    error:   (msg: string) => show("error",   msg),
    info:    (msg: string) => show("info",     msg),
    dismiss,
  };
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used inside ToastProvider");
  return ctx.toasts;
}
