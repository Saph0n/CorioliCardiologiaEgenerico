import { useCallback, useId, useRef, useState } from "react";

const PIN_MIN = 4;
const PIN_MAX = 4;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Numero fisso di caselle (= lunghezza PIN dell'utente) */
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onSubmit?: () => void;
  /** Chiamato quando sono state inserite tutte le cifre (solo con `length` impostato) */
  onComplete?: (value: string) => void;
  /** Notifica focus/blur del campo PIN — usato dalla mascotte */
  onFocusChange?: (focused: boolean) => void;
  showHint?: boolean;
  "aria-label"?: string;
};

export default function PinDigitInput({
  value,
  onChange,
  length,
  autoFocus = false,
  disabled = false,
  invalid = false,
  onSubmit,
  onComplete,
  onFocusChange,
  showHint = length == null,
  "aria-label": ariaLabel = "PIN",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "");
  const inputMax = length ?? PIN_MAX;
  const trimmed = digits.slice(0, inputMax);
  const boxCount =
    length ??
    Math.min(PIN_MAX, Math.max(PIN_MIN, trimmed.length || PIN_MIN));
  const activeIndex = Math.min(trimmed.length, boxCount - 1);

  const focusInput = useCallback(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const setDigits = useCallback(
    (raw: string) => {
      const next = raw.replace(/\D/g, "").slice(0, inputMax);
      onChange(next);
      if (length != null && next.length === length) {
        onComplete?.(next);
      }
    },
    [onChange, inputMax, length, onComplete],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDigits(e.clipboardData.getData("text"));
      focusInput();
    },
    [disabled, setDigits, focusInput],
  );

  return (
    <div className="w-full">
      <p id={labelId} className="sr-only">
        {ariaLabel}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-invalid={invalid}
        onClick={focusInput}
        onPaste={handlePaste}
        className={[
          "w-full rounded-xl p-1 transition-colors cursor-text",
          invalid ? "animate-pin-shake" : "",
          disabled ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        <div className="flex justify-center" style={{ gap: "12px" }}>
          {Array.from({ length: boxCount }, (_, i) => {
            const filled = i < trimmed.length;
            const active = focused && !disabled && i === activeIndex;
            const isInvalid = invalid;

            let borderStyle = "1.5px solid var(--color-border-secondary, #e2e8f0)";
            let boxShadow = "none";
            let background = "#fff";

            if (isInvalid && filled) {
              borderStyle = "2px solid #e24b4a";
              background = "#fff5f5";
            } else if (isInvalid) {
              borderStyle = "1.5px solid rgba(226,75,74,0.4)";
            } else if (filled) {
              borderStyle = "2px solid var(--brand-cta, #244843)";
              background = "#F1F7F6";
            } else if (active) {
              borderStyle = "2px solid var(--brand-cta, #244843)";
              boxShadow = "0 0 0 3px rgba(36,72,67,0.15)";
            }

            return (
              <div
                key={i}
                style={{
                  width: 56,
                  height: 64,
                  borderRadius: 14,
                  border: borderStyle,
                  boxShadow,
                  background,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
                }}
                aria-hidden
              >
                {filled ? (
                  <span
                    style={{
                      display: "block",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: isInvalid ? "#e24b4a" : "var(--color-text-primary, #0f172a)",
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={
          length != null && length !== PIN_MAX
            ? "one-time-code"
            : length != null
              ? "current-password"
              : "new-password"
        }
        autoFocus={autoFocus}
        disabled={disabled}
        value={trimmed}
        aria-label={ariaLabel}
        className="sr-only"
        onChange={(e) => setDigits(e.target.value)}
        onPaste={handlePaste}
        onFocus={() => {
          setFocused(true);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setFocused(false);
          onFocusChange?.(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit?.();
        }}
      />
      {showHint ? (
        <p className="mt-3 text-center text-xs text-default-500">4 cifre</p>
      ) : null}
    </div>
  );
}
