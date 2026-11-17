import axios from "axios";
import { storageService } from "./StorageServiceFallback";

/**
 * Abbonamento a Corioli (Stripe, tramite il backend Corioli).
 *
 * Il server decide lo stato (prova, attivo, scaduto) e lo manda con ogni
 * heartbeat; l'app ricorda l'ultima risposta e da lì ricava lo stato anche
 * senza connessione: la prova finisce alla sua data, un abbonamento attivo
 * regge una settimana oltre il rinnovo prima di chiedere una verifica.
 * A scadenza Corioli passa in sola lettura, non si blocca: le cartelle si
 * consultano, si stampano e si esportano sempre.
 */

/** Licenza come la manda il backend (`services/licenseService.js`). */
export interface LicenzaServer {
  required: boolean;
  status?: "trial" | "active" | "expired";
  reason?: "trial_ended" | "subscription_ended" | "payment_failed" | null;
  trialEndsAt?: string;
  trialDaysLeft?: number;
  validUntil?: string | null;
  subscription?: {
    status: string | null;
    currentPeriodEnd: string | null;
    cancelAt: string | null;
    cancelAtPeriodEnd: boolean;
    pastDue: boolean;
  } | null;
  account?: {
    email: string | null;
    linkedComputers: number;
    maxComputers: number;
  } | null;
  checkedAt: string;
}

interface LicenzaSalvata {
  licenza: LicenzaServer;
  /** Quando l'app l'ha ricevuta (ora locale). */
  ricevutaIl: string;
}

export type StatoAbbonamento =
  /** Pagamenti non attivi sul server, o licenza mai ricevuta: nessun limite. */
  | { tipo: "libero" }
  | { tipo: "prova"; fineProva: Date; giorniRimasti: number }
  | {
      tipo: "attivo";
      /** Rinnovo, o fine se è disdetto. */
      finoAl: Date | null;
      disdetto: boolean;
      pagamentoInRitardo: boolean;
    }
  | {
      tipo: "scaduto";
      motivo: "prova_finita" | "abbonamento_finito" | "pagamento_non_riuscito" | "verifica_necessaria";
    };

export interface PrezzoAbbonamento {
  amount: number;
  currency: string;
  interval: string | null;
  intervalCount: number;
  taxBehavior: string;
  automaticTax: boolean;
  trialDays: number;
}

export interface ComputerCollegato {
  id: string;
  current: boolean;
  version: string | null;
  lastSeenAt: string | null;
  linkedAt: string | null;
}

export interface ElencoComputer {
  maxComputers: number;
  computers: ComputerCollegato[];
}

export type Esito<T> = { ok: true; dati: T } | { ok: false; errore: string; codice?: string };

/** Lanciato sulla window quando arriva una licenza nuova. */
export const EVENTO_LICENZA = "corioli-licenza-aggiornata";

const CHIAVE_LICENZA = "abbonamento_licenza";
const GIORNO_MS = 24 * 60 * 60 * 1000;

/** Giorni concessi senza connessione dopo la data di rinnovo. */
export const GIORNI_TOLLERANZA_OFFLINE = 7;

/** Stato dell'abbonamento dall'ultima licenza ricevuta. Funzione pura. */
export function calcolaStatoAbbonamento(
  licenza: LicenzaServer | null | undefined,
  adesso: Date = new Date(),
): StatoAbbonamento {
  if (!licenza?.required) return { tipo: "libero" };

  if (licenza.status === "active") {
    const finoAl = licenza.validUntil ? new Date(licenza.validUntil) : null;
    if (finoAl && adesso.getTime() > finoAl.getTime() + GIORNI_TOLLERANZA_OFFLINE * GIORNO_MS) {
      return { tipo: "scaduto", motivo: "verifica_necessaria" };
    }
    return {
      tipo: "attivo",
      finoAl,
      disdetto: Boolean(licenza.subscription?.cancelAtPeriodEnd || licenza.subscription?.cancelAt),
      pagamentoInRitardo: Boolean(licenza.subscription?.pastDue),
    };
  }

  if (licenza.status === "trial" && licenza.trialEndsAt) {
    const fineProva = new Date(licenza.trialEndsAt);
    if (adesso < fineProva) {
      const giorniRimasti = Math.max(1, Math.ceil((fineProva.getTime() - adesso.getTime()) / GIORNO_MS));
      return { tipo: "prova", fineProva, giorniRimasti };
    }
    return { tipo: "scaduto", motivo: "prova_finita" };
  }

  if (licenza.reason === "payment_failed") return { tipo: "scaduto", motivo: "pagamento_non_riuscito" };
  if (licenza.reason === "subscription_ended") return { tipo: "scaduto", motivo: "abbonamento_finito" };
  return { tipo: "scaduto", motivo: "prova_finita" };
}

