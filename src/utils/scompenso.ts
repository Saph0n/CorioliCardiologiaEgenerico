/**
 * Scompenso cardiaco: fenotipo per frazione di eiezione, classe NYHA e lettura
 * dell'NT-proBNP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  COSA FA E COSA NON FA
 *
 *  Colloca i valori inseriti nelle fasce delle linee guida e nomina la fascia.
 *  Non pone la diagnosi di scompenso, che richiede sintomi e segni oltre ai
 *  numeri, e **non suggerisce alcuna terapia**: quali farmaci impostare e' una
 *  decisione clinica, e un gestionale che la proponesse smetterebbe di essere
 *  un gestionale.
 *
 *  Fonte delle soglie: linee guida ESC 2021 sullo scompenso cardiaco.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Fenotipo definito dalla frazione di eiezione del ventricolo sinistro.
 *
 * `HFimpEF` non e' una fascia di FE come le altre tre: e' un percorso, e per
 * riconoscerlo serve una FE precedente. Vedi `fenotipoConStorico`.
 */
export type FenotipoScompenso = "HFrEF" | "HFpEF" | "HFimpEF";

export interface DescrizioneFenotipo {
  chiave: FenotipoScompenso;
  /** Sigla piu' dicitura estesa, come si scrive in un referto. */
  label: string;
  /** Intervallo di FE che definisce il fenotipo. */
  intervallo: string;
  /**
   * Quello che il fenotipo da solo non dice. Serve per HFpEF, dove la sola FE
   * conservata non basta: senza sintomi, alterazioni strutturali e peptidi
   * natriuretici elevati non si e' detto niente sul paziente.
   */
  avvertenza?: string;
  /**
   * Il dato precedente su cui si regge il fenotipo, quando ce n'e' uno.
   * Valorizzato per HFimpEF, che nasce dal confronto fra due misure.
   */
  riferimento?: string;
}

/**
 * Cosa mostrare quando la frazione di eiezione non c'e'.
 *
 * Non e' un fenotipo e non va scritto come tale: e' l'assenza del dato che
 * permetterebbe di attribuirne uno. Viene esportato perche' il referto lo
 * dichiari invece di saltare la riga, cosi' chi legge sa che il fenotipo manca
 * e non che e' stato valutato normale.
 */
export const FENOTIPO_DA_DEFINIRE = {
  label: "Da definire",
  motivo:
    "Frazione di eiezione non disponibile: il fenotipo richiede un ecocardiogramma o un imaging valido.",
} as const;

/** Confine fra frazione di eiezione ridotta e conservata (ESC 2026). */
export const SOGLIA_FE_RIDOTTA = 50;

/**
 * Fenotipo corrispondente a una frazione di eiezione.
 *
 * Tagli **ESC 2026**: FE < 50% ridotta, FE ≥ 50% conservata. L'HFmrEF non e'
 * piu' una categoria a se': la fascia 41-49%, che ESC 2021 teneva separata,
 * rientra ora in HFrEF.
 *
 * Il cambiamento non e' cosmetico e si vede sui pazienti gia' in archivio: uno
 * con FE 45% che prima era HFmrEF adesso legge HFrEF. Per questo la fascia
 * porta con se' una nota che lo dice: senza, il medico che riapre la scheda
 * vede un'etichetta cambiata e non sa se e' un aggiornamento o un errore.
 */
export function fenotipoDaFe(fe: number | undefined): DescrizioneFenotipo | null {
  if (fe == null || !Number.isFinite(fe) || fe <= 0 || fe > 100) return null;
  if (fe < SOGLIA_FE_RIDOTTA) {
    return {
      chiave: "HFrEF",
      label: "HFrEF — frazione di eiezione ridotta",
      intervallo: "FE < 50%",
      avvertenza:
        fe > 40
          ? "Fascia 41-49%: era l'HFmrEF di ESC 2021, che ESC 2026 non tiene più separato e include in HFrEF."
          : undefined,
    };
  }
  return {
    chiave: "HFpEF",
    label: "HFpEF — frazione di eiezione conservata",
    intervallo: "FE ≥ 50%",
    avvertenza:
      "La sola FE conservata non definisce un HFpEF: servono sintomi, alterazioni strutturali o funzionali e peptidi natriuretici elevati.",
  };
}

/** Una frazione di eiezione gia' registrata, con la data a cui si riferisce. */
export interface FePrecedente {
  valore: number;
  /** Data ISO della misura. */
  data: string;
}

/** Incremento minimo, in punti di FE, per parlare di miglioramento. */
export const INCREMENTO_MINIMO_HFIMPEF = 10;

/**
 * Frazione di eiezione da cui l'HFimpEF deve essere uscito: si parte da qui o
 * piu' in basso e la si deve superare.
 */
