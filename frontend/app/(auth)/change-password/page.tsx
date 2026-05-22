"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiJson, HttpError } from "@/lib/api/client";
import styles from "../auth.module.css";

const schema = z
  .object({
    old_password: z.string().min(1, "Введите текущий пароль"),
    new_password: z.string().min(8, "Минимум 8 символов"),
    confirm_password: z.string().min(1, "Подтвердите новый пароль"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Пароли не совпадают",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const [show, setShow] = useState({ old: false, new: false, confirm: false });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiJson("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          old_password: data.old_password,
          new_password: data.new_password,
        }),
      }),
    onSuccess: () => router.push("/dashboard"),
    onError: (err: unknown) => {
      if (err instanceof HttpError) {
        if (err.body.code === "INVALID_CREDENTIALS") {
          setError("old_password", { message: "Неверный текущий пароль" });
        } else if (err.body.code === "SAME_PASSWORD") {
          setError("new_password", {
            message: "Новый пароль должен отличаться от старого",
          });
        } else {
          setError("root", { message: "Ошибка сервера. Попробуйте позже." });
        }
      } else {
        setError("root", { message: "Ошибка сервера. Попробуйте позже." });
      }
    },
  });

  const onSubmit = (data: FormValues) => mutation.mutate(data);

  const toggle = (field: keyof typeof show) =>
    setShow((s) => ({ ...s, [field]: !s[field] }));

  return (
    <div className={styles.card}>
      <div className={styles.wordmark}>
        <h1>АСПиРС</h1>
        <p>Система управления общежитием</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <div className={styles.formTitle}>Смена пароля</div>
          <div className={styles.formSubtitle}>
            Это ваш первый вход. Установите надёжный пароль для продолжения работы.
          </div>
        </div>

        <PasswordField
          id="old_password"
          label="Текущий пароль"
          show={show.old}
          onToggle={() => toggle("old")}
          autoComplete="current-password"
          error={errors.old_password?.message}
          {...register("old_password")}
        />

        <PasswordField
          id="new_password"
          label="Новый пароль"
          show={show.new}
          onToggle={() => toggle("new")}
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register("new_password")}
        />

        <PasswordField
          id="confirm_password"
          label="Подтвердить пароль"
          show={show.confirm}
          onToggle={() => toggle("confirm")}
          autoComplete="new-password"
          error={errors.confirm_password?.message}
          {...register("confirm_password")}
        />

        {errors.root && (
          <div className={styles.formError}>{errors.root.message}</div>
        )}

        <button
          type="submit"
          className={styles.submitBtn}
          disabled={mutation.isPending}
        >
          {mutation.isPending && <span className={styles.spinner} />}
          {mutation.isPending ? "Сохранение…" : "Сменить пароль"}
        </button>
      </form>
    </div>
  );
}

import { forwardRef } from "react";

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  show: boolean;
  onToggle: () => void;
  error?: string;
}

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ id, label, show, onToggle, error, ...props }, ref) => (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={id}
          ref={ref}
          type={show ? "text" : "password"}
          className={`${styles.input} ${styles.inputWithToggle} ${
            error ? styles.inputError : ""
          }`}
          {...props}
        />
        <button
          type="button"
          className={styles.toggleBtn}
          aria-label={show ? "Скрыть" : "Показать"}
          tabIndex={-1}
          onClick={onToggle}
        >
          {show ? <EyeOff /> : <EyeOn />}
        </button>
      </div>
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  )
);
PasswordField.displayName = "PasswordField";

function EyeOn() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3C4.5 3 1.5 8 1.5 8s3 5 6.5 5 6.5-5 6.5-5-3-5-6.5-5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 2l12 12M6.7 6.7A2 2 0 0 0 9.3 9.3M4 4.5C2.8 5.6 2 7 2 8s3 5 6 5c1.1 0 2.1-.3 3-.8M7 3.1C7.3 3 7.7 3 8 3c3 0 6 4 6 5 0 .6-.4 1.4-1 2.2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
