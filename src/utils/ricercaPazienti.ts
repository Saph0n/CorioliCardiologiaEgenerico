import type { Patient } from "../types/Storage";

/**
 * Ricerca del paziente per cognome, nome o codice fiscale.
 *
 * Una sola funzione per tutti i punti in cui si cerca un paziente: il pannello
 * "Nuova visita", la ricerca globale (Ctrl+K) e l'elenco dei pazienti. Prima
 * il pannello cercava **solo** sul codice fiscale, mentre in anagrafica il CF
 * e' facoltativo: un paziente registrato senza CF da li' non si ritrovava, e il
 * medico il paziente lo cerca per cognome.
 */

type Cercabile = Pick<Patient, "nome" | "cognome" | "codiceFiscale">;

/** Minuscolo, senza accenti e senza apostrofi: "D'Angelò" e "dangelo" coincidono. */
export function normalizzaPerRicerca(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019`]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Se la stringa va letta come codice fiscale invece che come nome.
 *
 * Alfanumerica da 6 a 16 caratteri e con almeno una cifra (o lunga 16): cosi'
 * "elisabetta" resta una ricerca per nome.
 */
export function sembraCodiceFiscale(query: string): boolean {
  const q = query.replace(/\s/g, "").toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(q) && (/\d/.test(q) || q.length === 16);
}

/**
 * I pazienti che corrispondono alla ricerca, dal piu' pertinente.
 *
 * Ogni parola deve trovarsi nel nome o nel cognome, in qualunque ordine
 * ("rossi mario" e "mario rossi" danno lo stesso risultato). Prima chi ha il
 * cognome che comincia con la prima parola, poi chi ha una parola che comincia
 * cosi', poi il resto; a parita', in ordine di cognome. Una parola sola di
 * almeno quattro caratteri si cerca anche nel codice fiscale.
 */
export function cercaPazienti<T extends Cercabile>(pazienti: T[], query: string): T[] {
  const grezza = query.trim();
  if (!grezza) return [];

  if (sembraCodiceFiscale(grezza)) {
    const cf = grezza.replace(/\s/g, "").toUpperCase();
    return pazienti
      .filter((p) => (p.codiceFiscale ?? "").toUpperCase().includes(cf))
      .sort((a, b) => {
        const pa = (a.codiceFiscale ?? "").toUpperCase().startsWith(cf) ? 0 : 1;
        const pb = (b.codiceFiscale ?? "").toUpperCase().startsWith(cf) ? 0 : 1;
        return pa - pb || confrontaCognomi(a, b);
      });
  }

  const parole = normalizzaPerRicerca(grezza).split(/\s+/).filter(Boolean);
  const cfParziale =
    parole.length === 1 && parole[0].length >= 4 ? parole[0].toUpperCase() : null;

  const trovati: { paziente: T; rango: number }[] = [];
  for (const paziente of pazienti) {
    const cognome = normalizzaPerRicerca(paziente.cognome ?? "");
    const nome = normalizzaPerRicerca(paziente.nome ?? "");
    const perNome = parole.every((p) => cognome.includes(p) || nome.includes(p));
    if (perNome) {
      const inizioParola = (testo: string, p: string) =>
        testo.split(/[\s-]+/).some((w) => w.startsWith(p));
      const rango = cognome.startsWith(parole[0])
        ? 0
        : parole.every((p) => inizioParola(cognome, p) || inizioParola(nome, p))
          ? 1
          : 2;
      trovati.push({ paziente, rango });
      continue;
    }
    if (cfParziale && (paziente.codiceFiscale ?? "").toUpperCase().includes(cfParziale)) {
      trovati.push({ paziente, rango: 3 });
    }
  }

  return trovati
    .sort((a, b) => a.rango - b.rango || confrontaCognomi(a.paziente, b.paziente))
    .map((t) => t.paziente);
}

/** Data (YYYY-MM-DD) dell'ultima visita di ogni paziente. */
export function ultimaVisitaPerPaziente(
  visite: { patientId: string; dataVisita?: string }[],
): Map<string, string> {
  const ultime = new Map<string, string>();
  for (const v of visite) {
    const data = (v.dataVisita ?? "").slice(0, 10);
    if (!data) continue;
    const attuale = ultime.get(v.patientId);
    if (!attuale || data > attuale) ultime.set(v.patientId, data);
  }
  return ultime;
}

function confrontaCognomi(a: Cercabile, b: Cercabile): number {
  const ca = `${a.cognome ?? ""} ${a.nome ?? ""}`;
  const cb = `${b.cognome ?? ""} ${b.nome ?? ""}`;
  return ca.localeCompare(cb, "it", { sensitivity: "base" });
}