export const SOGLIA_FE_HFIMPEF = 40;

/**
 * Fenotipo tenendo conto delle frazioni di eiezione precedenti.
 *
 * Riconosce l'**HFimpEF**, che le altre tre categorie non possono esprimere
 * perche' non e' una fascia di FE ma un percorso: FE di partenza ≤ 40%,
 * incremento di almeno 10 punti, FE attuale > 40%.
 *
 * Il confronto non si limita alla misura immediatamente precedente ma cerca la
 * **piu' bassa fra quelle ≤ 40%**. Un paziente passato da 30% a 45% e poi a 48%
 * e' un HFimpEF: guardando solo il 45% precedente l'incremento sarebbe di 3
 * punti e il miglioramento sparirebbe dal referto proprio quando si consolida.
 *
 * L'avvertenza che accompagna il fenotipo e' l'unica cosa che conta davvero
 * dirla: la FE risalita non e' una guarigione, ed e' il momento in cui la
 * terapia rischia di essere alleggerita.
 */
export function fenotipoConStorico(
  feAttuale: number | undefined,
  fePrecedenti: FePrecedente[] = [],
): DescrizioneFenotipo | null {
  const base = fenotipoDaFe(feAttuale);
  if (!base || feAttuale == null) return base;
  // Sotto il 41% non c'e' miglioramento da dichiarare: il paziente e' ancora
  // nella fascia da cui l'HFimpEF dovrebbe essere uscito.
  if (feAttuale <= SOGLIA_FE_HFIMPEF) return base;

  const partenza = fePrecedenti
    .filter(
      (p) =>
        Number.isFinite(p.valore) &&
        p.valore > 0 &&
        p.valore <= SOGLIA_FE_HFIMPEF &&
        feAttuale - p.valore >= INCREMENTO_MINIMO_HFIMPEF,
    )
    .sort((a, b) => a.valore - b.valore || a.data.localeCompare(b.data))[0];

  if (!partenza) return base;

  return {
    chiave: "HFimpEF",
    label: "HFimpEF — frazione di eiezione migliorata",
    intervallo: `da FE ≤ ${SOGLIA_FE_HFIMPEF}% a FE > ${SOGLIA_FE_HFIMPEF}%, con incremento ≥ ${INCREMENTO_MINIMO_HFIMPEF} punti`,
    avvertenza:
      "La frazione di eiezione risalita non equivale a guarigione: il fenotipo resta di scompenso e la terapia di fondo non va sospesa in automatico.",
    riferimento: `FE precedente ${partenza.valore}% (${formattaData(
      partenza.data,
    )}), attuale ${feAttuale}%: +${feAttuale - partenza.valore} punti.`,
  };
}

/** Data ISO in forma breve italiana; se non e' interpretabile resta com'e'. */
function formattaData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "");
}

/**
 * I tre fenotipi come tabella di consultazione, per il prontuario.
 *
 * Gli intervalli si scrivono dalle stesse costanti che li decidono in
 * `fenotipoDaFe` e `fenotipoConStorico`: una tabella che dicesse 45 mentre il
 * codice taglia a 50 sarebbe peggio di nessuna tabella.
 */
export const FENOTIPI_SCOMPENSO: {
  chiave: FenotipoScompenso;
  intervallo: string;
  nota: string;
}[] = [
  {
    chiave: "HFrEF",
    intervallo: `FE < ${SOGLIA_FE_RIDOTTA}%`,
    nota: "Frazione di eiezione ridotta. Da ESC 2026 comprende anche la fascia 41-49%, che ESC 2021 teneva separata come HFmrEF.",
  },
  {
    chiave: "HFpEF",
    intervallo: `FE ≥ ${SOGLIA_FE_RIDOTTA}%`,
    nota: "Frazione di eiezione conservata. La sola FE non basta: servono sintomi, alterazioni strutturali o funzionali e peptidi natriuretici elevati.",
  },
  {
    chiave: "HFimpEF",
    intervallo: `da FE ≤ ${SOGLIA_FE_HFIMPEF}% a FE > ${SOGLIA_FE_HFIMPEF}%, con incremento ≥ ${INCREMENTO_MINIMO_HFIMPEF} punti`,
    nota: "Frazione di eiezione migliorata: e' un percorso, non una fascia, e non equivale a guarigione. La terapia di fondo non va sospesa in automatico.",
  },
];

// ─── Classe funzionale NYHA ──────────────────────────────────────────────────

export type ClasseNyha = "I" | "II" | "III" | "IV";

export const CLASSI_NYHA: ClasseNyha[] = ["I", "II", "III", "IV"];

