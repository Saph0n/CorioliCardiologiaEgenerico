/**
 * Calcola l'età in anni a partire dalla data di nascita (stringa ISO o YYYY-MM-DD).
 * Restituisce null se la data non è valida.
 *
 * `alla`: la data a cui calcolarla (per esempio quella della visita, per i
 * giudizi che cambiano a 18 anni); senza, oggi.
 */
export function calculateAge(dataNascita: string, alla?: string | Date): number | null {
  if (!dataNascita || typeof dataNascita !== "string") return null;
  const birth = new Date(dataNascita);
  if (isNaN(birth.getTime())) return null;
  const today = alla ? new Date(alla) : new Date();
  if (isNaN(today.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

/**
 * Converte una data nel formato `YYYY-MM-DD` usando il **fuso orario locale**.
 *
 * Da preferire sempre a `toISOString().slice(0, 10)`, che lavora in UTC: in Italia
 * (UTC+1/+2) una visita registrata tra mezzanotte e le 02:00 risulterebbe datata
 * al giorno precedente.
 */
export function toLocalIsoDate(date: Date = new Date()): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Data odierna in formato `YYYY-MM-DD` secondo il fuso orario locale. */
export function todayIsoDate(): string {
  return toLocalIsoDate(new Date());
}

/**
 * Timestamp locale compatto `YYYY-MM-DD_HH-mm-ss`, per nomi di file (backup, export).
 */
export function localTimestampForFileName(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${toLocalIsoDate(date)}_${hh}-${mm}-${ss}`;
}