/**
 * Data con l'articolo giusto: "il 3 dicembre", "l'8 dicembre", "il 1º marzo";
 * con `prep: "al"`: "al 3 dicembre", "all'11 dicembre".
 */
export interface ScadenzaInArrivo {
  /** Cosa finisce: la prova gratuita o un abbonamento disdetto. */
  tipo: "prova" | "abbonamento";
  fine: Date;
  /** Giorni rimasti, oggi compreso (almeno 1). */
  giorni: number;
}

/** Prova o abbonamento disdetto che sta per finire; null se non finisce nulla. */
export function scadenzaInArrivo(stato: StatoAbbonamento, adesso: Date = new Date()): ScadenzaInArrivo | null {
  if (stato.tipo === "prova") {
    return { tipo: "prova", fine: stato.fineProva, giorni: stato.giorniRimasti };
  }
  if (stato.tipo === "attivo" && stato.disdetto && stato.finoAl && stato.finoAl > adesso) {
    const giorni = Math.max(1, Math.ceil((stato.finoAl.getTime() - adesso.getTime()) / GIORNO_MS));
    return { tipo: "abbonamento", fine: stato.finoAl, giorni };
  }
  return null;
}

export function dataConArticolo(
  data: Date,
  { anno = false, prep = "il" }: { anno?: boolean; prep?: "il" | "al" } = {},
): string {
  const giorno = data.getDate();
  let testo = data.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    ...(anno ? { year: "numeric" as const } : {}),
  });
  if (giorno === 1) testo = testo.replace(/^1 /, "1º ");
  const elisione = giorno === 8 || giorno === 11;
  if (prep === "al") return elisione ? `all'${testo}` : `al ${testo}`;
  return elisione ? `l'${testo}` : `il ${testo}`;
}

/** Testo del prezzo, per esempio "30 € al mese + IVA". */
export function testoPrezzo(prezzo: PrezzoAbbonamento): string {
  const importo = (prezzo.amount / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: prezzo.currency.toUpperCase(),
    minimumFractionDigits: prezzo.amount % 100 === 0 ? 0 : 2,
  });
  const periodo =
    prezzo.interval === "year" ? "all'anno" : prezzo.interval === "month" ? "al mese" : "";
  // L'IVA si scrive solo se il Checkout la calcola davvero (Stripe Tax).
  const iva = !prezzo.automaticTax
    ? ""
    : prezzo.taxBehavior === "exclusive"
      ? " + IVA"
      : prezzo.taxBehavior === "inclusive"
        ? " IVA inclusa"
        : "";
  return `${importo}${periodo ? ` ${periodo}` : ""}${iva}`;
}

export async function leggiLicenzaSalvata(): Promise<LicenzaServer | null> {
  try {
    const raw = await storageService.getPreference(CHIAVE_LICENZA);
    if (!raw) return null;
    const salvata = JSON.parse(raw) as LicenzaSalvata;
    return salvata?.licenza && typeof salvata.licenza.required === "boolean" ? salvata.licenza : null;
  } catch {
    return null;
  }
}

/** Salva la licenza ricevuta dal server e avvisa l'app. */
export async function salvaLicenza(licenza: LicenzaServer): Promise<void> {
  const salvata: LicenzaSalvata = { licenza, ricevutaIl: new Date().toISOString() };
  try {
    await storageService.setPreference(CHIAVE_LICENZA, JSON.stringify(salvata));
  } catch (error) {
    console.error("Licenza non salvata:", error);
  }
  window.dispatchEvent(new CustomEvent(EVENTO_LICENZA, { detail: licenza }));
}

function apiUrl(): string | null {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  return url ? url.replace(/\/+$/, "") : null;
}

function messaggioErrore(error: unknown, ripiego: string): { errore: string; codice?: string } {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return { errore: "Nessuna risposta dal server Corioli: controlla la connessione a internet e riprova." };
    }
    const data = error.response.data as { error?: unknown; code?: unknown } | undefined;
    if (typeof data?.error === "string") {
      return { errore: data.error, codice: typeof data.code === "string" ? data.code : undefined };
    }
  }
  return { errore: ripiego };
}

