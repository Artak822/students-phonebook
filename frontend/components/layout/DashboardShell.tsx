"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import { useMe, hasPermission } from "@/lib/hooks/useMe";
import styles from "./DashboardShell.module.css";

interface Props {
  children: React.ReactNode;
}

export function DashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const logoutMutation = useMutation({
    mutationFn: () => apiJson<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
      router.push("/login");
    },
  });

  const initials = me?.fio
    ? me.fio.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandName}>АСПиРС</div>
          <div className={styles.brandSub}>CRM общежития</div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navSection}>Главное</div>

          <Link
            href="/dashboard"
            className={`${styles.navItem} ${pathname === "/dashboard" ? styles.active : ""}`}
          >
            <IconHome className={styles.navIcon} />
            Главная
          </Link>

          {hasPermission(me, "admins:manage") && (
            <Link
              href="/admins"
              className={`${styles.navItem} ${pathname.startsWith("/admins") ? styles.active : ""}`}
            >
              <IconUsers className={styles.navIcon} />
              Администраторы
            </Link>
          )}

          {hasPermission(me, "roles:manage") && (
            <Link
              href="/roles"
              className={`${styles.navItem} ${pathname.startsWith("/roles") ? styles.active : ""}`}
            >
              <IconShield className={styles.navIcon} />
              Роли
            </Link>
          )}

          <div className={styles.navSection} style={{ marginTop: 8 }}>Работа</div>

          {hasPermission(me, "employees:view") && (
            <span className={`${styles.navItem}`} style={{ opacity: 0.45, cursor: "default" }}>
              <IconPerson className={styles.navIcon} />
              Жильцы
            </span>
          )}

          {hasPermission(me, "rooms:view") && (
            <span className={`${styles.navItem}`} style={{ opacity: 0.45, cursor: "default" }}>
              <IconDoor className={styles.navIcon} />
              Комнаты
            </span>
          )}

          {hasPermission(me, "history:view") && (
            <span className={`${styles.navItem}`} style={{ opacity: 0.45, cursor: "default" }}>
              <IconHistory className={styles.navIcon} />
              История
            </span>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          {me && (
            <div className={styles.userBlock}>
              <div className={styles.userAvatar}>{initials}</div>
              <div className={styles.userInfo}>
                <div className={styles.userName}>{me.fio}</div>
                <div className={styles.userRole}>{me.role}</div>
              </div>
            </div>
          )}
          <button
            className={styles.logoutBtn}
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <IconLogout style={{ width: 14, height: 14, flexShrink: 0 }} />
            Выйти
          </button>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}

/* ─── Icons ─────────────────────────────────────── */

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 6.5 8 2l6 4.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M6 15V9h4v6" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1 13c0-2.5 2.25-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11 7c1.5 0 3 1 3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5 2 4v4c0 3.5 2.5 5.5 6 6.5 3.5-1 6-3 6-6.5V4L8 1.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPerson({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconDoor({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="1.5" width="10" height="13" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="10.5" cy="8" r="0.75" fill="currentColor" />
      <path d="M3 14.5H13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconHistory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLogout({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