/** Descrizione della classe, quella che il medico usa per sceglierla. */
export const NYHA_LABELS: Record<ClasseNyha, string> = {
  I: "I — nessuna limitazione all'attività ordinaria",
  II: "II — lieve limitazione: sintomi per attività ordinaria",
  III: "III — marcata limitazione: sintomi per attività inferiore all'ordinaria",
  IV: "IV — sintomi a riposo o a minimo sforzo",
};

/** Sigla breve, per i chip e le tabelle compatte. */
export const NYHA_SIGLE: Record<ClasseNyha, string> = {
  I: "NYHA I",
  II: "NYHA II",
  III: "NYHA III",
  IV: "NYHA IV",
};

// ─── NT-proBNP ───────────────────────────────────────────────────────────────

/**
 * Contesto in cui il peptide e' stato dosato.
 *
 * Non e' un dettaglio: le soglie di esclusione sono diverse (125 pg/mL in
 * ambulatorio, 300 in urgenza) e usare quella sbagliata sposta il paziente di
 * fascia. Per questo il campo e' obbligatorio prima di dare un giudizio.
 */
export type ContestoBnp = "ambulatoriale" | "acuto";

export const CONTESTO_BNP_LABELS: Record<ContestoBnp, string> = {
  ambulatoriale: "Ambulatoriale (esordio non acuto)",
  acuto: "Urgenza (dispnea acuta)",
};

/** Soglia di esclusione dello scompenso per contesto (pg/mL). */
export const SOGLIA_ESCLUSIONE_NTPROBNP: Record<ContestoBnp, number> = {
  ambulatoriale: 125,
  acuto: 300,
};

export type LivelloBnp = "esclusione" | "indeterminato" | "conferma";

export interface EsitoNtProBnp {
  livello: LivelloBnp;
  /** Frase breve, quella che compare accanto al valore. */
  titolo: string;
  /** La soglia applicata e da dove viene. */
  nota: string;
}

/**
 * Soglia di conferma in urgenza, stratificata per eta' (ESC 2021):
 * 450 pg/mL sotto i 50 anni, 900 fra 50 e 75, 1800 oltre i 75.
 *
 * In ambulatorio le linee guida non fissano una soglia di conferma: sopra i
 * 125 pg/mL si prosegue con l'ecocardiogramma, non si conclude.
 */
export function sogliaConfermaAcuto(eta: number | undefined): number | null {
  if (eta == null || !Number.isFinite(eta) || eta <= 0) return null;
  if (eta < 50) return 450;
  if (eta <= 75) return 900;
  return 1800;
}

/**
 * Colloca un NT-proBNP nelle fasce del contesto indicato.
 *
 * Restituisce `null` quando manca il valore o il contesto: senza sapere se il
 * prelievo viene dall'ambulatorio o dal pronto soccorso non c'e' una soglia da
 * applicare, e inventarne una sarebbe peggio che non dire nulla.
 */
export function valutaNtProBnp(
  valore: number | undefined,
  contesto: ContestoBnp | undefined,
  eta?: number,
): EsitoNtProBnp | null {
  if (valore == null || !Number.isFinite(valore) || valore < 0) return null;
  if (!contesto) return null;

  const esclusione = SOGLIA_ESCLUSIONE_NTPROBNP[contesto];
  if (valore < esclusione) {
    return {
      livello: "esclusione",
      titolo: "Scompenso improbabile",
      nota: `Sotto la soglia di esclusione di ${esclusione} pg/mL (contesto ${
        contesto === "acuto" ? "acuto" : "ambulatoriale"
      }, ESC 2021).`,
    };
  }

  if (contesto === "ambulatoriale") {
    return {
      livello: "indeterminato",
      titolo: "Sopra la soglia di esclusione",
      nota: "≥ 125 pg/mL: lo scompenso non è escluso. In ambulatorio le linee guida non fissano una soglia di conferma, si prosegue con l'ecocardiogramma.",
    };
  }

  const conferma = sogliaConfermaAcuto(eta);
  if (conferma == null) {
    return {
      livello: "indeterminato",
      titolo: "Sopra la soglia di esclusione",
      nota: "≥ 300 pg/mL: lo scompenso non è escluso. Serve l'età del paziente per applicare la soglia di conferma.",
    };
  }
  if (valore > conferma) {
    return {
      livello: "conferma",
      titolo: "Sopra la soglia di conferma per l'età",
      nota: `> ${conferma} pg/mL, soglia dell'urgenza per questa fascia d'età (450 sotto i 50 anni, 900 fra 50 e 75, 1800 oltre i 75).`,
    };
  }
  return {
    livello: "indeterminato",
    titolo: "Fascia grigia",
    nota: `Fra ${SOGLIA_ESCLUSIONE_NTPROBNP.acuto} e ${conferma} pg/mL: lo scompenso non è né escluso né confermato dal solo peptide.`,
  };
}

