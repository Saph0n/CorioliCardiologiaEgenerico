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
  posizionePa: "Posizione della P.A.",
  frequenzaCardiaca: "Frequenza cardiaca",
  pressioneArteriosa2: "Pressione arteriosa (2ª misurazione)",
  posizionePa2: "Posizione della 2ª P.A.",
  frequenzaCardiaca2: "Frequenza cardiaca (2ª misurazione)",
  circonferenzaVita: "Circonferenza vita",
  immagini: "Immagini allegate",
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

  diffNested(
    changes,
    "visita",
    "Visita",
    oldVisit.visita as Record<string, unknown> | undefined,
    newVisit.visita as Record<string, unknown> | undefined,
    VISITA_LABELS,
  );

  return changes;
}
