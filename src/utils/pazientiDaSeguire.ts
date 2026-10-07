import type { Patient, Visit } from "../types/Storage";
import {
  calcolaBmi,
  classeBmi,
  ETICHETTA_CLASSE_BMI,
  gradoObesita,
  gradoPa,
  parsePressione,
  rischioCirconferenzaVita,
  valutaOrtostatismo,
  conVirgola,
  eAdulto,
  type Pressione,
} from "./parametriVitali";
import { calculateAge } from "./dateUtils";

/**
 * La colonna "Pazienti da seguire" della dashboard: chi, all'ultima misura,
 * ha la pressione da ipertensione, un BMI da obesita' o un'ipotensione
 * ortostatica. E' la versione generale della colonna "Pazienti a rischio" di
 * Corioli Cardiologia, che li' parte dall'LDL e dalla classe di rischio.
 *
 * Conta solo l'**ultima** misura di ciascun parametro: chi aveva 160/100 due
 * anni fa e 128/80 all'ultima visita non e' da seguire per la pressione.
 * Ogni parametro pero' ha la sua ultima misura, anche se viene da visite
 * diverse: la pressione si misura sempre, il peso no.
 *
 * Sotto i 18 anni pressione e BMI non si giudicano con le soglie dell'adulto
 * (vedi `eAdulto`): un minore entra solo per la prova ortostatica.
 */

export type MotivoDaSeguire = "pressione" | "peso" | "ortostatismo";

export interface Segnalazione {
  motivo: MotivoDaSeguire;
  /** 1-3: quanto pesa nell'ordine e quale colore prende. */
  livello: 1 | 2 | 3;
  /** Il valore come si legge nella riga: "PA 152/94", "BMI 32,4". */
  valore: string;
  /** Spiegazione breve: "obesità I", "ipotensione ortostatica". */
  dettaglio: string;
  /** Data (ISO) della visita da cui viene la misura. */
  data: string;
}

export interface VoceDaSeguire {
  patientId: string;
  segnalazioni: Segnalazione[];
  /** Il livello piu' alto fra le segnalazioni: colore dell'avatar. */
  livello: 1 | 2 | 3;
  /** Ultima visita del paziente (ISO). */
  ultimaVisita: string;
  /** Valori dell'ultima misura, per la tabella della pagina dedicata. */
  pa: Pressione | null;
  bmi: number | null;
  circonferenzaVita: number | null;
}

/** Righe nella colonna della dashboard: come le altre due colonne. */
export const RIGHE_IN_DASHBOARD = 6;

function piuRecenteConValore<T>(
  visite: Visit[],
  estrai: (v: Visit) => T | null | undefined,
): { visita: Visit; valore: T } | null {
  for (const visita of visite) {
    const valore = estrai(visita);
    if (valore != null) return { visita, valore };
  }
  return null;
}

