import { Visit, VisitFieldChange } from "../types/Storage";

/**
 * Utility per la cronologia delle modifiche di una visita.
 *
 * Confronta due versioni di una visita e produce l'elenco dei campi modificati,
 * con etichette in italiano e valori (precedente / nuovo) già formattati per
 * la visualizzazione. I valori sono salvati come stringhe per non duplicare in
 * cronologia dati pesanti (es. immagini allegate in base64).
 */

const TIPO_LABELS: Record<string, string> = {
  generale: "Generale",
};

const TOP_LEVEL_LABELS: Record<string, string> = {
  dataVisita: "Data visita",
  descrizioneClinica: "Descrizione clinica",
  anamnesi: "Anamnesi",
  esamiObiettivo: "Esame obiettivo",
  conclusioniDiagnostiche: "Conclusioni diagnostiche",
  terapie: "Terapie",
  tipo: "Tipo visita",
};

const ANAMNESI_LABELS: Record<string, string> = {
  familiare: "Familiare",
  fisiologica: "Fisiologica",
  patologica: "Patologica",
  chirurgica: "Chirurgica",
  farmacologica: "Farmacologica",
  allergica: "Allergica",
  abitudini: "Abitudini di vita",
};

const VISITA_LABELS: Record<string, string> = {
  problemaClinico: "Problema clinico",
  prestazione: "Anamnesi",
  esameObiettivo: "Esame obiettivo",
  accertamenti: "Accertamenti",
  terapiaSpecifica: "Conclusioni e terapia",
  pesoCorporeo: "Peso corporeo",
  pressioneArteriosa: "Pressione arteriosa",
  posizionePa: "Posizione della pressione",
  pressioneArteriosa2: "Pressione arteriosa, 2ª misurazione",
  posizionePa2: "Posizione della 2ª misurazione",
  frequenzaCardiaca: "Frequenza cardiaca",
  fumatore: "Fumatore",
  categoriaRischioCv: "Classe di rischio CV",
  immagini: "Immagini allegate",
  // Sotto-blocchi: confrontati a parte, qui solo per completezza dell'etichetta.
  ecg: "ECG",
  ecocardiogramma: "Ecocardiogramma",
  tcCoronarica: "TC coronarica",
  laboratorio: "Laboratorio",
  testErgometrico: "Test ergometrico",
  holterEcg: "Holter ECG",
  holterPressorio: "Holter pressorio",
  dopplerTsa: "Doppler TSA",
};

const ECG_LABELS: Record<string, string> = {
  ritmo: "Ritmo",
  pr: "PR (ms)",
  qrs: "QRS (ms)",
  qt: "QT (ms)",
  asse: "Asse QRS",
  referto: "Referto",
};

const ECO_LABELS: Record<string, string> = {
  ddvs: "DTD ventricolo sx (mm)",
  dsvs: "DTS ventricolo sx (mm)",
  siv: "Setto interventricolare (mm)",
  pp: "Parete posteriore (mm)",
  fe: "Frazione di eiezione (%)",
  atrioSinistro: "Atrio sinistro (mm)",
  gradienteAorticoMedio: "Gradiente aortico medio (mmHg)",
  gradienteAorticoMassimo: "Gradiente aortico massimo (mmHg)",
  areaValvolareAortica: "Area valvolare aortica (cm²)",
  gradienteMitralicoMedio: "Gradiente mitralico medio (mmHg)",
  gradienteMitralicoMassimo: "Gradiente mitralico massimo (mmHg)",
  radiceAortica: "Radice aortica (mm)",
  aortaAscendente: "Aorta ascendente (mm)",
  tapse: "TAPSE (mm)",
  paps: "PAPs (mmHg)",
  rapportoEA: "Rapporto E/A",
  rapportoEe: "Rapporto E/e'",
  referto: "Referto",
};

const TC_LABELS: Record<string, string> = {
  dataEsame: "Data esame",
  struttura: "Struttura",
  cacScore: "Calcium score",
  cadRads: "CAD-RADS",
  referto: "Referto",
};

const ERG_LABELS: Record<string, string> = {
  dataEsame: "Data esame",
  protocollo: "Protocollo",
  durataMin: "Durata (min)",
  caricoWatt: "Carico max (watt)",
  mets: "METs",
  fcMax: "FC max raggiunta (bpm)",
  fcMaxTeoricaPct: "% FC max teorica",
  paMax: "P.A. al picco",
  motivoInterruzione: "Motivo interruzione",
  esito: "Esito",
  referto: "Referto",
};

