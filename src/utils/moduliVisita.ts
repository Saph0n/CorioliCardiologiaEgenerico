/**
 * Moduli della visita che si possono spegnere, e stato in cui arrivano.
 *
 * Decisione della call con il dott. Trani del 18 settembre 2026, quella che ha
 * dato il via alla versione beta: la maschera che un cardiologo trova alla
 * prima apertura e' quella scarna — anamnesi, motivo, terapia in atto, esame
 * obiettivo, pressione, ECG, laboratorio, rischio, conclusioni. Tutto il resto
 * esiste ma parte spento, "in caso ti serva lo metti, in caso non ti serve no".
 *
 * L'ecocardiogramma e' entrato fra gli spegnibili il 22 settembre 2026: il
 * cardiologo lo dava per tolto dalla basic, e l'ha lasciato attivabile dalle
 * impostazioni come gli altri esami strumentali.
 *
 * I gruppi sono i suoi: gli esami strumentali che il cardiologo referta di rado
 * ("nessuno metterà mai la media, è già scritta dentro il foglio che ti
 * arriva") e le due valutazioni che vuole rivedere prima di darle in mano a
 * tutti ("manda fuori strada, è troppo delicato").
 *
 * Spegnere un modulo nasconde la sua parte di maschera, **non** i dati: una
 * visita in archivio che quel modulo l'ha compilato continua a mostrarlo, se no
 * riaprirla farebbe sparire dalla maschera dei valori che il referto stampa.
 */

/** Modulo della visita che l'utente puo' accendere e spegnere. */
export type ChiaveModuloOpzionale =
  | "ecocardiogramma"
  | "tcCoronarica"
  | "testErgometrico"
  | "holterEcg"
  | "holterPressorio"
  | "dopplerTsa"
  | "scompenso"
  | "fibrillazioneAtriale";

/** I due insiemi in cui il cardiologo li ha divisi. */
export type GruppoModuloOpzionale = "strumentali" | "valutazioni";

export interface ModuloOpzionale {
  chiave: ChiaveModuloOpzionale;
  /** Titolo del modulo nella maschera della visita. */
  titolo: string;
  /** Riga di spiegazione nelle impostazioni. */
  descrizione: string;
  gruppo: GruppoModuloOpzionale;
  /**
   * Modulo senza il quale questo non funziona, e che quindi si vede con lui
   * anche se spento: lo scompenso legge il fenotipo dalla FE, e la FE si scrive
   * nell'ecocardiogramma. Acceso da solo mostrerebbe un fenotipo che non si
   * puo' mai calcolare, perche' manca il campo da cui viene.
   */
  richiede?: ChiaveModuloOpzionale;
}

/**
 * Elenco nell'ordine in cui i moduli compaiono nella visita: le impostazioni
 * li mostrano cosi' come li si incontra scrivendo il referto.
 */
export const MODULI_OPZIONALI: readonly ModuloOpzionale[] = [
  {
    chiave: "ecocardiogramma",
    titolo: "Ecocardiogramma",
    descrizione: "Diametri e spessori del ventricolo sinistro, FE, gradienti, PAPs.",
    gruppo: "strumentali",
  },
  {
    chiave: "tcCoronarica",
    titolo: "TC coronarica",
    descrizione: "Calcium score, CAD-RADS e burden di placca.",
    gruppo: "strumentali",
  },
  {
    chiave: "testErgometrico",
    titolo: "Test ergometrico",
    descrizione: "Carico, METS e frequenza raggiunta al test da sforzo.",
    gruppo: "strumentali",
  },
  {
    chiave: "holterEcg",
    titolo: "ECG dinamico secondo Holter",
    descrizione: "Frequenze delle 24 ore, extrasistoli e pause.",
    gruppo: "strumentali",
  },
  {
    chiave: "holterPressorio",
    titolo: "Monitoraggio pressorio delle 24 ore",
    descrizione: "Medie delle 24 ore, diurne e notturne, calo notturno.",
    gruppo: "strumentali",
  },
  {
    chiave: "dopplerTsa",
    titolo: "EcoColorDoppler dei tronchi sovraaortici",
    descrizione: "Spessore medio-intimale e grado di stenosi carotidea.",
    gruppo: "strumentali",
  },
  {
    chiave: "scompenso",
    titolo: "Scompenso cardiaco",
    descrizione:
      "Fenotipo per frazione di eiezione, classe NYHA, NT-proBNP. Mostra anche l'ecocardiogramma, da cui legge la FE.",
    gruppo: "valutazioni",
    richiede: "ecocardiogramma",
  },
  {
    chiave: "fibrillazioneAtriale",
    titolo: "Fibrillazione atriale",
    descrizione: "Punteggi CHA\u2082DS\u2082-VASc e HAS-BLED, clearance renale.",
    gruppo: "valutazioni",
  },
] as const;