async function chiama<T>(
  metodo: "get" | "post",
  percorso: string,
  corpo: unknown,
  ripiego: string,
): Promise<Esito<T>> {
  const base = apiUrl();
  if (!base) return { ok: false, errore: "Servizio online non configurato." };
  try {
    const res =
      metodo === "get"
        ? await axios.get<T>(`${base}${percorso}`, { timeout: 20_000 })
        : await axios.post<T>(`${base}${percorso}`, corpo, { timeout: 20_000 });
    return { ok: true, dati: res.data };
  } catch (error) {
    return { ok: false, ...messaggioErrore(error, ripiego) };
  }
}

/** Apre una pagina nel browser predefinito (in Electron), o in una scheda nuova. */
export async function apriNelBrowser(url: string): Promise<boolean> {
  const api = (window as unknown as {
    electronAPI?: { openExternal?: (u: string) => Promise<{ ok?: boolean }> };
  }).electronAPI;
  if (api?.openExternal) {
    const esito = await api.openExternal(url);
    return Boolean(esito?.ok);
  }
  return window.open(url, "_blank", "noopener,noreferrer") !== null;
}

/** Chiede al server lo stato aggiornato (riallineato con Stripe) e lo salva. */
export async function aggiornaLicenza(clientId: string): Promise<Esito<LicenzaServer>> {
  const esito = await chiama<{ license: LicenzaServer }>(
    "post",
    "/billing/status",
    { id: clientId },
    "Stato dell'abbonamento non verificato.",
  );
  if (!esito.ok) return esito;
  await salvaLicenza(esito.dati.license);
  return { ok: true, dati: esito.dati.license };
}

export async function leggiPrezzo(): Promise<Esito<PrezzoAbbonamento>> {
  const esito = await chiama<{ price: PrezzoAbbonamento }>("get", "/billing/price", undefined, "Prezzo non disponibile.");
  return esito.ok ? { ok: true, dati: esito.dati.price } : esito;
}

/** Crea la pagina di pagamento Stripe e la apre nel browser. */
export async function avviaAbbonamento(clientId: string): Promise<Esito<{ url: string }>> {
  const esito = await chiama<{ url: string }>(
    "post",
    "/billing/checkout",
    { id: clientId },
    "La pagina di pagamento non si è aperta. Riprova tra poco.",
  );
  if (esito.ok) await apriNelBrowser(esito.dati.url);
  return esito;
}

/** Portale Stripe: carta di pagamento, fatture, disdetta. */
export async function apriGestioneAbbonamento(clientId: string): Promise<Esito<{ url: string }>> {
  const esito = await chiama<{ url: string }>(
    "post",
    "/billing/portal",
    { id: clientId },
    "La gestione dell'abbonamento non si è aperta. Riprova tra poco.",
  );
  if (esito.ok) await apriNelBrowser(esito.dati.url);
  return esito;
}

export function richiediCodiceCollegamento(clientId: string, email: string) {
  return chiama<{ message: string; expiresInMinutes: number }>(
    "post",
    "/billing/link/request",
    { id: clientId, email: email.trim().toLowerCase() },
    "Codice non inviato. Riprova tra poco.",
  );
}

export async function confermaCodiceCollegamento(
  clientId: string,
  email: string,
  codice: string,
): Promise<Esito<LicenzaServer>> {
  const esito = await chiama<{ license: LicenzaServer }>(
    "post",
    "/billing/link/verify",
    { id: clientId, email: email.trim().toLowerCase(), otp: codice.replace(/\D/g, "") },
    "Codice non verificato. Riprova.",
  );
  if (!esito.ok) return esito;
  await salvaLicenza(esito.dati.license);
  return { ok: true, dati: esito.dati.license };
}

export function elencoComputerCollegati(clientId: string) {
  return chiama<ElencoComputer>("post", "/billing/computers", { id: clientId }, "Elenco dei computer non disponibile.");
}

export function scollegaComputer(clientId: string, targetId: string) {
  return chiama<ElencoComputer>(
    "post",
    "/billing/computers/unlink",
    { id: clientId, targetId },
    "Computer non scollegato. Riprova.",
  );
}
