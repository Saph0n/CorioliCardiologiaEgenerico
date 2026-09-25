import { storageService } from "../services/StorageServiceFallback";

/**
 * Bozza locale della visita che si sta scrivendo.
 *
 * Un referto lungo si scrive in dieci minuti, e fino a "Salva" stava solo in
 * memoria: un crash, una mancanza di corrente o la finestra chiusa per
 * sbaglio lo facevano sparire. La bozza si scrive a ogni pausa di battitura
 * nello stesso archivio delle visite (il database locale in Electron) e alla
 * riapertura della visita si propone di riprenderla.
 *
 * Si cancella quando la visita si salva e quando si esce dalla maschera
 * dall'interno dell'app: in quel caso o si e' salvato o si e' confermato di
 * uscire senza salvare. Resta solo se l'app si e' chiusa con la visita aperta,
 * che e' esattamente il caso da coprire.
 */
export interface BozzaVisita<V = unknown, C = unknown, A = unknown> {
  /** ISO: quando e' stata scritta. */
  salvataIl: string;
  visitData: V;
  visitaData: C;
  anamnesiStrutturata: A;
}

const PREFISSO = "bozza_visita_";

/** Una bozza per visita esistente, una per "visita nuova" di ogni paziente. */
export function chiaveBozzaVisita(visitId: string | undefined, patientId: string): string {
  return visitId ? `${PREFISSO}${visitId}` : `${PREFISSO}nuova_${patientId}`;
}

export async function leggiBozzaVisita(chiave: string): Promise<BozzaVisita | null> {
  try {
    const grezza = await storageService.getPreference(chiave);
    if (!grezza) return null;
    const bozza = JSON.parse(grezza) as BozzaVisita;
    return bozza && typeof bozza.salvataIl === "string" ? bozza : null;
  } catch {
    return null;
  }
}

export async function scriviBozzaVisita(chiave: string, bozza: BozzaVisita): Promise<void> {
  try {
    await storageService.setPreference(chiave, JSON.stringify(bozza));
  } catch (error) {
    // Una bozza che non si scrive non deve disturbare chi sta scrivendo.
    console.error("Bozza della visita non salvata:", error);
  }
}

export async function cancellaBozzaVisita(chiave: string): Promise<void> {
  try {
    await storageService.setPreference(chiave, "");
  } catch {
    // come sopra
  }
}

/**
 * Se la bozza va proposta: sempre per una visita nuova, per una visita in
 * archivio solo se e' piu' recente dell'ultimo salvataggio (altrimenti e'
 * una bozza superata da un salvataggio fatto dopo).
 */
export function bozzaDaProporre(bozza: BozzaVisita | null, salvataIl?: string): boolean {
  if (!bozza) return false;
  if (!salvataIl) return true;
  return bozza.salvataIl > salvataIl;
}
