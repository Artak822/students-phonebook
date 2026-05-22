"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { bulkCreateRooms } from "@/lib/api/rooms";
import type { BulkCreateItem, BulkCreateResult } from "@/lib/api/rooms";
import { HttpError } from "@/lib/api/client";
import s from "./bulk-create.module.css";

// ─── Range parser ─────────────────────────────────────────────────────────

function parseRange(input: string): number[] {
  const str = input.trim();
  if (!str) throw new Error("Строка диапазона не может быть пустой");

  const numbers = new Set<number>();
  const excluded = new Set<number>();

  const parts = str.split(",").map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const isExclusion = part.startsWith("!");
    const token = isExclusion ? part.slice(1).trim() : part;

    let range: number[];

    if (token.includes("-")) {
      const [startStr, endStr] = token.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) throw new Error(`Неверный формат диапазона: ${token}`);
      if (start > end) throw new Error(`Начало диапазона больше конца: ${token}`);
      if (end - start > 10_000) throw new Error(`Диапазон слишком велик (макс. 10 000): ${token}`);
      range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    } else {
      const n = parseInt(token, 10);
      if (isNaN(n)) throw new Error(`Неверный формат номера: ${token}`);
      range = [n];
    }

    for (const n of range) {
      if (isExclusion) excluded.add(n);
      else numbers.add(n);
    }
  }

  const result = Array.from(numbers).filter((n) => !excluded.has(n)).sort((a, b) => a - b);

  if (result.length === 0) throw new Error("Диапазон не содержит ни одного номера после применения исключений");

  for (const n of result) {
    if (n <= 0) throw new Error(`Номер комнаты должен быть > 0, получен: ${n}`);
  }

  return result;
}

// ─── Step 1 schema ───────────────────────────────────────────────────────

const step1Schema = z.object({
  building: z.coerce.number().min(1, "Укажите корпус"),
  entrance: z.coerce.number().min(1, "Укажите подъезд"),
  range: z.string().min(1, "Введите диапазон"),
  defaultCapacity: z.coerce.number().min(1, "Вместимость не менее 1"),
});

type Step1Form = z.infer<typeof step1Schema>;

// ─── Main ────────────────────────────────────────────────────────────────

