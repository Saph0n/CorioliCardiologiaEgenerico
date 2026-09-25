import { KeyRound, Lock, Mail, User } from "lucide-react";
import type { ReactNode } from "react";

export type AppLockShellIcon = "lock" | "user" | "key" | "mail";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  icon?: AppLockShellIcon;
  /** Mascotte animata: se presente sostituisce il cerchio con l'icona statica */
  mascot?: ReactNode;
  /** Schermata a tutto schermo (setup) o overlay sopra lo sblocco PIN */
  overlay?: boolean;
  stepProgress?: { current: number; total: number };
  /** Altezza minima del corpo: tiene le card dei vari passi della stessa dimensione */
  bodyMinHeight?: number;
};

function ShellIcon({ icon }: { icon: AppLockShellIcon }) {
  const className = "h-7 w-7" ;
  const style = { color: "#0F6E56" };
  if (icon === "user") return <User className={className} style={style} />;
  if (icon === "key") return <KeyRound className={className} style={style} />;
  if (icon === "mail") return <Mail className={className} style={style} />;
  return <Lock className={className} style={style} />;
}

function StepPills({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-center gap-2"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Passo ${current} di ${total}`}
      >
        {Array.from({ length: total }, (_, i) => {
          const state =
            i + 1 < current ? "done" : i + 1 === current ? "active" : "future";
          return (
            <div
              key={i}
              className={`onboarding-step-pill onboarding-step-pill--${state}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function AppLockShell({
  title,
  subtitle,
  children,
  icon = "lock",
  mascot,
  overlay = false,
  stepProgress,
  bodyMinHeight,
}: Props) {
  const card = (
    <div className="onboarding-card">
      <div className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          {stepProgress ? (
            <StepPills current={stepProgress.current} total={stepProgress.total} />
          ) : null}

          {mascot ? (
            <div className="onboarding-mascot-wrap">{mascot}</div>
          ) : (
            <div className="onboarding-icon-circle">
              <ShellIcon icon={icon} />
            </div>
          )}

          <div className="space-y-2">
            <h1 className="onboarding-title">{title}</h1>
            {stepProgress ? (
              <span className="onboarding-fase-badge">
                Fase {stepProgress.current} di {stepProgress.total}
              </span>
            ) : null}
          </div>

          {subtitle ? (
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {bodyMinHeight ? (
          <div
            className="flex flex-col justify-center"
            style={{ minHeight: bodyMinHeight }}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );

  const centered = (
    <div
      className={
        overlay
          ? "min-h-full flex items-center justify-center p-6"
          : "min-h-finestra corioli-auth-bg flex items-center justify-center p-6"
      }
    >
      {card}
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-barra z-50 overflow-y-auto corioli-auth-bg">{centered}</div>
    );
  }

  return centered;
}
