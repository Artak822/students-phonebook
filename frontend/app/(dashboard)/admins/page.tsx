"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  listAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  resetAdminPassword,
} from "@/lib/api/admins";
import { listRoles } from "@/lib/api/roles";
import type { AdminRead, AdminCreateResponse } from "@/lib/api/types";
import { HttpError } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/useMe";
import { useToast } from "@/lib/toast";
import s from "./admins.module.css";

const LIMIT = 20;

// ─── Schemas ───────────────────────────────────────────────────────────

const createSchema = z.object({
  username: z.string().min(3, "Минимум 3 символа").max(64),
  fio: z.string().min(1, "Введите ФИО").max(256),
  role_id: z.coerce.number().min(1, "Выберите роль"),
  is_active: z.boolean(),
});

const editSchema = z.object({
  fio: z.string().min(1, "Введите ФИО").max(256),
  role_id: z.coerce.number().min(1, "Выберите роль"),
  is_active: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

// ─── Main page ──────────────────────────────────────────────────────────

export default function AdminsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterRoleId, setFilterRoleId] = useState<number | undefined>(undefined);
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);

  const [panel, setPanel] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<AdminRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRead | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminRead | null>(null);
  const [createdPassword, setCreatedPassword] = useState<{ fio: string; password: string } | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────────────

  const adminsQuery = useQuery({
    queryKey: ["admins", page, search, filterRoleId, filterActive],
    queryFn: () => listAdmins({ page, limit: LIMIT, search: search || undefined, role_id: filterRoleId, is_active: filterActive }),
    placeholderData: (prev) => prev,
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    staleTime: 60_000,
  });

  // ─── Create mutation ──────────────────────────────────────────────────

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: "", fio: "", role_id: 0, is_active: true },
  });

  const [createError, setCreateError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => createAdmin(data),
    onSuccess: (result: AdminCreateResponse) => {
      qc.invalidateQueries({ queryKey: ["admins"] });
      setPanel(null);
      createForm.reset();
      setCreatedPassword({ fio: result.fio, password: result.generated_password });
      toast.success("Администратор создан");
    },
    onError: (err: unknown) => {
      const msg = err instanceof HttpError && err.body.code === "USERNAME_ALREADY_EXISTS"
        ? "Это имя пользователя уже занято."
        : "Не удалось создать администратора.";
      setCreateError(msg);
      toast.error(msg);
    },
  });

  // ─── Edit mutation ────────────────────────────────────────────────────

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  const [editError, setEditError] = useState<string | null>(null);
  const editMutation = useMutation({
    mutationFn: (data: EditForm) => updateAdmin(editTarget!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admins"] });
      setPanel(null);
      setEditTarget(null);
      toast.success("Изменения сохранены");
    },
    onError: () => {
      setEditError("Не удалось сохранить изменения.");
      toast.error("Не удалось сохранить изменения.");
    },
  });

  const openEdit = useCallback((admin: AdminRead) => {
    setEditTarget(admin);
    setEditError(null);
    editForm.reset({ fio: admin.fio, role_id: admin.role.id, is_active: admin.is_active });
    setPanel("edit");
  }, [editForm]);

  // ─── Delete mutation ──────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdmin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admins"] });
      setDeleteTarget(null);
      toast.success("Администратор удалён");
    },
    onError: () => toast.error("Не удалось удалить администратора."),
  });

  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ─── Reset password mutation ──────────────────────────────────────────

  const resetMutation = useMutation({
    mutationFn: (id: number) => resetAdminPassword(id),
    onSuccess: (result) => {
      setResetTarget(null);
      setResetPassword(result.generated_password);
      toast.info("Пароль сброшен");
    },
    onError: () => toast.error("Не удалось сбросить пароль."),
  });

  // ─── Copy helper ──────────────────────────────────────────────────────

  const copyPassword = (pw: string) => {
    navigator.clipboard.writeText(pw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────

  const data = adminsQuery.data;
  const roles = rolesQuery.data ?? [];
  const isLoading = adminsQuery.isLoading;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Администраторы</h1>
          {data && (
            <div className={s.pageMeta}>
              {data.total} {plural(data.total, "администратор", "администратора", "администраторов")}
            </div>
          )}
        </div>
        <button className={s.btnPrimary} onClick={() => { createForm.reset({ username: "", fio: "", role_id: 0, is_active: true }); setCreateError(null); setPanel("create"); }}>
          <IconPlus />
          Создать
        </button>
      </div>

      {/* Filters */}
      <div className={s.filters}>
        <div className={s.searchWrap}>
          <IconSearch className={s.searchIcon} />
          <input
            className={s.searchInput}
            placeholder="Поиск по имени или ФИО"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className={s.filterSelect}
          value={filterRoleId ?? ""}
          onChange={(e) => { setFilterRoleId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
        >
          <option value="">Все роли</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select
          className={s.filterSelect}
          value={filterActive === undefined ? "" : String(filterActive)}
          onChange={(e) => { setFilterActive(e.target.value === "" ? undefined : e.target.value === "true"); setPage(1); }}
        >
          <option value="">Все статусы</option>
          <option value="true">Активные</option>
          <option value="false">Неактивные</option>
        </select>
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>ФИО / Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Дата создания</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className={s.skeletonRow}>
                <td><div className={s.skeletonBar} style={{ width: "70%" }} /></td>
                <td><div className={s.skeletonBar} style={{ width: "80px" }} /></td>
                <td><div className={s.skeletonBar} style={{ width: "60px" }} /></td>
                <td><div className={s.skeletonBar} style={{ width: "90px" }} /></td>
                <td><div className={s.skeletonBar} style={{ width: "60px", marginLeft: "auto" }} /></td>
              </tr>
            ))}

            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className={s.emptyState}>
                    <div className={s.emptyStateTitle}>Нет администраторов</div>
                    <div className={s.emptyStateText}>
                      {search ? "Попробуйте изменить фильтры." : "Создайте первого администратора."}
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {!isLoading && data?.items.map((admin) => (
              <tr key={admin.id}>
                <td>
                  <div className={s.cellPrimary}>{admin.fio}</div>
                  <div className={s.cellSecondary}>{admin.username}</div>
                </td>
                <td>
                  <span className={`${s.badge} ${s.badgeRole}`}>{admin.role.label}</span>
                </td>
                <td>
                  <span className={`${s.badge} ${admin.is_active ? s.badgeActive : s.badgeInactive}`}>
                    {admin.is_active ? "Активен" : "Отключён"}
                  </span>
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                  {formatDate(admin.created_at)}
                </td>
                <td>
                  <div className={s.actions}>
                    <button className={s.iconBtn} title="Редактировать" onClick={() => openEdit(admin)}>
                      <IconEdit />
                    </button>
                    <button className={s.iconBtn} title="Сбросить пароль" onClick={() => setResetTarget(admin)}>
                      <IconKey />
                    </button>
                    {me?.id !== admin.id && (
                      <button className={`${s.iconBtn} ${s.danger}`} title="Удалить" onClick={() => setDeleteTarget(admin)}>
                        <IconTrash />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className={s.pagination}>
            <span className={s.paginationInfo}>
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, data.total)} из {data.total}
            </span>
            <div className={s.paginationButtons}>
              <button className={s.pageBtn} disabled={page === 1} onClick={() => setPage(1)}>«</button>
              <button className={s.pageBtn} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              {paginationRange(page, data.total_pages).map((p) =>
                p === "…" ? (
                  <span key={p} className={s.pageBtn} style={{ border: "none", cursor: "default" }}>…</span>
                ) : (
                  <button
                    key={p}
                    className={`${s.pageBtn} ${p === page ? s.pageBtnActive : ""}`}
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </button>
                )
              )}
              <button className={s.pageBtn} disabled={page === data.total_pages} onClick={() => setPage((p) => p + 1)}>›</button>
              <button className={s.pageBtn} disabled={page === data.total_pages} onClick={() => setPage(data.total_pages)}>»</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Create panel ────────────────────────────────────── */}

      {panel === "create" && (
        <>
          <div className={s.overlay} onClick={() => setPanel(null)} />
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Новый администратор</div>
              <button className={s.panelClose} onClick={() => setPanel(null)}><IconX /></button>
            </div>
            <form
              className={s.panelBody}
              onSubmit={createForm.handleSubmit((data) => { setCreateError(null); createMutation.mutate(data); })}
              id="create-form"
            >
              <div className={s.field}>
                <label className={s.label}>Имя пользователя</label>
                <input
                  className={`${s.input} ${createForm.formState.errors.username ? s.inputError : ""}`}
                  placeholder="ivanov"
                  {...createForm.register("username")}
                />
                {createForm.formState.errors.username && (
                  <span className={s.fieldError}>{createForm.formState.errors.username.message}</span>
                )}
              </div>
              <div className={s.field}>
                <label className={s.label}>ФИО</label>
                <input
                  className={`${s.input} ${createForm.formState.errors.fio ? s.inputError : ""}`}
                  placeholder="Иванов Иван Иванович"
                  {...createForm.register("fio")}
                />
                {createForm.formState.errors.fio && (
                  <span className={s.fieldError}>{createForm.formState.errors.fio.message}</span>
                )}
              </div>
              <div className={s.field}>
                <label className={s.label}>Роль</label>
                <select
                  className={`${s.select} ${createForm.formState.errors.role_id ? s.inputError : ""}`}
                  {...createForm.register("role_id")}
                >
                  <option value={0}>Выберите роль</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                {createForm.formState.errors.role_id && (
                  <span className={s.fieldError}>{createForm.formState.errors.role_id.message}</span>
                )}
              </div>
              <label className={s.checkboxRow}>
                <input type="checkbox" {...createForm.register("is_active")} />
                <span className={s.checkboxLabel}>Активен</span>
              </label>
              {createError && <div className={s.errorBanner}>{createError}</div>}
            </form>
            <div className={s.panelFooter}>
              <button className={s.btnGhost} onClick={() => setPanel(null)}>Отмена</button>
              <button
                className={s.btnPrimary}
                form="create-form"
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <span className={s.spinner} />}
                Создать
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Edit panel ──────────────────────────────────────── */}

      {panel === "edit" && editTarget && (
        <>
          <div className={s.overlay} onClick={() => setPanel(null)} />
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Редактировать</div>
              <button className={s.panelClose} onClick={() => setPanel(null)}><IconX /></button>
            </div>
            <form
              className={s.panelBody}
              onSubmit={editForm.handleSubmit((data) => { setEditError(null); editMutation.mutate(data); })}
              id="edit-form"
            >
              <div style={{ padding: "6px 12px", background: "var(--bg)", borderRadius: "var(--radius-sm)", marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Пользователь</div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{editTarget.username}</div>
              </div>
              <div className={s.field}>
                <label className={s.label}>ФИО</label>
                <input
                  className={`${s.input} ${editForm.formState.errors.fio ? s.inputError : ""}`}
                  {...editForm.register("fio")}
                />
                {editForm.formState.errors.fio && (
                  <span className={s.fieldError}>{editForm.formState.errors.fio.message}</span>
                )}
              </div>
              <div className={s.field}>
                <label className={s.label}>Роль</label>
                <select className={s.select} {...editForm.register("role_id")}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <label className={s.checkboxRow}>
                <input type="checkbox" {...editForm.register("is_active")} />
                <span className={s.checkboxLabel}>Активен</span>
              </label>
              {editError && <div className={s.errorBanner}>{editError}</div>}
            </form>
            <div className={s.panelFooter}>
              <button className={s.btnGhost} onClick={() => setPanel(null)}>Отмена</button>
              <button
                className={s.btnPrimary}
                form="edit-form"
                type="submit"
                disabled={editMutation.isPending}
              >
                {editMutation.isPending && <span className={s.spinner} />}
                Сохранить
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Delete confirm ───────────────────────────────────── */}

      {deleteTarget && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Удалить администратора?</div>
            <div className={s.dialogText}>
              <strong>{deleteTarget.fio}</strong> ({deleteTarget.username}) будет удалён. Это действие необратимо.
            </div>
            {deleteMutation.isError && (
              <div className={s.errorBanner} style={{ marginBottom: 16 }}>
                {deleteMutation.error instanceof HttpError && deleteMutation.error.body.code === "LAST_SUPER_ADMIN"
                  ? "Нельзя удалить последнего суперадминистратора."
                  : "Не удалось удалить администратора."}
              </div>
            )}
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => { setDeleteTarget(null); deleteMutation.reset(); }}>Отмена</button>
              <button
                className={s.btnDanger}
                onClick={() => { setDeleteError(null); deleteMutation.mutate(deleteTarget.id); }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <span className={s.spinnerDark} />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reset password confirm ───────────────────────────── */}

      {resetTarget && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog}>
            <div className={s.dialogTitle}>Сбросить пароль?</div>
            <div className={s.dialogText}>
              Для <strong>{resetTarget.fio}</strong> будет создан новый пароль. Текущий пароль и все активные сессии будут аннулированы.
            </div>
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => setResetTarget(null)}>Отмена</button>
              <button
                className={s.btnPrimary}
                onClick={() => resetMutation.mutate(resetTarget.id)}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending && <span className={s.spinner} />}
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Created password reveal ──────────────────────────── */}

      {createdPassword && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog} style={{ maxWidth: 440 }}>
            <div className={s.dialogTitle}>Администратор создан</div>
            <div className={s.dialogText}>
              Передайте пароль <strong>{createdPassword.fio}</strong> — он отображается только один раз.
            </div>
            <div className={s.passwordReveal}>
              <div className={s.passwordRevealTitle}>
                <IconKey style={{ width: 14, height: 14 }} />
                Сгенерированный пароль
              </div>
              <div className={s.passwordRevealWarn}>
                Запишите или скопируйте пароль прямо сейчас. После закрытия этого окна увидеть его снова будет невозможно.
              </div>
              <div className={s.passwordBox}>
                <div className={s.passwordValue}>{createdPassword.password}</div>
                <button className={s.copyBtn} onClick={() => copyPassword(createdPassword.password)}>
                  <IconCopy style={{ width: 12, height: 12 }} />
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
            </div>
            <div className={s.dialogActions} style={{ marginTop: 16 }}>
              <button className={s.btnPrimary} onClick={() => { setCreatedPassword(null); setCopied(false); }}>
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reset password reveal ─────────────────────────────── */}

      {resetPassword && (
        <div className={s.dialogOverlay}>
          <div className={s.dialog} style={{ maxWidth: 440 }}>
            <div className={s.dialogTitle}>Пароль сброшен</div>
            <div className={s.dialogText}>
              Новый пароль отображается только один раз. Передайте его пользователю.
            </div>
            <div className={s.passwordReveal}>
              <div className={s.passwordRevealTitle}>
                <IconKey style={{ width: 14, height: 14 }} />
                Новый пароль
              </div>
              <div className={s.passwordBox}>
                <div className={s.passwordValue}>{resetPassword}</div>
                <button className={s.copyBtn} onClick={() => copyPassword(resetPassword)}>
                  <IconCopy style={{ width: 12, height: 12 }} />
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
            </div>
            <div className={s.dialogActions} style={{ marginTop: 16 }}>
              <button className={s.btnPrimary} onClick={() => { setResetPassword(null); setCopied(false); }}>
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function paginationRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

// ─── Icons ────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function IconKey({ style }: { style?: React.CSSProperties } = {}) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={style}>
      <circle cx="5.5" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 8l4 4M10 8.5l1 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 4h10M5 4V2.5h4V4M3 4l.75 7.5h6.5L11 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 8H1.5A.5.5 0 0 1 1 7.5V1.5A.5.5 0 0 1 1.5 1h6A.5.5 0 0 1 8 1.5V2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
