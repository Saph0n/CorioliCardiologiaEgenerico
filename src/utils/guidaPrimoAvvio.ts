/**
 * Guida di primo avvio.
 *
 * Arriva dopo profilo e PIN, al primo ingresso nella dashboard, e fa due cose:
 * prepara quello che serve al primo referto (titolo, studio in intestazione,
 * moduli della visita) e poi fa **provare** l'app su un paziente di prova:
 * registrarlo, scrivere e stampare il referto, preparare un modello. I passi
 * stanno in `components/guida/passiGuida.ts`.
 *
 * Si apre da sola **una volta sola** e solo con l'archivio vuoto: chi aggiorna
 * da una versione precedente ha gia' i suoi pazienti e sa usare l'app, e il
 * cardiologo che la usa in ambulatorio non deve trovarsela davanti a una
 * visita. Chiusa in qualunque modo, finita o saltata, non torna piu' da sola:
 * si riapre da Aiuto.
 */

/** Evento per chi mostra l'archivio: la guida ha cancellato un paziente. */
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
 * Paziente registrato durante la prova, da cancellare alla fine.
 *
 * Sta nelle preferenze appena la guida lo vede nascere, non solo in memoria:
 * se l'app si chiude a meta' prova, al riavvio la guida chiede che cosa
 * farne invece di lasciarlo in archivio in mezzo ai pazienti veri. Il
 * cardiologo aveva chiesto di togliere i pazienti simulati perche' "fanno
 * confusione" (call del 18 settembre 2026).
 */
export const CHIAVE_PREF_PAZIENTE_PROVA = "guidaPazienteProva";

export function leggiPazienteProva(
  prefs: Record<string, unknown> | null | undefined,
): string | null {
  const id = prefs?.[CHIAVE_PREF_PAZIENTE_PROVA];
  return typeof id === "string" && id.trim() ? id : null;
}

/** Le preferenze con il paziente di prova registrato, o tolto con `null`. */
export function conPazienteProva(
  prefs: Record<string, unknown> | null | undefined,
  id: string | null,
): Record<string, unknown> {
  const prossime = { ...(prefs ?? {}) };
  if (id) prossime[CHIAVE_PREF_PAZIENTE_PROVA] = id;
  else delete prossime[CHIAVE_PREF_PAZIENTE_PROVA];
  return prossime;
}