/**
 * Fasce d'eta' della soglia di conferma in urgenza, per la tabella del
 * prontuario. Il numero lo da' `sogliaConfermaAcuto`, cosi' la tabella e il
 * giudizio accanto al valore non possono divergere.
 */
export const FASCE_ETA_CONFERMA_ACUTO: {
  fascia: string;
  /** Un'eta' dentro la fascia, con cui chiedere la soglia alla funzione. */
  etaRappresentativa: number;
}[] = [
  { fascia: "Sotto i 50 anni", etaRappresentativa: 40 },
  { fascia: "Da 50 a 75 anni", etaRappresentativa: 60 },
  { fascia: "Oltre i 75 anni", etaRappresentativa: 80 },
];

/**
 * Valori di riferimento da mostrare accanto al campo, prima ancora che ci sia
 * un valore da giudicare: chi scrive un NT-proBNP vuole sapere contro che
 * soglia lo sta leggendo (richiesta del cardiologo, 12 settembre 2026).
 *
 * Senza contesto non c'e' una soglia sola da nominare, e chi ha gia' scritto
 * un valore lo legge nell'avviso che chiede il contesto: qui si restituisce
 * `null` per non dire due volte la stessa cosa.
 */
export function riferimentoNtProBnp(
  contesto: ContestoBnp | undefined,
  eta?: number,
): string | null {
  if (!contesto) return null;
  const esclusione = SOGLIA_ESCLUSIONE_NTPROBNP[contesto];
  if (contesto === "ambulatoriale") {
    return `Riferimento: scompenso improbabile sotto ${esclusione} pg/mL. Sopra, le linee guida non fissano una soglia di conferma: si prosegue con l'ecocardiogramma.`;
  }
  const conferma = sogliaConfermaAcuto(eta);
  return conferma == null
    ? `Riferimento: esclusione sotto ${esclusione} pg/mL. La soglia di conferma dipende dall'età, che qui manca.`
    : `Riferimento: esclusione sotto ${esclusione} pg/mL, conferma sopra ${conferma} pg/mL per questa età.`;
}

// ─── Confondenti ─────────────────────────────────────────────────────────────

/** Condizioni che spostano il peptide e vanno lette insieme al valore. */
export interface ContestoConfondenti {
  /** Filtrato glomerulare stimato (mL/min/1,73 m²). */
  egfr?: number;
  /** Indice di massa corporea. */
  bmi?: number;
  /**
   * Ritmo rilevato all'ECG, per intercettare la fibrillazione atriale.
   *
   * Resta per le visite in archivio: la tendina del ritmo non c'e' piu' nella
   * maschera, la diagnosi la scrive il cardiologo nel referto testuale, e da
   * un testo libero non si estrae un confondente senza sbagliare.
   */
  ritmo?: string;
  /**
   * Il medico sta valutando la fibrillazione atriale in questa visita: e' la
   * strada da cui arriva ora l'avvertenza, al posto della vecchia tendina.
   */
  fibrillazioneAtriale?: boolean;
  eta?: number;
}

/**
 * Avvertenze da mostrare accanto all'NT-proBNP.
 *
 * Il caso che conta davvero e' l'obesita': abbassa il peptide, quindi un valore
 * "normale" in un paziente obeso **non esclude** lo scompenso. Gli altri
 * confondenti lo alzano, e rendono meno specifico un valore alto.
 */
export function confondentiNtProBnp(ctx: ContestoConfondenti): string[] {
  const avvisi: string[] = [];
  const { egfr, bmi, ritmo, eta } = ctx;

  if (bmi != null && Number.isFinite(bmi) && bmi >= 30) {
    avvisi.push(
      "Obesità (BMI ≥ 30): l'NT-proBNP risulta più basso del reale, un valore sotto soglia non esclude lo scompenso.",
    );
  }
  if (egfr != null && Number.isFinite(egfr) && egfr < 60) {
    avvisi.push(
      "Funzione renale ridotta (eGFR < 60): il peptide si accumula, un valore elevato è meno specifico.",
    );
  }
  if (ctx.fibrillazioneAtriale || (ritmo && /fibrillazion|\bfa\b|flutter/i.test(ritmo))) {
    avvisi.push(
      "Fibrillazione o flutter atriale: alzano il peptide indipendentemente dallo scompenso.",
    );
  }
  if (eta != null && Number.isFinite(eta) && eta >= 75) {
    avvisi.push(
      "Età avanzata: il peptide sale con l'età, ed è il motivo per cui in urgenza la soglia di conferma è stratificata.",
    );
  }
  return avvisi;
}
