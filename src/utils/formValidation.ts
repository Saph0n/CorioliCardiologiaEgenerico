/** Limiti e validazione input condivisi tra i form. */
import { todayIsoDate } from "./dateUtils";

export const MIN_HEIGHT_CM = 50;
export const MAX_HEIGHT_CM = 250;
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 200;
export const MIN_BIRTH_YEAR = 1900;

/** Data odierna (fuso locale). Ri-esportata da `dateUtils` per i form che la usano. */
export { todayIsoDate };

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function clampHeightCm(value: number): number {
  return clampInt(value, MIN_HEIGHT_CM, MAX_HEIGHT_CM);
}

/** Consente solo cifre mentre si digita l'altezza in cm. */
export function isValidHeightInputDraft(s: string): boolean {
  return s === "" || /^\d*$/.test(s);
}

/** Parsing live: non limita il range (evita salti a 50 cm al primo tasto). */
export function parseHeightFieldLive(s: string): number | "incomplete" {
  const t = s.trim();
  if (t === "") return "incomplete";
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return "incomplete";
  return n;
}

/** Valore al blur: vuoto → undefined, altrimenti numero senza clamp. */
export function parseHeightFieldBlur(s: string): number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/** Consente cifre e un separatore decimale mentre si digita. */
export function isValidWeightInputDraft(s: string): boolean {
  return s === "" || /^\d*[.,]?\d*$/.test(s);
}

/** Parsing live: non arrotonda né limita il range (evita salti a 30 kg al primo tasto). */
export function parseWeightFieldLive(s: string): number | "incomplete" {
  const t = s.trim().replace(",", ".");
  if (t === "" || t === ".") return "incomplete";
  if (t.endsWith(".")) return "incomplete";
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return "incomplete";
  return n;
}

/**
 * Valore finale al blur: vuoto → 0, altrimenti arrotondato al decimo.
 *
 * Non riporta il valore dentro il range: prima lo faceva, e "870" (volendo
 * 87,0) diventava 200 kg senza avviso. Un valore fuori scala resta com'e' e lo
 * segnala `validateBodyWeight`, accanto al campo e al salvataggio.
 */
export function parseWeightFieldBlur(s: string): number {
  const t = s.trim().replace(",", ".");
  if (t === "" || t === ".") return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

export function parseOptionalHeight(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) return undefined;
  if (n < MIN_HEIGHT_CM || n > MAX_HEIGHT_CM) return undefined;
  return n;
}

export function validateBirthDate(iso: string): string | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Data di nascita non valida";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Data di nascita non valida";
  if (iso > todayIsoDate()) return "La data di nascita non può essere nel futuro";
  if (d.getFullYear() < MIN_BIRTH_YEAR) {
    return `Anno di nascita troppo remoto (minimo ${MIN_BIRTH_YEAR})`;
  }
  return null;
}

export function validateVisitDate(iso: string): string | null {
  if (!iso) return "Data visita obbligatoria";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Data visita non valida";
  if (iso > todayIsoDate()) return "La data visita non può essere nel futuro";
  return null;
}

export function validateOptionalIsoDate(
  iso: string | undefined,
  label = "Data",
): string | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${label} non valida`;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return `${label} non valida`;
  return null;
}

export function validatePastOrSameDate(
  iso: string | undefined,
  label = "Data",
): string | null {
  const formatErr = validateOptionalIsoDate(iso, label);
  if (formatErr) return formatErr;
  if (!iso) return null;
  if (iso > todayIsoDate()) return `${label} non può essere nel futuro`;
  return null;
}

export function validateDateNotAfter(
  iso: string | undefined,
  maxIso: string,
  label: string,
): string | null {
  if (!iso) return null;
  if (iso > maxIso) return `${label} non può essere successiva alla data visita`;
  return null;
}

/** Peso corporeo fuori range consentito (0 / assente = non inserito). */
export function validateBodyWeight(peso?: number): string | null {
  if (peso == null || peso === 0) return null;
  if (peso < MIN_WEIGHT_KG || peso > MAX_WEIGHT_KG) {
    return `Peso corporeo fuori range (${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg)`;
  }
  return null;
}

/**
 * Pressione arteriosa scritta come la si scrive in ambulatorio.
 *
 * Il separatore accettato era la sola barra: chi digitava "120 80" o "120-80"
 * si vedeva rifiutare il salvataggio della visita, che e' il tipo di attrito
 * che fa chiudere il programma. Ora valgono barra, trattino, spazio e
 * backslash — quest'ultimo perche' sulla tastiera italiana e' il tasto accanto
 * — e il valore viene ricondotto alla forma "120/80" da
 * `normalizzaPressioneArteriosa` prima di essere salvato.
 */
const SEPARATORE_PA = /^(\d{2,3})\s*[/\\\-\s]\s*(\d{2,3})$/;

/**
 * Riporta la pressione alla forma canonica "120/80".
 *
 * Restituisce il testo originale quando non riconosce le due misure: a dire
 * che c'e' un errore ci pensa la validazione, questa funzione non inventa.
 */
export function normalizzaPressioneArteriosa(value?: string): string {
  const t = (value ?? "").trim();
  const m = SEPARATORE_PA.exec(t);
  return m ? `${m[1]}/${m[2]}` : t;
}

/** Formato della pressione arteriosa: "120/80" (sistolica/diastolica). */
export function validatePressioneArteriosa(value?: string): string | null {
  const t = (value ?? "").trim();
  if (t === "") return null;
  const m = SEPARATORE_PA.exec(t);
  if (!m) return "Pressione arteriosa: usare il formato 120/80";
  const sys = parseInt(m[1], 10);
  const dia = parseInt(m[2], 10);
  if (sys < 50 || sys > 300) return "Pressione sistolica fuori range (50–300)";
  if (dia < 20 || dia > 200) return "Pressione diastolica fuori range (20–200)";
  if (dia >= sys) return "La diastolica deve essere inferiore alla sistolica";
  return null;
}

/** Frequenza cardiaca in bpm (campo libero numerico, facoltativo). */
export function validateFrequenzaCardiaca(value?: string): string | null {
  const t = (value ?? "").trim();
  if (t === "") return null;
  if (!/^\d{1,3}$/.test(t)) return "Frequenza cardiaca: inserire solo cifre (bpm)";
  const n = parseInt(t, 10);
  if (n < 20 || n > 250) return "Frequenza cardiaca fuori range (20–250 bpm)";
  return null;
}