const HOLTER_ECG_LABELS: Record<string, string> = {
  dataEsame: "Data inizio",
  durataOre: "Durata (ore)",
  fcMedia: "FC media (bpm)",
  fcMin: "FC minima (bpm)",
  fcMax: "FC massima (bpm)",
  besv: "BESV / 24h",
  bev: "BEV / 24h",
  pausaMaxSec: "Pausa max (s)",
  ritmoPrevalente: "Ritmo prevalente",
  referto: "Referto",
};

const DOPPLER_TSA_LABELS: Record<string, string> = {
  dataEsame: "Data esame",
  struttura: "Struttura",
  imtMax: "IMT massimo (mm)",
  stenosiCarotidea: "ATS carotidea (%)",
  sedeStenosi: "Sede della stenosi",
  placche: "Placche",
  vertebrali: "Assi vertebrali",
  referto: "Referto",
};

const HOLTER_PA_LABELS: Record<string, string> = {
  dataEsame: "Data inizio",
  media24Sist: "Media 24h sistolica",
  media24Diast: "Media 24h diastolica",
  mediaDiurnaSist: "Media diurna sistolica",
  mediaDiurnaDiast: "Media diurna diastolica",
  mediaNotturnaSist: "Media notturna sistolica",
  mediaNotturnaDiast: "Media notturna diastolica",
  caloNotturnoPct: "Calo notturno (%)",
  caricoPressorioPct: "Carico pressorio (%)",
  referto: "Referto",
};

const LAB_LABELS: Record<string, string> = {
  dataPrelievo: "Data prelievo",
  colesteroloTotale: "Colesterolo totale",
  hdl: "HDL",
  trigliceridi: "Trigliceridi",
  ldlMisurato: "LDL dosato",
  apoB: "ApoB",
  lpa: "Lp(a)",
  glicemia: "Glicemia",
  insulina: "Insulinemia",
  hba1c: "Emoglobina glicata",
  creatinina: "Creatinina",
  albuminuria: "Albuminuria",
  emoglobina: "Emoglobina",
  ast: "AST",
  alt: "ALT",
  uricemia: "Uricemia",
  azotemia: "Azotemia",
  tsh: "TSH",
  hsPcr: "hs-PCR",
  oxLdl: "LDL ossidate",
  fibrinogeno: "Fibrinogeno",
};

/** Converte una chiave camelCase in un'etichetta leggibile (fallback). */
function prettifyKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** True se il valore è "vuoto" (assente, stringa vuota, array vuoto). */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Formatta un valore (non oggetto) come stringa leggibile. */
function formatScalar(value: unknown, key?: string): string {
  if (isEmpty(value)) return "(vuoto)";
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (key === "tipo" && typeof value === "string") {
    return TIPO_LABELS[value] ?? value;
  }
  if (Array.isArray(value)) {
    return `${value.length} immagine${value.length === 1 ? "" : "i"}`;
  }
  return String(value);
}

/** Confronto "morbido": tratta vuoti equivalenti come uguali. */
function scalarEquals(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    const la = Array.isArray(a) ? a.length : 0;
    const lb = Array.isArray(b) ? b.length : 0;
    if (la !== lb) return false;
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  return a === b;
}

function pushScalarChange(
  changes: VisitFieldChange[],
  field: string,
  label: string,
  oldValue: unknown,
  newValue: unknown,
  key?: string,
): void {
  if (scalarEquals(oldValue, newValue)) return;
  changes.push({
    field,
    label,
    previousValue: formatScalar(oldValue, key),
    newValue: formatScalar(newValue, key),
  });
}

/** Confronta un oggetto annidato (anamnesi, visita) chiave per chiave. */
function diffNested(
  changes: VisitFieldChange[],
  sectionKey: string,
  sectionLabel: string,
  oldObj: Record<string, unknown> | undefined,
  newObj: Record<string, unknown> | undefined,
  labels: Record<string, string>,
): void {
  const a = oldObj ?? {};
  const b = newObj ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    const label = `${sectionLabel} · ${labels[key] ?? prettifyKey(key)}`;
    const field = `${sectionKey}.${key}`;
    const oldVal = a[key];
    const newVal = b[key];

    pushScalarChange(changes, field, label, oldVal, newVal, key);
  }
}