export default function BulkCreatePage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [params, setParams] = useState<{ building: number; entrance: number } | null>(null);
  const [items, setItems] = useState<BulkCreateItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateResult | null>(null);

  const form = useForm<Step1Form>({
    resolver: zodResolver(step1Schema),
    defaultValues: { building: 1, entrance: 1, range: "", defaultCapacity: 2 },
  });

  const onStep1 = (data: Step1Form) => {
    setParseError(null);
    try {
      const numbers = parseRange(data.range);
      setParams({ building: data.building, entrance: data.entrance });
      setItems(numbers.map((n) => ({ room_number: n, capacity: data.defaultCapacity })));
      setStep(2);
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      bulkCreateRooms({ building: params!.building, entrance: params!.entrance, items }),
    onSuccess: (res) => {
      setResult(res);
    },
    onError: (err: unknown) => {
      setSubmitError(
        err instanceof HttpError ? err.body.message : "Не удалось создать комнаты."
      );
    },
  });

  const updateCapacity = (index: number, value: string) => {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) {
      setItems((prev) => prev.map((item, i) => (i === index ? { ...item, capacity: n } : item)));
    }
  };

  return (
    <div className={s.page}>
      <Link href="/rooms" className={s.backLink}>
        <IconArrowLeft />
        К списку комнат
      </Link>

      <h1 className={s.pageTitle}>Добавить комнаты пачкой</h1>
      <p className={s.pageSubtitle}>
        Укажите диапазон номеров — система создаст все комнаты за один запрос.
      </p>

      {/* Steps indicator */}
      <div className={s.steps}>
        <div className={`${s.step} ${step === 1 ? s.active : s.done}`}>
          <div className={s.stepNum}>{step === 1 ? "1" : <IconCheck />}</div>
          Параметры
        </div>
        <div className={s.stepSep} />
        <div className={`${s.step} ${step === 2 ? s.active : ""}`}>
          <div className={s.stepNum}>2</div>
          Предпросмотр
        </div>
      </div>

      {/* ─── Step 1 ─────────────────────────────────── */}

      {step === 1 && (
        <div className={s.card}>
          <div className={s.cardTitle}>Параметры комнат</div>
          <form className={s.form} onSubmit={form.handleSubmit(onStep1)}>
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

            <div className={s.field}>
              <label className={s.label}>Диапазон номеров</label>
              <input
                className={`${s.input} ${form.formState.errors.range || parseError ? s.inputError : ""}`}
                placeholder="1001-1020"
                {...form.register("range")}
              />
              {form.formState.errors.range && (
                <span className={s.fieldError}>{form.formState.errors.range.message}</span>
              )}
              {parseError && <span className={s.fieldError}>{parseError}</span>}
              <div className={s.hint}>
                Форматы:{" "}
                <span className={s.hintCode}>1001-1020</span>{", "}
                <span className={s.hintCode}>1001,1002,1003</span>{", "}
                <span className={s.hintCode}>1001-1010,1020-1030</span>{", "}
                <span className={s.hintCode}>1001-1020,!1010</span>
              </div>
            </div>

            <div className={s.field} style={{ maxWidth: 200 }}>
              <label className={s.label}>Вместимость по умолчанию</label>
              <input
                className={`${s.input} ${form.formState.errors.defaultCapacity ? s.inputError : ""}`}
                type="number"
                min={1}
                {...form.register("defaultCapacity")}
              />
              {form.formState.errors.defaultCapacity && (
                <span className={s.fieldError}>{form.formState.errors.defaultCapacity.message}</span>
              )}
            </div>

            <div className={s.formActions}>
              <button className={s.btnPrimary} type="submit">
                Далее
                <IconArrowRight />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Step 2 ─────────────────────────────────── */}

      {step === 2 && !result && (
        <div className={s.card}>
          <div className={s.previewHeader}>
            <div className={s.cardTitle} style={{ marginBottom: 0 }}>
              Корпус {params?.building}, подъезд {params?.entrance}
            </div>
            <div className={s.previewCount}>{items.length} комнат</div>
          </div>

          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Вместимость</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.room_number}>
                    <td className={s.roomNumCell}>{item.room_number}</td>
                    <td>
                      <input
                        type="number"
                        className={s.capacityInput}
                        min={1}
                        value={item.capacity}
                        onChange={(e) => updateCapacity(i, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {submitError && <div className={s.errorBanner}>{submitError}</div>}

          <div className={s.formActions}>
            <button
              className={s.btnGhost}
              onClick={() => {
                setStep(1);
                setSubmitError(null);
                mutation.reset();
              }}
            >
              <IconArrowLeft />
              Назад
            </button>
            <button
              className={s.btnPrimary}
              onClick={() => {
                setSubmitError(null);
                mutation.mutate();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <span className={s.spinner} />}
              Создать {items.length} комнат
            </button>
          </div>
        </div>
      )}

      {/* ─── Result ──────────────────────────────────── */}

      {result && (
        <div className={s.card}>
          <div className={s.successBanner}>
            <div className={s.successTitle}>
              Создано {result.created} {numWord(result.created, "комната", "комнаты", "комнат")}
            </div>
            {result.skipped > 0 && (
              <div className={s.skippedNote}>
                Пропущено {result.skipped} — уже существовали (номера: {result.skipped_numbers.join(", ")})
              </div>
            )}
          </div>
          <div className={s.formActions}>
            <Link href="/rooms" className={s.btnPrimary}>
              К списку комнат
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function numWord(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few;
  return many;
}

// ─── Icons ────────────────────────────────────────────────────────────────

function IconArrowLeft() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
