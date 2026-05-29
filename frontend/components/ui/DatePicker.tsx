"use client";

import { useState, useRef, useEffect } from "react";
import s from "./DatePicker.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Props {
  /** "date" → value is "YYYY-MM-DD", "datetime" → "YYYY-MM-DDTHH:mm" */
  mode?: "date" | "datetime";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
  disabled?: boolean;
}

// ─── Locale data ────────────────────────────────────────────────────────────

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTH_NOM = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function parse(v: string) {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] != null ? +m[4] : 0, mi: m[5] != null ? +m[5] : 0 };
}

function build(y: number, mo: number, d: number, h: number, mi: number, mode: "date" | "datetime") {
  const date = `${y}-${pad(mo + 1)}-${pad(d)}`;
  return mode === "date" ? date : `${date}T${pad(h)}:${pad(mi)}`;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function displayFmt(v: string, mode: "date" | "datetime") {
  const p = parse(v);
  if (!p) return "";
  const date = `${pad(p.d)}.${pad(p.mo + 1)}.${p.y}`;
  return mode === "date" ? date : `${date}, ${pad(p.h)}:${pad(p.mi)}`;
}

function calDays(y: number, mo: number) {
  const first = new Date(y, mo, 1);
  const lastD = new Date(y, mo + 1, 0).getDate();
  let dow = first.getDay(); // 0=Sun
  dow = dow === 0 ? 6 : dow - 1; // Mon=0

  const cells: { d: number; mo: number; y: number; own: boolean }[] = [];

  const prevMo = mo === 0 ? 11 : mo - 1;
  const prevY  = mo === 0 ? y - 1 : y;
  const prevLast = new Date(y, mo, 0).getDate();
  for (let i = dow - 1; i >= 0; i--) cells.push({ d: prevLast - i, mo: prevMo, y: prevY, own: false });

  for (let d = 1; d <= lastD; d++) cells.push({ d, mo, y, own: true });

  const nextMo = mo === 11 ? 0 : mo + 1;
  const nextY  = mo === 11 ? y + 1 : y;
  let nd = 1;
  while (cells.length % 7 !== 0) cells.push({ d: nd++, mo: nextMo, y: nextY, own: false });

  return cells;
}

// ─── Component ──────────────────────────────────────────────────────────────

const ITEM_H = 36; // px per time item

export function DatePicker({
  mode = "datetime",
  value,
  onChange,
  placeholder,
  className,
  hasError,
  disabled,
}: Props) {
  const parsed  = parse(value);
  const today   = new Date();

  const [open,   setOpen]   = useState(false);
  const [viewY,  setViewY]  = useState(parsed?.y  ?? today.getFullYear());
  const [viewMo, setViewMo] = useState(parsed?.mo ?? today.getMonth());

  // local time state (drives display even before a date is selected)
  const [selH,  setSelH]  = useState(parsed?.h  ?? 0);
  const [selMi, setSelMi] = useState(parsed?.mi ?? 0);

  const rootRef  = useRef<HTMLDivElement>(null);
  const hRef     = useRef<HTMLDivElement>(null);
  const miRef    = useRef<HTMLDivElement>(null);
  const scrolling = useRef(false); // prevent re-entrant scroll updates

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync viewY/viewMo and time when value changes externally
  useEffect(() => {
    if (!parsed) return;
    setViewY(parsed.y); setViewMo(parsed.mo);
    setSelH(parsed.h);  setSelMi(parsed.mi);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Scroll time columns to selected item on open
  useEffect(() => {
    if (!open || mode === "date") return;
    requestAnimationFrame(() => {
      if (hRef.current)  hRef.current.scrollTop  = selH  * ITEM_H - hRef.current.clientHeight  / 2 + ITEM_H / 2;
      if (miRef.current) miRef.current.scrollTop = selMi * ITEM_H - miRef.current.clientHeight / 2 + ITEM_H / 2;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── handlers ──────────────────────────────────────────────────────────────

  function pickDay(cy: number, cmo: number, cd: number) {
    setViewY(cy); setViewMo(cmo);
    onChange(build(cy, cmo, cd, selH, selMi, mode));
    if (mode === "date") setOpen(false);
  }

  function handleHourScroll() {
    if (!hRef.current || scrolling.current) return;
    scrolling.current = true;
    requestAnimationFrame(() => {
      if (!hRef.current) return;
      const h = Math.round(hRef.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(23, h));
      setSelH(clamped);
      if (parsed) onChange(build(parsed.y, parsed.mo, parsed.d, clamped, selMi, mode));
      scrolling.current = false;
    });
  }

  function handleMinScroll() {
    if (!miRef.current || scrolling.current) return;
    scrolling.current = true;
    requestAnimationFrame(() => {
      if (!miRef.current) return;
      const mi = Math.round(miRef.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(59, mi));
      setSelMi(clamped);
      if (parsed) onChange(build(parsed.y, parsed.mo, parsed.d, selH, clamped, mode));
      scrolling.current = false;
    });
  }

  function clickHour(h: number) {
    setSelH(h);
    if (hRef.current) hRef.current.scrollTop = h * ITEM_H - hRef.current.clientHeight / 2 + ITEM_H / 2;
    if (parsed) onChange(build(parsed.y, parsed.mo, parsed.d, h, selMi, mode));
  }

  function clickMinute(mi: number) {
    setSelMi(mi);
    if (miRef.current) miRef.current.scrollTop = mi * ITEM_H - miRef.current.clientHeight / 2 + ITEM_H / 2;
    if (parsed) onChange(build(parsed.y, parsed.mo, parsed.d, selH, mi, mode));
  }

  function goToday() {
    const t = new Date();
    onChange(build(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), mode));
    setOpen(false);
  }

  function prevMonth() {
    if (viewMo === 0) { setViewMo(11); setViewY(y => y - 1); }
    else setViewMo(m => m - 1);
  }
  function nextMonth() {
    if (viewMo === 11) { setViewMo(0); setViewY(y => y + 1); }
    else setViewMo(m => m + 1);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const days    = calDays(viewY, viewMo);
  const display = displayFmt(value, mode);
  const ph      = placeholder ?? (mode === "date" ? "ДД.ММ.ГГГГ" : "ДД.ММ.ГГГГ, --:--");

  return (
    <div ref={rootRef} className={`${s.root} ${className ?? ""}`}>
      {/* ── Trigger ── */}
      <button
        type="button"
        disabled={disabled}
        className={`${s.trigger} ${hasError ? s.triggerError : ""} ${open ? s.triggerOpen : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={display ? "" : s.placeholder}>{display || ph}</span>
        <svg className={s.icon} viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 1.5v3M11 1.5v3M2 7h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* ── Popover ── */}
      {open && (
        <div className={`${s.popover} ${mode === "datetime" ? s.popoverWide : ""}`}>

          {/* Month navigation */}
          <div className={s.header}>
            <button type="button" className={s.navBtn} onClick={prevMonth} aria-label="Предыдущий месяц">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className={s.monthLabel}>{MONTH_NOM[viewMo]} {viewY}</span>
            <button type="button" className={s.navBtn} onClick={nextMonth} aria-label="Следующий месяц">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className={s.body}>
            {/* Calendar */}
            <div className={s.cal}>
              {/* Day-of-week headers */}
              <div className={s.dowRow}>
                {DOW.map(d => <span key={d} className={s.dowCell}>{d}</span>)}
              </div>

              {/* Day grid */}
              <div className={s.grid}>
                {days.map((cell, i) => {
                  const isToday = cell.d === today.getDate() && cell.mo === today.getMonth() && cell.y === today.getFullYear();
                  const isSel   = !!parsed && cell.d === parsed.d && cell.mo === parsed.mo && cell.y === parsed.y;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickDay(cell.y, cell.mo, cell.d)}
                      className={[
                        s.dayBtn,
                        !cell.own  ? s.dayOther : "",
                        isToday    ? s.dayToday : "",
                        isSel      ? s.daySel   : "",
                      ].filter(Boolean).join(" ")}
                    >
                      {cell.d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time picker */}
            {mode === "datetime" && (
              <div className={s.time}>
                <div className={s.timeLabel}>часы</div>
                <div className={s.timeLabel}>мин</div>

                <div className={s.timeCol} ref={hRef} onScroll={handleHourScroll}>
                  <div className={s.timepad} />
                  {Array.from({ length: 24 }, (_, h) => (
                    <button
                      key={h}
                      type="button"
                      className={`${s.timeItem} ${selH === h ? s.timeItemSel : ""}`}
                      onClick={() => clickHour(h)}
                    >
                      {pad(h)}
                    </button>
                  ))}
                  <div className={s.timepad} />
                </div>

                <div className={s.timeSep} />

                <div className={s.timeCol} ref={miRef} onScroll={handleMinScroll}>
                  <div className={s.timepad} />
                  {Array.from({ length: 60 }, (_, m) => (
                    <button
                      key={m}
                      type="button"
                      className={`${s.timeItem} ${selMi === m ? s.timeItemSel : ""}`}
                      onClick={() => clickMinute(m)}
                    >
                      {pad(m)}
                    </button>
                  ))}
                  <div className={s.timepad} />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={s.footer}>
            <button type="button" className={s.footBtn} onClick={() => { onChange(""); setOpen(false); }}>
              Очистить
            </button>
            <button type="button" className={`${s.footBtn} ${s.footBtnAccent}`} onClick={goToday}>
              Сегодня
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
