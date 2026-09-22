/**
 * La colonna dei pazienti da tenere d'occhio, in dashboard.
 *
 * Nasce dalla richiesta del 22 settembre 2026: accanto a "Pazienti recenti" e
 * "Visite recenti" serviva una terza colonna che tenesse **sotto gli occhi i
 * pazienti piu' a rischio**, come in ginecologia la tabella delle gravidanze
 * in corso. Li' la coorte e' ovvia e il numero da vedere a colpo d'occhio e' la
 * settimana; qui la coorte e' chi il cardiologo ha dichiarato a rischio alto o
 * molto alto, e il numero e' la distanza dall'obiettivo di LDL.
 *
 * Non aggiunge niente da scrivere: la classe di rischio e gli esami sono gia'
 * nelle visite. E non calcola il rischio per conto suo — la classe resta quella
 * che il medico ha dichiarato, come dice `rischioCv.ts`: questa e' solo la
 * lista di chi l'ha, messa in ordine.
 */

import type { Visit } from "../types/Storage";
import { calcolaLdlFriedewald } from "./cardioCalcs";
import {
  CATEGORIE_RISCHIO_CV,
  TARGET_LDL,
  confrontaConTarget,
  type CategoriaRischioCv,
} from "./rischioCv";

/** Da dove viene il valore di LDL mostrato. */
export type FonteLdl = "dosato" | "stimato";

/** Una riga della colonna: un paziente, con quello che lo ci ha portato. */
export interface VoceRischio {
  patientId: string;
  /** Classe dichiarata dal medico nell'ultima visita che la indica. */
  categoria: CategoriaRischioCv;
  /** Data della visita da cui viene la classe. */
  dataClasse: string;
  /** LDL piu' recente, dosato o stimato con Friedewald. */
  ldl?: number;
  fonteLdl?: FonteLdl;
  /** Data del prelievo (o della visita) da cui viene l'LDL. */
  dataLdl?: string;
  /** Obiettivo di LDL della classe, in mg/dL. */
  obiettivo: number;
  /** Quanto l'LDL sta sopra l'obiettivo; assente se l'LDL non c'e'. */
  scostamento?: number;
  /** `true` quando l'LDL e' entro l'obiettivo della sua classe. */
  aTarget: boolean;
}

/** Classi che entrano in colonna anche quando sono gia' a bersaglio. */
const CLASSI_DA_SORVEGLIARE: CategoriaRischioCv[] = [
  "alto",
  "molto-alto",
  "molto-alto-ricorrente",
];

/** Peso della classe per l'ordinamento: piu' alto, piu' grave. */
function gravita(categoria: CategoriaRischioCv): number {
  return CATEGORIE_RISCHIO_CV.indexOf(categoria);
}

function piuRecente(a: Visit, b: Visit): number {
  return new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime();
}

/** L'LDL di una visita: il dosato se c'e', altrimenti Friedewald. */
function ldlDellaVisita(
  visita: Visit,
): { valore: number; fonte: FonteLdl; data: string } | null {
  const lab = visita.visita?.laboratorio;
  if (!lab) return null;
  const data = lab.dataPrelievo || visita.dataVisita;
  if (lab.ldlMisurato != null && lab.ldlMisurato > 0) {
    return { valore: lab.ldlMisurato, fonte: "dosato", data };
  }
  const stimato = calcolaLdlFriedewald(
    lab.colesteroloTotale,
    lab.hdl,
    lab.trigliceridi,
  );
  return stimato.ok
    ? { valore: stimato.result.value, fonte: "stimato", data }
    : null;
}

/**
 * I pazienti da tenere d'occhio, dal piu' grave.
 *
 * La classe e l'LDL si prendono da **due visite diverse quando serve**: la
 * classe dall'ultima che la dichiara, l'LDL dall'ultimo prelievo che c'e' in
 * archivio. Un controllo senza esami non cancella il pannello di sei mesi
 * prima, che e' quello su cui il medico sta ancora ragionando.
 *
 * Entra in lista chi e' di classe alta o molto alta, e chiunque altro sia fuori
 * dall'obiettivo della propria classe. Chi non ha una classe dichiarata resta
 * fuori: il rischio lo attribuisce il medico, e l'app non lo indovina.
 */
export function pazientiDaTenereDOcchio(
  visite: Visit[],
  limite = 5,
): VoceRischio[] {
  const perPaziente = new Map<string, Visit[]>();
  for (const visita of visite) {
    const elenco = perPaziente.get(visita.patientId);
    if (elenco) elenco.push(visita);
    else perPaziente.set(visita.patientId, [visita]);
  }

  const voci: VoceRischio[] = [];
  for (const [patientId, elenco] of perPaziente) {
    const ordinate = [...elenco].sort(piuRecente);
    const conClasse = ordinate.find((v) => v.visita?.categoriaRischioCv);
    const categoria = conClasse?.visita?.categoriaRischioCv;
    if (!conClasse || !categoria) continue;

    let ldl: ReturnType<typeof ldlDellaVisita> = null;
    for (const visita of ordinate) {
      ldl = ldlDellaVisita(visita);
      if (ldl) break;
    }

    const confronto = confrontaConTarget(ldl?.valore, categoria, TARGET_LDL);
    const daSorvegliare =
      CLASSI_DA_SORVEGLIARE.includes(categoria) ||
      (confronto != null && !confronto.aTarget);
    if (!daSorvegliare) continue;

    voci.push({
      patientId,
      categoria,
      dataClasse: conClasse.dataVisita,
      ...(ldl
        ? { ldl: ldl.valore, fonteLdl: ldl.fonte, dataLdl: ldl.data }
        : {}),
      obiettivo: TARGET_LDL[categoria].mgdl,
      ...(confronto && !confronto.aTarget
        ? { scostamento: confronto.scostamento }
        : {}),
      aTarget: confronto?.aTarget ?? false,
    });
  }

  // Prima la classe, poi quanto si e' lontani dall'obiettivo: la colonna deve
  // rispondere a "chi e' messo peggio", e la classe la decide il medico mentre
  // lo scostamento e' la misura di quanto resta da fare.
  voci.sort((a, b) => {
    const perClasse = gravita(b.categoria) - gravita(a.categoria);
    if (perClasse !== 0) return perClasse;
    const perScostamento = (b.scostamento ?? -1) - (a.scostamento ?? -1);
    if (perScostamento !== 0) return perScostamento;
    return new Date(b.dataClasse).getTime() - new Date(a.dataClasse).getTime();
  });

  return voci.slice(0, limite);
}

/**
 * Quanto riempire la barra della riga, da 0 a 1.
 *
 * Non e' una percentuale di rischio — non esiste — ma quanto l'LDL sta sopra il
 * suo obiettivo: pieno a un obiettivo mancato del doppio, che e' dove la
 * differenza smette di essere leggibile. A bersaglio la barra resta vuota.
 */
export function riempimentoBarra(voce: VoceRischio): number {
  if (voce.ldl == null || voce.scostamento == null) return 0;
  return Math.min(1, voce.scostamento / voce.obiettivo);
}
