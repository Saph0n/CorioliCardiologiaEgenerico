/**
 * Guida di primo avvio.
 *
 * Arriva dopo profilo e PIN, al primo ingresso nella dashboard, e fa due cose:
 * prepara quello che serve al primo referto (titolo, studio in intestazione,
 * moduli della visita) e poi fa **provare** l'app su pazienti di prova, che
 * esistono solo finche' dura la prova (`pazientiProva.ts`): cercarne uno per
 * codice fiscale, vederne esami e andamento, scrivere e stampare il referto,
 * trovare chi e' a rischio, preparare un modello. I passi stanno in
 * `components/guida/passiGuida.ts`.
 *
 * Si apre da sola **una volta sola** e solo con l'archivio vuoto: chi aggiorna
 * da una versione precedente ha gia' i suoi pazienti e sa usare l'app, e il
 * cardiologo che la usa in ambulatorio non deve trovarsela davanti a una
 * visita. Chiusa in qualunque modo, finita o saltata, non torna piu' da sola:
 * si riapre da Aiuto.
 */

/** Evento per chi mostra l'archivio: la guida ha scritto o cancellato i pazienti di prova. */
export const EVENTO_PAZIENTI_CAMBIATI = "corioli-pazienti-cambiati";

/** Chiave con cui l'esito della guida sta nelle preferenze. */
export const CHIAVE_PREF_GUIDA = "guidaPrimoAvvio";

export type EsitoGuida = "completata" | "saltata";

export interface StatoGuida {
  esito: EsitoGuida;
  /** Quando e' stata chiusa, ISO 8601. */
  data: string;
}

/**
 * Legge l'esito salvato. Tollera preferenze assenti o scritte male: qualunque
 * cosa non sia un esito riconosciuto vale "mai vista".
 */
export function leggiStatoGuida(
  prefs: Record<string, unknown> | null | undefined,
): StatoGuida | null {
  const salvato = prefs?.[CHIAVE_PREF_GUIDA];
  if (!salvato || typeof salvato !== "object") return null;
  const { esito, data } = salvato as Record<string, unknown>;
  if (esito !== "completata" && esito !== "saltata") return null;
  return { esito, data: typeof data === "string" ? data : "" };
}

/** La guida va aperta da sola: mai chiusa prima e archivio vuoto. */
export function deveAprirsiDaSola(
  prefs: Record<string, unknown> | null | undefined,
  numeroPazienti: number,
): boolean {
  return leggiStatoGuida(prefs) === null && numeroPazienti === 0;
}

/** Le preferenze con l'esito della guida registrato, senza toccare il resto. */
export function conStatoGuida(
  prefs: Record<string, unknown> | null | undefined,
  esito: EsitoGuida,
  adesso: Date = new Date(),
): Record<string, unknown> {
  const stato: StatoGuida = { esito, data: adesso.toISOString() };
  return { ...(prefs ?? {}), [CHIAVE_PREF_GUIDA]: stato };
}

/**
 * Le voci che la visita ha sempre, qualunque modulo sia acceso. Nella guida
 * stanno accanto agli interruttori, perche' chi sceglie i moduli sappia da che
 * cosa parte: l'elenco e' quello della call del 18 settembre 2026 (vedi
 * `moduliVisita.ts`).
 */
export const VOCI_FISSE_VISITA: readonly string[] = [
  "Anamnesi",
  "Motivo della visita",
  "Terapia in atto",
  "Esame obiettivo",
  "Pressione e parametri vitali",
  "Elettrocardiogramma",
  "Esami del sangue",
  "Rischio cardiovascolare",
  "Accertamenti",
  "Conclusioni e terapia",
] as const;

/**
 * I pazienti di prova in archivio (vedi `pazientiProva.ts`), da cancellare
 * alla fine della prova.
 *
 * Stanno nelle preferenze appena la guida li scrive, non solo in memoria: se
 * l'app si chiude a meta' prova, al riavvio si cancellano prima di tutto, e
 * non restano in archivio in mezzo ai pazienti veri. Il cardiologo aveva
 * chiesto di togliere i pazienti simulati perche' "fanno confusione" (call
 * del 18 settembre 2026).
 *
 * La chiave e' quella delle versioni che registravano un paziente solo, e
 * ci scrivevano il suo id come stringa: si legge anche cosi'.
 */
export const CHIAVE_PREF_PAZIENTI_PROVA = "guidaPazienteProva";

export function leggiPazientiProva(
  prefs: Record<string, unknown> | null | undefined,
): string[] {
  const salvato = prefs?.[CHIAVE_PREF_PAZIENTI_PROVA];
  const elenco = Array.isArray(salvato) ? salvato : [salvato];
  return elenco.filter((id): id is string => typeof id === "string" && id.trim() !== "");
}

/** Le preferenze con i pazienti di prova registrati, o tolti con un elenco vuoto. */
export function conPazientiProva(
  prefs: Record<string, unknown> | null | undefined,
  ids: string[],
): Record<string, unknown> {
  const prossime = { ...(prefs ?? {}) };
  if (ids.length > 0) prossime[CHIAVE_PREF_PAZIENTI_PROVA] = [...ids];
  else delete prossime[CHIAVE_PREF_PAZIENTI_PROVA];
  return prossime;
}
