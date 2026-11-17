import axios from "axios";
import type { Doctor } from "../types/Storage";

/**
 * Conferma dell'email del medico con un codice a 6 cifre mandato dal server
 * Corioli. Serve alla prima configurazione e quando si cambia l'email nel
 * profilo: è l'indirizzo usato per recuperare il PIN e per l'abbonamento.
 */

const baseUrl = () => (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

export type Esito<T> = { ok: true; dati: T } | { ok: false; errore: string; offline?: boolean };

export function normalizzaEmail(email: string | undefined | null): string {
  return String(email ?? "").trim().toLowerCase();
}

/** L'email attuale del profilo è stata confermata con il codice. */
export function emailConfermata(doctor: Pick<Doctor, "email" | "emailVerificata"> | null | undefined): boolean {
  const email = normalizzaEmail(doctor?.email);
  return Boolean(email) && email === normalizzaEmail(doctor?.emailVerificata);
}

function messaggio(e: unknown, predefinito: string): { errore: string; offline?: boolean } {
  if (axios.isAxiosError(e)) {
    if (!e.response) {
      return { errore: "Non riesco a collegarmi a Corioli. Controlla la connessione a internet e riprova.", offline: true };
    }
    if (typeof e.response.data?.error === "string") return { errore: e.response.data.error };
  }
  return { errore: predefinito };
}

export async function richiediCodiceEmail(
  clientId: string,
  email: string,
): Promise<Esito<{ ticket: string }>> {
  const url = baseUrl();
  if (!url) return { ok: false, errore: "Servizio Corioli non configurato.", offline: true };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, errore: "Sei offline: per mandarti il codice serve la connessione a internet.", offline: true };
  }
  try {
    const res = await axios.post(`${url}/email-verification/request`, {
      id: clientId,
      email: normalizzaEmail(email),
    });
    const ticket = res.data?.ticket;
    if (typeof ticket !== "string") return { ok: false, errore: "Risposta del server non valida." };
    return { ok: true, dati: { ticket } };
  } catch (e) {
    return { ok: false, ...messaggio(e, "Non sono riuscito a mandarti il codice. Riprova.") };
  }
}

export async function verificaCodiceEmail(
  clientId: string,
  email: string,
  codice: string,
  ticket: string,
): Promise<Esito<{ email: string; prova: string }>> {
  const url = baseUrl();
  if (!url) return { ok: false, errore: "Servizio Corioli non configurato.", offline: true };
  try {
    const res = await axios.post(`${url}/email-verification/verify`, {
      id: clientId,
      email: normalizzaEmail(email),
      otp: codice.replace(/\D/g, ""),
      ticket,
    });
    if (res.data?.verified !== true) return { ok: false, errore: "Risposta del server non valida." };
    return { ok: true, dati: { email: String(res.data.email), prova: String(res.data.proof) } };
  } catch (e) {
    return { ok: false, ...messaggio(e, "Codice non valido. Riprova.") };
  }
}
