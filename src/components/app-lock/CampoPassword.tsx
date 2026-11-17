import { useState } from "react";
import { Input } from "@nextui-org/react";
import { Check, Eye, EyeOff } from "lucide-react";

/** Campo password con l'occhio per mostrarla. */
export default function CampoPassword({
  label,
  value,
  onValueChange,
  autoFocus,
  errorMessage,
  autoComplete = "current-password",
  onEnter,
  isDisabled,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  autoFocus?: boolean;
  errorMessage?: string | null;
  autoComplete?: "current-password" | "new-password";
  onEnter?: () => void;
  isDisabled?: boolean;
}) {
  const [visibile, setVisibile] = useState(false);
  return (
    <Input
      label={label}
      type={visibile ? "text" : "password"}
      value={value}
      onValueChange={onValueChange}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      variant="bordered"
      isDisabled={isDisabled}
      isInvalid={Boolean(errorMessage)}
      errorMessage={errorMessage ?? undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter?.();
      }}
      endContent={
        <button
          type="button"
          className="rounded-md p-1 text-default-400 hover:text-default-600"
          onClick={() => setVisibile((v) => !v)}
          aria-label={visibile ? "Nascondi password" : "Mostra password"}
          tabIndex={-1}
        >
          {visibile ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}

/** Regole della password come elenco che si spunta mentre si scrive. */
export function RegolePassword({ password }: { password: string }) {
  const regole = [
    { testo: "Almeno 8 caratteri", ok: password.length >= 8 },
    { testo: "Almeno una lettera", ok: /[A-Za-zÀ-ÿ]/.test(password) },
    { testo: "Almeno un numero", ok: /\d/.test(password) },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {regole.map((r) => (
        <li
          key={r.testo}
          className={`inline-flex items-center gap-1 ${r.ok ? "text-success-700" : "text-default-400"}`}
        >
          <Check size={12} className={r.ok ? "" : "opacity-40"} />
          {r.testo}
        </li>
      ))}
    </ul>
  );
}
