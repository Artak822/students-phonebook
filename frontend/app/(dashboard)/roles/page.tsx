"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listRoles, createRole, updateRole, deleteRole } from "@/lib/api/roles";
import type { RoleRead } from "@/lib/api/types";
import { ALL_PERMISSIONS, PERMISSION_LABEL } from "@/lib/api/types";
import { HttpError } from "@/lib/api/client";
import s from "./roles.module.css";

// ─── Schemas ───────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z
    .string()
    .min(1, "Введите идентификатор")
    .max(64)
    .regex(/^[a-z_]+$/, "Только строчные латинские буквы и знак «_»"),
  label: z.string().min(1, "Введите название").max(128),
  description: z.string().max(512).optional(),
  permissions: z.array(z.string()),
});

const editSchema = z.object({
  label: z.string().min(1, "Введите название").max(128),
  description: z.string().max(512).optional(),
  permissions: z.array(z.string()),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

// ─── Main page ──────────────────────────────────────────────────────────

export default function RolesPage() {
  const qc = useQueryClient();

  const [panel, setPanel] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<RoleRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleRead | null>(null);

  // ─── Queries ──────────────────────────────────────────────────────────

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
  });

  // ─── Create mutation ──────────────────────────────────────────────────

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", label: "", description: "", permissions: [] },
  });

  const [createError, setCreateError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => createRole(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setPanel(null);
      createForm.reset();
    },
    onError: (err: unknown) => {
      setCreateError(
        err instanceof HttpError && err.body.code === "ROLE_ALREADY_EXISTS"
          ? "Роль с таким идентификатором уже существует."
          : "Не удалось создать роль."
      );
    },
  });

  // ─── Edit mutation ────────────────────────────────────────────────────

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  const [editError, setEditError] = useState<string | null>(null);
  const editMutation = useMutation({
    mutationFn: (data: EditForm) => updateRole(editTarget!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setPanel(null);
      setEditTarget(null);
    },
    onError: () => setEditError("Не удалось сохранить изменения."),
  });

  const openEdit = (role: RoleRead) => {
    setEditTarget(role);
    setEditError(null);
    editForm.reset({
      label: role.label,
      description: role.description,
      permissions: role.permissions,
    });
    setPanel("edit");
  };

  // ─── Delete mutation ──────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setDeleteTarget(null);
    },
  });

  // ─── Render ───────────────────────────────────────────────────────────

  const roles = rolesQuery.data ?? [];
  const isLoading = rolesQuery.isLoading;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Роли</h1>
          {!isLoading && (
            <div className={s.pageMeta}>
              {roles.length} {roles.length === 1 ? "роль" : roles.length >= 2 && roles.length <= 4 ? "роли" : "ролей"}
            </div>
          )}
        </div>
        <button
          className={s.btnPrimary}
          onClick={() => { createForm.reset({ name: "", label: "", description: "", permissions: [] }); setCreateError(null); setPanel("create"); }}
        >
          <IconPlus />
          Создать роль
        </button>
      </div>

      {/* List */}
      <div className={s.list}>
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={s.skeletonRow}>
            <div className={s.skeletonBar} style={{ width: "40%", marginBottom: 8 }} />
            <div className={s.skeletonBar} style={{ width: "60%", marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className={s.skeletonBar} style={{ width: 80, height: 20, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        ))}

        {!isLoading && roles.length === 0 && (
          <div className={s.emptyState}>
            <div className={s.emptyStateTitle}>Нет ролей</div>
            <div className={s.emptyStateText}>Создайте первую роль, чтобы начать.</div>
          </div>
        )}

        {!isLoading && roles.map((role) => (
          <div key={role.id} className={s.roleRow}>
            <div className={s.roleLeft}>
              <div className={s.roleNameRow}>
                <span className={s.roleName}>{role.name}</span>
              </div>
              <div className={s.roleLabel}>{role.label}</div>
              {role.description && (
                <div className={s.roleDesc}>{role.description}</div>
              )}
              <div className={s.permissionChips}>
                {role.permissions.length === 0 ? (
                  <span className={s.noPerms}>Нет прав</span>
                ) : (
                  role.permissions.map((perm) => (
                    <span key={perm} className={s.chip}>
                      {PERMISSION_LABEL[perm] ?? perm}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className={s.roleRight}>
              {role.is_system ? (
                <span className={`${s.badge} ${s.badgeSystem}`}>системная</span>
              ) : (
                <>
                  <button className={s.iconBtn} title="Редактировать" onClick={() => openEdit(role)}>
                    <IconEdit />
                  </button>
                  <button className={`${s.iconBtn} ${s.danger}`} title="Удалить" onClick={() => setDeleteTarget(role)}>
                    <IconTrash />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Create panel ─────────────────────────────────────── */}

      {panel === "create" && (
        <>
          <div className={s.overlay} onClick={() => setPanel(null)} />
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Новая роль</div>
              <button className={s.panelClose} onClick={() => setPanel(null)}><IconX /></button>
            </div>
            <form
              className={s.panelBody}
              id="create-role-form"
              onSubmit={createForm.handleSubmit((data) => { setCreateError(null); createMutation.mutate(data); })}
            >
              <div className={s.field}>
                <label className={s.label}>
                  Идентификатор
                  <span className={s.labelHint}>только a–z и _</span>
                </label>
                <input
                  className={`${s.input} ${createForm.formState.errors.name ? s.inputError : ""}`}
                  placeholder="my_role"
                  {...createForm.register("name")}
                />
                {createForm.formState.errors.name && (
                  <span className={s.fieldError}>{createForm.formState.errors.name.message}</span>
                )}
              </div>
              <div className={s.field}>
                <label className={s.label}>Название</label>
                <input
                  className={`${s.input} ${createForm.formState.errors.label ? s.inputError : ""}`}
                  placeholder="Воспитатель"
                  {...createForm.register("label")}
                />
                {createForm.formState.errors.label && (
                  <span className={s.fieldError}>{createForm.formState.errors.label.message}</span>
                )}
              </div>
              <div className={s.field}>
                <label className={s.label}>Описание <span className={s.labelHint}>необязательно</span></label>
                <textarea
                  className={s.textarea}
                  placeholder="Краткое описание назначения роли"
                  {...createForm.register("description")}
                />
              </div>
              <div className={s.permSection}>
                <label className={s.label}>Права доступа</label>
                <Controller
                  control={createForm.control}
                  name="permissions"
                  render={({ field }) => (
                    <PermissionChecklist value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
              {createError && <div className={s.errorBanner}>{createError}</div>}
            </form>
            <div className={s.panelFooter}>
              <button className={s.btnGhost} onClick={() => setPanel(null)}>Отмена</button>
              <button
                className={s.btnPrimary}
                form="create-role-form"
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
              <div className={s.panelTitle}>Редактировать роль</div>
              <button className={s.panelClose} onClick={() => setPanel(null)}><IconX /></button>
            </div>
            <form
              className={s.panelBody}
              id="edit-role-form"
              onSubmit={editForm.handleSubmit((data) => { setEditError(null); editMutation.mutate(data); })}
            >
              <div style={{ padding: "6px 12px", background: "var(--bg)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Идентификатор</div>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 500 }}>{editTarget.name}</div>
              </div>
              <div className={s.field}>
                <label className={s.label}>Название</label>
                <input
                  className={`${s.input} ${editForm.formState.errors.label ? s.inputError : ""}`}
                  {...editForm.register("label")}
                />
                {editForm.formState.errors.label && (
                  <span className={s.fieldError}>{editForm.formState.errors.label.message}</span>
                )}
              </div>
              <div className={s.field}>
                <label className={s.label}>Описание <span className={s.labelHint}>необязательно</span></label>
                <textarea className={s.textarea} {...editForm.register("description")} />
              </div>
              <div className={s.permSection}>
                <label className={s.label}>Права доступа</label>
                <Controller
                  control={editForm.control}
                  name="permissions"
                  render={({ field }) => (
                    <PermissionChecklist value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
              {editError && <div className={s.errorBanner}>{editError}</div>}
            </form>
            <div className={s.panelFooter}>
              <button className={s.btnGhost} onClick={() => setPanel(null)}>Отмена</button>
              <button
                className={s.btnPrimary}
                form="edit-role-form"
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
            <div className={s.dialogTitle}>Удалить роль?</div>
            <div className={s.dialogText}>
              Роль <strong>{deleteTarget.label}</strong> будет удалена. Убедитесь, что ни один администратор не использует её.
            </div>
            {deleteMutation.isError && (
              <div className={s.errorBanner} style={{ marginBottom: 16 }}>Не удалось удалить роль.</div>
            )}
            <div className={s.dialogActions}>
              <button className={s.btnGhost} onClick={() => { setDeleteTarget(null); deleteMutation.reset(); }}>Отмена</button>
              <button
                className={s.btnDanger}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <span className={s.spinnerDark} />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Permission checklist ──────────────────────────────────────────────

function PermissionChecklist({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (key: string) => {
    onChange(
      value.includes(key) ? value.filter((p) => p !== key) : [...value, key]
    );
  };
  return (
    <div className={s.permList}>
      {ALL_PERMISSIONS.map(({ key, label }) => (
        <label key={key} className={s.permItem}>
          <input
            type="checkbox"
            checked={value.includes(key)}
            onChange={() => toggle(key)}
          />
          <span className={s.permItemLabel}>{label}</span>
        </label>
      ))}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