/**
 * Calcola l'elenco dei campi modificati tra due versioni della visita.
 * Ignora i metadati (id, createdAt, updatedAt, revisions).
 */
export function computeVisitChanges(
  oldVisit: Visit,
  newVisit: Visit,
): VisitFieldChange[] {
  const changes: VisitFieldChange[] = [];

  const oldRecord = oldVisit as unknown as Record<string, unknown>;
  const newRecord = newVisit as unknown as Record<string, unknown>;
  for (const key of Object.keys(TOP_LEVEL_LABELS)) {
    pushScalarChange(
      changes,
      key,
      TOP_LEVEL_LABELS[key],
      oldRecord[key],
      newRecord[key],
      key,
    );
  }

  diffNested(
    changes,
    "anamnesiStrutturata",
    "Anamnesi",
    oldVisit.anamnesiStrutturata as Record<string, unknown> | undefined,
    newVisit.anamnesiStrutturata as Record<string, unknown> | undefined,
    ANAMNESI_LABELS,
  );

  // I sotto-blocchi sono confrontati a parte: `diffNested` compara solo scalari,
  // altrimenti un oggetto annidato finirebbe in cronologia come "[object Object]".
  const visitaScalari = (v: Visit): Record<string, unknown> | undefined => {
    if (!v.visita) return undefined;
    const {
      ecg,
      ecocardiogramma,
      tcCoronarica,
      laboratorio,
      testErgometrico,
      holterEcg,
      holterPressorio,
      dopplerTsa,
      ...resto
    } = v.visita;
    void ecg;
    void ecocardiogramma;
    void tcCoronarica;
    void laboratorio;
    void testErgometrico;
    void holterEcg;
    void holterPressorio;
    void dopplerTsa;
    return resto as Record<string, unknown>;
  };

  diffNested(
    changes,
    "visita",
    "Visita",
    visitaScalari(oldVisit),
    visitaScalari(newVisit),
    VISITA_LABELS,
  );

  diffNested(
    changes,
    "visita.ecg",
    "ECG",
    oldVisit.visita?.ecg as Record<string, unknown> | undefined,
    newVisit.visita?.ecg as Record<string, unknown> | undefined,
    ECG_LABELS,
  );

  diffNested(
    changes,
    "visita.ecocardiogramma",
    "Ecocardiogramma",
    oldVisit.visita?.ecocardiogramma as Record<string, unknown> | undefined,
    newVisit.visita?.ecocardiogramma as Record<string, unknown> | undefined,
    ECO_LABELS,
  );

  diffNested(
    changes,
    "visita.tcCoronarica",
    "TC coronarica",
    oldVisit.visita?.tcCoronarica as Record<string, unknown> | undefined,
    newVisit.visita?.tcCoronarica as Record<string, unknown> | undefined,
    TC_LABELS,
  );

  diffNested(
    changes,
    "visita.laboratorio",
    "Laboratorio",
    oldVisit.visita?.laboratorio as Record<string, unknown> | undefined,
    newVisit.visita?.laboratorio as Record<string, unknown> | undefined,
    LAB_LABELS,
  );

  diffNested(
    changes,
    "visita.testErgometrico",
    "Test ergometrico",
    oldVisit.visita?.testErgometrico as Record<string, unknown> | undefined,
    newVisit.visita?.testErgometrico as Record<string, unknown> | undefined,
    ERG_LABELS,
  );

  diffNested(
    changes,
    "visita.holterEcg",
    "Holter ECG",
    oldVisit.visita?.holterEcg as Record<string, unknown> | undefined,
    newVisit.visita?.holterEcg as Record<string, unknown> | undefined,
    HOLTER_ECG_LABELS,
  );

  diffNested(
    changes,
    "visita.holterPressorio",
    "Holter pressorio",
    oldVisit.visita?.holterPressorio as Record<string, unknown> | undefined,
    newVisit.visita?.holterPressorio as Record<string, unknown> | undefined,
    HOLTER_PA_LABELS,
  );

  diffNested(
    changes,
    "visita.dopplerTsa",
    "Doppler TSA",
    oldVisit.visita?.dopplerTsa as Record<string, unknown> | undefined,
    newVisit.visita?.dopplerTsa as Record<string, unknown> | undefined,
    DOPPLER_TSA_LABELS,
  );

  return changes;
}
