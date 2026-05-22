import { DashboardShell } from "@/components/layout/DashboardShell";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div style={{ padding: "48px 40px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "6px" }}>
          Главная
        </h1>
        <p style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>
          Выберите раздел в меню слева.
        </p>
      </div>
    </DashboardShell>
  );
}
