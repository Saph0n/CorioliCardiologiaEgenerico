/**
 * Valori degli esami scritti in un'altra unita' di misura.
 *
 * Il laboratorio stampa la creatinina in mg/dL o in µmol/L, l'HbA1c in % o in
 * mmol/mol, l'ApoB in mg/dL o in g/L, a seconda del laboratorio. Chi copia dal
 * foglio scrive il numero che vede: 90 di creatinina in un campo in mg/dL e'
 * un eGFR di zero, e nessuna soglia clinica lo ferma perche' sembra un valore
 * patologico invece che un errore.
 *
 * Queste **non sono soglie cliniche** e non giudicano il paziente: dicono solo
 * che il numero non puo' essere nell'unita' del campo. Ci sono soltanto gli
 * esami per cui i valori nelle due unita' non si sovrappongono (una creatinina
 * di 25 mg/dL non si vede in ambulatorio, una di 25 µmol/L non esiste). Dove si
 * sovrappongono — azotemia, hs-PCR, insulina, albuminuria — il campo non dice
 * niente, perche' un suggerimento sbagliato sarebbe peggio di nessuno.
 * Il medico decide: la conversione si applica solo col suo clic.
 */

type RegolaUnita = {
  /** Unita' in cui il valore e' probabilmente scritto. */
  unita: string;
  /** Il valore e' sospetto se supera questo numero... */
  oltre?: number;
  /** ...o se sta sotto questo. */
  sotto?: number;
  /** Dal valore nell'altra unita' a quello nell'unita' del campo. */
  converti: (valore: number) => number;
  decimali: number;
};

/** Per chiave di misura (`lab.*`, `ecg.*`, `eco.*`), come in `MISURE` della visita. */
const REGOLE: Record<string, RegolaUnita> = {
  "lab.crea": { unita: "µmol/L", oltre: 20, converti: (v) => v / 88.4, decimali: 2 },
  "lab.uric": { unita: "µmol/L", oltre: 30, converti: (v) => v / 59.48, decimali: 1 },
  "lab.hb": { unita: "g/L", oltre: 30, converti: (v) => v / 10, decimali: 1 },
  // IFCC -> NGSP: % = 0,09148 x mmol/mol + 2,152.
  "lab.hba1c": { unita: "mmol/mol", oltre: 20, converti: (v) => v * 0.09148 + 2.152, decimali: 1 },
  "lab.gli": { unita: "mmol/L", sotto: 25, converti: (v) => v * 18.016, decimali: 0 },
  "lab.tot": { unita: "mmol/L", sotto: 20, converti: (v) => v * 38.67, decimali: 0 },
  "lab.hdl": { unita: "mmol/L", sotto: 5, converti: (v) => v * 38.67, decimali: 0 },
  "lab.ldl": { unita: "mmol/L", sotto: 8, converti: (v) => v * 38.67, decimali: 0 },
  "lab.tg": { unita: "mmol/L", sotto: 10, converti: (v) => v * 88.57, decimali: 0 },
  "lab.apob": { unita: "g/L", sotto: 3, converti: (v) => v * 100, decimali: 0 },
  "lab.fibr": { unita: "g/L", sotto: 10, converti: (v) => v * 100, decimali: 0 },
  // ECG: intervalli in ms. Scritti in secondi (0,40) non superano mai 2; in ms
  // non scendono sotto 40.
  "ecg.pr": { unita: "secondi", sotto: 2, converti: (v) => v * 1000, decimali: 0 },
  "ecg.qrs": { unita: "secondi", sotto: 2, converti: (v) => v * 1000, decimali: 0 },
  "ecg.qt": { unita: "secondi", sotto: 2, converti: (v) => v * 1000, decimali: 0 },
  // Eco: misure in mm. In cm i diametri stanno sotto 10, gli spessori sotto 3,
  // il TAPSE sotto 5; in mm nessuna di queste misure scende cosi' in basso.
  "eco.ddvs": { unita: "cm", sotto: 10, converti: (v) => v * 10, decimali: 0 },
  "eco.dsvs": { unita: "cm", sotto: 10, converti: (v) => v * 10, decimali: 0 },
  "eco.siv": { unita: "cm", sotto: 3, converti: (v) => v * 10, decimali: 0 },
  "eco.pp": { unita: "cm", sotto: 3, converti: (v) => v * 10, decimali: 0 },
  "eco.as": { unita: "cm", sotto: 10, converti: (v) => v * 10, decimali: 0 },
  "eco.rad": { unita: "cm", sotto: 10, converti: (v) => v * 10, decimali: 0 },
  "eco.aoasc": { unita: "cm", sotto: 10, converti: (v) => v * 10, decimali: 0 },
  "eco.tapse": { unita: "cm", sotto: 5, converti: (v) => v * 10, decimali: 0 },
};

export type SuggerimentoUnita = {
  /** Unita' in cui il numero sembra scritto, es. "µmol/L". */
  unita: string;
  /** Il valore convertito nell'unita' del campo, gia' arrotondato. */
  valore: number;
  /** Il valore convertito con la virgola, come si mostra. */
  testo: string;
};

/** Il numero sembra in un'altra unita'? Se si', la conversione proposta. */
export function suggerisciUnita(
  chiave: string,
  valore: number | undefined,
): SuggerimentoUnita | null {
  const regola = REGOLE[chiave];
  if (!regola || valore == null || !Number.isFinite(valore) || valore <= 0) return null;
  const sospetto =
    (regola.oltre != null && valore > regola.oltre) ||
    (regola.sotto != null && valore < regola.sotto);
  if (!sospetto) return null;
  const convertito = Number(regola.converti(valore).toFixed(regola.decimali));
  return {
    unita: regola.unita,
    valore: convertito,
    testo: convertito.toFixed(regola.decimali).replace(".", ","),
  };
}
