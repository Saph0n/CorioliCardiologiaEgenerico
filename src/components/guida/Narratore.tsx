import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * I pezzi con cui il gufo racconta la guida: la nuvoletta che esce da lui, il
 * testo che compare mentre parla, i tasti che si premono da soli, la prova del
 * grassetto in miniatura.
 */

/** Millisecondi per carattere: una frase di 150 caratteri in circa 2,5 s. */
const MS_PER_CARATTERE = 16;

/**
 * Testo che compare un carattere alla volta, come se il gufo lo stesse
 * dicendo. Il resto della frase c'e' gia', invisibile: cosi' il fumetto ha
 * subito la sua altezza e non cambia posto mentre il testo si allunga.
 *
 * Un clic sul testo lo mostra tutto. Con "meno movimento" compare subito.
 */
export function Battuta({
  testo,
  onParla,
}: {
  testo: string;
  /** Vero mentre il testo sta comparendo: il gufo muove il becco. */
  onParla?: (parla: boolean) => void;
}) {
  const fermo = useReducedMotion() ?? false;
  const [mostrati, setMostrati] = useState(fermo ? testo.length : 0);
  const onParlaRef = useRef(onParla);
  onParlaRef.current = onParla;

  useEffect(() => {
    if (fermo) {
      setMostrati(testo.length);
      onParlaRef.current?.(false);
      return;
    }
    setMostrati(0);
    onParlaRef.current?.(true);
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      setMostrati(n);
      if (n >= testo.length) {
        window.clearInterval(timer);
        onParlaRef.current?.(false);
      }
    }, MS_PER_CARATTERE);
    return () => window.clearInterval(timer);
  }, [testo, fermo]);

  const completa = () => {
    if (mostrati < testo.length) {
      setMostrati(testo.length);
      onParlaRef.current?.(false);
    }
  };

  return (
    <span onClick={completa} aria-label={testo}>
      <span aria-hidden>{testo.slice(0, mostrati)}</span>
      <span aria-hidden style={{ visibility: "hidden" }}>
        {testo.slice(mostrati)}
      </span>
    </span>
  );
}

/**
 * Nuvoletta del gufo: il riquadro con la punta rivolta verso di lui, che sta
 * a sinistra. E' quello che dice che a parlare e' lui.
 */
export function Nuvoletta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`guida-nuvoletta ${className}`}>{children}</div>;
}

/**
 * Scorciatoia che si preme da sola: il primo tasto scende, poi il secondo,
 * poi tornano su insieme. Si capisce senza leggere che vanno tenuti insieme.
 */
export function TastiAnimati({
  tasti,
  durata = 2,
  premiA = 0.12,
}: {
  tasti: string[];
  /** Durata di un giro, in secondi. */
  durata?: number;
  /** Quando scende il primo tasto, in frazione del giro. */
  premiA?: number;
}) {
  const fermo = useReducedMotion() ?? false;
  // Risalgono insieme poco dopo che e' sceso l'ultimo.
  const su = Math.min(premiA + tasti.length * 0.12 + 0.35, 0.94);
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={tasti.join(" + ")}>
      {tasti.map((t, i) => {
        // Ogni tasto scende un po' dopo il precedente e risale con gli altri.
        const giu = premiA + i * 0.12;
        return (
          <span key={t} className="inline-flex items-center gap-1.5" aria-hidden>
            {i > 0 && <span className="text-default-500">+</span>}
            <motion.kbd
              className="guida-kbd"
              animate={
                fermo
                  ? undefined
                  : {
                      y: [0, 0, 2, 2, 0, 0],
                      boxShadow: [
                        "0 2px 0 #cbd5e1",
                        "0 2px 0 #cbd5e1",
                        "0 0 0 #cbd5e1",
                        "0 0 0 #cbd5e1",
                        "0 2px 0 #cbd5e1",
                        "0 2px 0 #cbd5e1",
                      ],
                      backgroundColor: ["#f8fafc", "#f8fafc", "#e1f5ee", "#e1f5ee", "#f8fafc", "#f8fafc"],
                    }
              }
              transition={
                fermo
                  ? undefined
                  : {
                      duration: durata,
                      repeat: Infinity,
                      times: [0, giu, giu + 0.04, su, su + 0.04, 1],
                      ease: "easeInOut",
                    }
              }
            >
              {t}
            </motion.kbd>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Il grassetto in miniatura: la parola si seleziona, i tasti si premono, la
 * parola diventa grassetta. In loop, finche' il medico non lo fa davvero.
 */
export function DemoGrassetto({ mod }: { mod: string }) {
  const fermo = useReducedMotion() ?? false;
  const ciclo = { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <div className="guida-demo" aria-hidden>
      <p className="guida-demo-riga">
        <span className="guida-demo-parola">
          <motion.span
            className="guida-demo-selezione"
            animate={fermo ? { scaleX: 0 } : { scaleX: [0, 1, 1, 1, 0, 0], opacity: [1, 1, 1, 1, 0, 0] }}
            transition={fermo ? undefined : { ...ciclo, times: [0.05, 0.3, 0.45, 0.62, 0.72, 1] }}
          />
          <motion.span
            className="relative"
            animate={fermo ? { fontWeight: 700 } : { fontWeight: [400, 400, 400, 700, 700, 400] }}
            transition={fermo ? undefined : { ...ciclo, times: [0, 0.3, 0.5, 0.52, 0.95, 1] }}
          >
            Paziente
          </motion.span>
        </span>{" "}
        in condizioni generali buone.
      </p>
      <div className="guida-demo-tasti">
        {/* Selezione fino a 0,30 del giro, tasti a 0,34, grassetto a 0,52. */}
        <TastiAnimati tasti={[mod, "B"]} durata={3.2} premiA={0.34} />
      </div>
    </div>
  );
}