/**
 * I due gruppi con i loro titoli, per le impostazioni.
 *
 * Stanno qui e non nella pagina perche' la card di sintesi e il modal che la
 * apre devono dire la stessa cosa: sono due punti dello schermo che mostrano lo
 * stesso elenco.
 */
export const GRUPPI_MODULI: ReadonlyArray<{
  gruppo: GruppoModuloOpzionale;
  titolo: string;
  nota?: string;
}> = [
  { gruppo: "strumentali", titolo: "Esami strumentali" },
  {
    gruppo: "valutazioni",
    titolo: "Valutazioni cliniche",
    nota: "Moduli con punteggi e classificazioni, ancora in revisione con il referente clinico.",
  },
] as const;

/** I moduli di un gruppo, nell'ordine in cui compaiono nella visita. */
export function moduliDelGruppo(
  gruppo: GruppoModuloOpzionale,
): ModuloOpzionale[] {
  return MODULI_OPZIONALI.filter((modulo) => modulo.gruppo === gruppo);
}

/** I moduli che portano con se' `chiave` (vedi `ModuloOpzionale.richiede`). */
export function moduliCheRichiedono(
  chiave: ChiaveModuloOpzionale,
): ChiaveModuloOpzionale[] {
  return MODULI_OPZIONALI.filter((modulo) => modulo.richiede === chiave).map(
    (modulo) => modulo.chiave,
  );
}

/** Stato acceso/spento di ogni modulo opzionale. */
export type ModuliVisitaAttivi = Record<ChiaveModuloOpzionale, boolean>;

/**
 * Come arriva l'app appena installata: tutti spenti.
 *
 * Vale anche per chi aggiorna da una versione precedente, ed e' voluto — il
 * medico accende i moduli che usa davvero invece di trovarsi la maschera lunga
 * che il cardiologo ha chiesto di non fargli vedere per primo.
 */
export const MODULI_VISITA_SPENTI: ModuliVisitaAttivi = {
  ecocardiogramma: false,
  tcCoronarica: false,
  testErgometrico: false,
  holterEcg: false,
  holterPressorio: false,
  dopplerTsa: false,
  scompenso: false,
  fibrillazioneAtriale: false,
};

/** Chiave con cui lo stato dei moduli sta nelle preferenze. */
export const CHIAVE_PREF_MODULI = "moduliVisita";

/** Chiave della preferenza che rende consultabile il prontuario. */
export const CHIAVE_PREF_PRONTUARIO = "prontuarioEnabled";

/**
 * Legge lo stato dei moduli dalle preferenze salvate.
 *
 * Tollera preferenze vecchie, assenti o scritte male: qualunque cosa non sia
 * esattamente `true` vale spento, cosi' un campo corrotto non accende mezza
 * maschera a sorpresa.
 */
export function leggiModuliVisita(
  prefs: Record<string, unknown> | null | undefined,
): ModuliVisitaAttivi {
  const salvati = prefs?.[CHIAVE_PREF_MODULI];
  if (!salvati || typeof salvati !== "object") return { ...MODULI_VISITA_SPENTI };
  const registro = salvati as Record<string, unknown>;
  const stato = { ...MODULI_VISITA_SPENTI };
  for (const modulo of MODULI_OPZIONALI) {
    stato[modulo.chiave] = registro[modulo.chiave] === true;
  }
  return stato;
}

/**
 * Il prontuario e' consultabile.
 *
 * Spento di default per la beta, e non e' una scelta di ingombro: "tutto cio'
 * che deve essere scientificamente validato deve farlo il cardiologo", e
 * finche' le schede non sono complete non deve uscire dall'app di chi non le ha
 * scritte.
 */
export function leggiProntuarioAttivo(
  prefs: Record<string, unknown> | null | undefined,
): boolean {
  return prefs?.[CHIAVE_PREF_PRONTUARIO] === true;
}
