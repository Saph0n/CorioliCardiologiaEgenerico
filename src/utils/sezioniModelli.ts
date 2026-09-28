/**
 * Dove compare un modello: la sezione del referto o il documento, e se nella
 * visita di questo medico quella sezione c'e'.
 *
 * Editor dei modelli, elenco in Impostazioni e visita devono dire la stessa
 * cosa, e per questo l'elenco sta qui. Fino al 28 settembre 2026 non lo
 * facevano: l'editor proponeva la TC coronarica quando nella visita il
 * pulsante «Modello» non c'era (tolto l'8 settembre, rimesso il 28), e non
 * proponeva Holter, test ergometrico, Doppler, scompenso e fibrillazione
 * atriale, che invece ce l'hanno. In Impostazioni le sezioni comparivano col
 * nome tecnico ("HolterEcg", "DopplerTsa").
 *
 * Il test `sezioniModelli.test.ts` confronta questo elenco con i pulsanti
 * «Modello» della visita.
 */

import type { MedicalTemplate } from "../types/Storage";
import {
  ANAMNESI_STRUTTURATA_FIELDS,
  getAnamnesiEtichette,
  getAnamnesiMode,
  getCampiAttivi,
  resolveAnamnesiLabel,
  type AnamnesiConfig,
} from "./anamnesiStrutturata";
import {
  moduliCheRichiedono,
  type ChiaveModuloOpzionale,
  type ModuliVisitaAttivi,
} from "./moduliVisita";

type Sezione = MedicalTemplate["section"];

export interface SezioneVisitaConModelli {
  sezione: Sezione;
  etichetta: string;
  /** Il modulo facoltativo di cui fa parte: senza, la sezione c'e' sempre. */
  modulo?: ChiaveModuloOpzionale;
}

/**
 * Le sezioni della visita col pulsante «Modello», nell'ordine della maschera.
 * L'anamnesi divisa in sezioni ha un pulsante per sezione, a parte.
 */
export const SEZIONI_VISITA_CON_MODELLI: readonly SezioneVisitaConModelli[] = [
  { sezione: "prestazione", etichetta: "Anamnesi" },
  { sezione: "esameObiettivo", etichetta: "Esame obiettivo" },
  { sezione: "ecg", etichetta: "Elettrocardiogramma" },
  { sezione: "ecocardiogramma", etichetta: "Ecocardiogramma", modulo: "ecocardiogramma" },
  { sezione: "tcCoronarica", etichetta: "TC coronarica", modulo: "tcCoronarica" },
  { sezione: "testErgometrico", etichetta: "Test ergometrico", modulo: "testErgometrico" },
  { sezione: "holterEcg", etichetta: "Holter ECG", modulo: "holterEcg" },
  { sezione: "holterPressorio", etichetta: "Holter pressorio", modulo: "holterPressorio" },
  { sezione: "dopplerTsa", etichetta: "Doppler TSA", modulo: "dopplerTsa" },
  { sezione: "scompenso", etichetta: "Scompenso cardiaco", modulo: "scompenso" },
  {
    sezione: "fibrillazioneAtriale",
    etichetta: "Fibrillazione atriale",
    modulo: "fibrillazioneAtriale",
  },
  { sezione: "conclusioni", etichetta: "Conclusioni e terapia" },
];

/**
 * Il modulo si vede nella visita: e' acceso, o lo porta un modulo acceso
 * (lo scompenso porta l'ecocardiogramma, da cui legge la FE).
 */
export function moduloNellaVisita(
  chiave: ChiaveModuloOpzionale,
  moduli: ModuliVisitaAttivi,
): boolean {
  return (
    Boolean(moduli[chiave]) ||
    moduliCheRichiedono(chiave).some((c) => moduloNellaVisita(c, moduli))
  );
}

/** La sezione c'e' nella visita di chi ha questi moduli accesi. */
export function sezioneNellaVisita(
  sezione: SezioneVisitaConModelli,
  moduli: ModuliVisitaAttivi,
): boolean {
  return !sezione.modulo || moduloNellaVisita(sezione.modulo, moduli);
}

export interface DoveCompare {
  /** Dove va il modello, in parole. */
  etichetta: string;
  /**
   * Perche' nella visita non si vede, quando non si vede: due o tre parole,
   * da stare su una riga sotto il nome della sezione.
   */
  nascosto?: string;
}

/** La chiave della sezione dell'anamnesi a cui punta il modello, se e' dell'anamnesi. */
function campoAnamnesi(sezione: Sezione, anamnesi: AnamnesiConfig): string | undefined {
  const predefinito = ANAMNESI_STRUTTURATA_FIELDS.find((f) => f.templateSection === sezione);
  if (predefinito) return predefinito.key;
  // Sezioni personalizzate: la sezione del modello e' la chiave stessa.
  if (sezione.startsWith("custom_") || anamnesi.generale?.campi.includes(sezione)) {
    return sezione;
  }
  return undefined;
}

export function doveCompareModello(
  modello: Pick<MedicalTemplate, "category" | "section">,
  contesto: { moduli: ModuliVisitaAttivi; anamnesi: AnamnesiConfig },
): DoveCompare {
  switch (modello.category) {
    case "terapie":
      return { etichetta: "Conclusioni e terapia" };
    case "ricette":
      return { etichetta: "Ricetta" };
    case "esame_complementare":
      return { etichetta: "Richiesta di esame" };
    case "certificato":
      return { etichetta: "Certificato" };
  }

  const strutturata = getAnamnesiMode(contesto.anamnesi, "generale") === "strutturata";
  if (modello.section === "prestazione") {
    return {
      etichetta: "Anamnesi",
      nascosto: strutturata ? "Anamnesi divisa in sezioni" : undefined,
    };
  }

  const sezione = SEZIONI_VISITA_CON_MODELLI.find((s) => s.sezione === modello.section);
  if (sezione) {
    return {
      etichetta: sezione.etichetta,
      nascosto: sezioneNellaVisita(sezione, contesto.moduli) ? undefined : "Modulo spento",
    };
  }

  const campo = campoAnamnesi(modello.section, contesto.anamnesi);
  if (campo) {
    const etichette = getAnamnesiEtichette(contesto.anamnesi, "generale");
    const etichetta = `Anamnesi · ${resolveAnamnesiLabel(campo, etichette)}`;
    if (!strutturata) return { etichetta, nascosto: "Anamnesi a campo unico" };
    const attiva = getCampiAttivi(contesto.anamnesi, "generale").some(
      (c) => c.templateSection === modello.section,
    );
    return { etichetta, nascosto: attiva ? undefined : "Sezione spenta" };
  }

  return { etichetta: modello.section, nascosto: "Non c'è nella visita" };
}
