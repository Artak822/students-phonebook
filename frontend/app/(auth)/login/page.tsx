"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiJson, HttpError } from "@/lib/api/client";
import styles from "../auth.module.css";

const schema = z.object({
  username: z.string().min(1, "Введите имя пользователя"),
  password: z.string().min(1, "Введите пароль"),
});

type FormValues = z.infer<typeof schema>;

interface LoginResponse {
  must_change_password: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const { ref: rhfPasswordRef, ...passwordFieldProps } = register("password");

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiJson<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      if (data.must_change_password) {
        router.push("/change-password");
      } else {
        router.push("/dashboard");
      }
    },
    onError: (err: unknown) => {
      if (err instanceof HttpError) {
        if (err.body.code === "RATE_LIMIT_EXCEEDED") {
          setFormError("Слишком много попыток. Повторите через несколько минут.");
        } else {
          setFormError("Неверное имя пользователя или пароль.");
        }
      } else {
        setFormError("Ошибка сервера. Попробуйте позже.");
      }
      passwordRef.current?.focus();
    },
  });

  const onSubmit = (data: FormValues) => {
    setFormError(null);
    mutation.mutate(data);
  };

  return (
    <div className={styles.card}>
      <div className={styles.wordmark}>
        <div className={styles.logos}>
          <img src="/aspeers.png" alt="АСПиРС" className={styles.logoAspeers} />
          <div className={styles.logosDivider} />
          <img src="/sirius.png" alt="Сириус" className={styles.logoSirius} />
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="username">
            Имя пользователя
          </label>
          <div className={styles.inputWrap}>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="admin"
              className={`${styles.input} ${errors.username ? styles.inputError : ""}`}
              {...register("username")}
            />
          </div>
          {errors.username && (
            <span className={styles.fieldError}>{errors.username.message}</span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Пароль
          </label>
          <div className={styles.inputWrap}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className={`${styles.input} ${styles.inputWithToggle} ${
                errors.password || formError ? styles.inputError : ""
              }`}
              {...passwordFieldProps}
              ref={(el) => {
                rhfPasswordRef(el);
                passwordRef.current = el;
              }}
            />
            <button
              type="button"
              className={styles.toggleBtn}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff /> : <EyeOn />}
            </button>
          </div>
          {errors.password && (
            <span className={styles.fieldError}>{errors.password.message}</span>
          )}
        </div>

        {formError && <div className={styles.formError}>{formError}</div>}

        <button
          type="submit"
          className={styles.submitBtn}
          disabled={mutation.isPending}
        >
          {mutation.isPending && <span className={styles.spinner} />}
          {mutation.isPending ? "Выполняется вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

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