function ordinaPerData(visite: Visit[]): Visit[] {
  return [...visite].sort((a, b) => {
    const d = new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime();
    if (d !== 0) return d;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** "Obesità III" → "obesità III": il numero romano resta maiuscolo. */
const minuscolaIniziale = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

// Come le etichette sotto il campo della pressione (`ETICHETTA_CATEGORIA_PA`),
// e brevi: nella colonna della dashboard il grado deve restare leggibile.
const DETTAGLIO_GRADO_PA = ["", "ipertensione grado 1", "ipertensione grado 2", "ipertensione grado 3"];

/** La valutazione di un paziente, o `null` se non c'e' niente da segnalare. */
export function valutaPaziente(paziente: Patient, visite: Visit[]): VoceDaSeguire | null {
  const ordinate = ordinaPerData(visite.filter((v) => v.patientId === paziente.id));
  if (ordinate.length === 0) return null;
  const segnalazioni: Segnalazione[] = [];
  // L'eta' alla data della misura: chi aveva 16 anni alla visita non si
  // giudica con le soglie dell'adulto anche se oggi ne ha 19.
  const etaAlla = (v: Visit) => calculateAge(paziente.dataNascita, v.dataVisita);

  const ultimaPa = piuRecenteConValore(ordinate, (v) => parsePressione(v.visita?.pressioneArteriosa));
  if (ultimaPa && eAdulto(etaAlla(ultimaPa.visita))) {
    const grado = gradoPa(ultimaPa.valore);
    if (grado > 0) {
      segnalazioni.push({
        motivo: "pressione",
        livello: grado as 1 | 2 | 3,
        valore: `PA ${ultimaPa.valore.sistolica}/${ultimaPa.valore.diastolica}`,
        dettaglio: DETTAGLIO_GRADO_PA[grado],
        data: ultimaPa.visita.dataVisita,
      });
    }
  }

  // L'altezza sta in anagrafica, il peso nella visita.
  const altezza = paziente.altezza && paziente.altezza > 0 ? paziente.altezza : null;
  const ultimoPeso = piuRecenteConValore(ordinate, (v) =>
    v.visita?.pesoCorporeo && v.visita.pesoCorporeo > 0 ? v.visita.pesoCorporeo : null,
  );
  const bmi = ultimoPeso && altezza ? calcolaBmi(ultimoPeso.valore, altezza) : null;
  const ultimaVita = piuRecenteConValore(ordinate, (v) =>
    v.visita?.circonferenzaVita && v.visita.circonferenzaVita > 0 ? v.visita.circonferenzaVita : null,
  );
  if (bmi != null && ultimoPeso && eAdulto(etaAlla(ultimoPeso.visita))) {
    const grado = gradoObesita(bmi);
    if (grado > 0) {
      const vita = ultimaVita
        ? rischioCirconferenzaVita(ultimaVita.valore, paziente.sesso)
        : null;
      segnalazioni.push({
        motivo: "peso",
        livello: grado as 1 | 2 | 3,
        valore: `BMI ${conVirgola(bmi)}`,
        dettaglio:
          minuscolaIniziale(ETICHETTA_CLASSE_BMI[classeBmi(bmi)]) +
          (vita === "molto-aumentato" ? ", vita oltre soglia" : ""),
        data: ultimoPeso.visita.dataVisita,
      });
    }
  }

  // La prova ortostatica e' il confronto fra le due misurazioni di una
  // stessa visita (una in clino, una in orto): conta l'ultima visita che ne ha
  // una.
  const ultimaProva = piuRecenteConValore(ordinate, (v) =>
    valutaOrtostatismo(v.visita, etaAlla(v)),
  );
  if (ultimaProva) {
    const esito = ultimaProva.valore;
    if (esito.ipotensioneOrtostatica) {
      segnalazioni.push({
        motivo: "ortostatismo",
        livello: 2,
        valore: `−${esito.caloSistolico}/${esito.caloDiastolico}`,
        dettaglio: "ipotensione ortostatica",
        data: ultimaProva.visita.dataVisita,
      });
    } else if (esito.tachicardiaOrtostatica) {
      segnalazioni.push({
        motivo: "ortostatismo",
        livello: 1,
        valore: `FC +${esito.deltaFc}`,
        dettaglio: "tachicardia in ortostatismo",
        data: ultimaProva.visita.dataVisita,
      });
    }
  }

  if (segnalazioni.length === 0) return null;
  segnalazioni.sort((a, b) => b.livello - a.livello);

  return {
    patientId: paziente.id,
    segnalazioni,
    livello: segnalazioni[0].livello,
    ultimaVisita: ordinate[0].dataVisita,
    pa: ultimaPa?.valore ?? null,
    bmi,
    circonferenzaVita: ultimaVita?.valore ?? null,
  };
}

/**
 * I pazienti da seguire, dal piu' urgente: prima il livello piu' alto, poi chi
 * ha piu' motivi, poi la somma dei livelli, infine chi e' stato visto da meno
 * tempo (e' il primo che tornera').
 */
export function pazientiDaSeguire(
  pazienti: Patient[],
  visite: Visit[],
  limite = RIGHE_IN_DASHBOARD,
): VoceDaSeguire[] {
  const perPaziente = new Map<string, Visit[]>();
  for (const v of visite) {
    const elenco = perPaziente.get(v.patientId);
    if (elenco) elenco.push(v);
    else perPaziente.set(v.patientId, [v]);
  }

  const somma = (v: VoceDaSeguire) => v.segnalazioni.reduce((t, s) => t + s.livello, 0);
  return pazienti
    .map((p) => valutaPaziente(p, perPaziente.get(p.id) ?? []))
    .filter((v): v is VoceDaSeguire => v != null)
    .sort(
      (a, b) =>
        b.livello - a.livello ||
        b.segnalazioni.length - a.segnalazioni.length ||
        somma(b) - somma(a) ||
        b.ultimaVisita.localeCompare(a.ultimaVisita),
    )
    .slice(0, limite);
}
