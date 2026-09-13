import jsPDF from "jspdf";
import {
  Patient, Visit, Doctor,
  RichiestaEsameComplementare,
  CertificatoPaziente,
  RicettaPaziente,
} from "../types/Storage";
import { DoctorService, PreferenceService, VisitService } from "./OfflineServices";
import {
  normalizeSignatureStampImage,
  signatureStampPdfFormat,
  SIGNATURE_STAMP_PDF_LAYOUT_W,
  SIGNATURE_STAMP_PDF_LAYOUT_H,
} from "../utils/signatureStamp";
import {
  ALL_ANAMNESI_CAMPO_KEYS,
  hasAnamnesiStrutturataContent,
  resolveAnamnesiLabel,
  parseAnamnesiConfig,
} from "../utils/anamnesiStrutturata";
import { getRicettaTesto } from "../utils/ricettaTemplate";
import {
  calcolaCaloNotturno,
  calcolaClearanceCockcroftGault,
  calcolaEgfrCkdEpi,
  calcolaHomaIr,
  calcolaPercentualeFcMax,
  calcolaLdlFriedewald,
  calcolaQtcBazett,
  calcolaRapportoCtHdl,
  calcolaRapportoTgHdl,
} from "../utils/cardioCalcs";
import {
  CONTESTO_BNP_LABELS,
  FENOTIPO_DA_DEFINIRE,
  fenotipoConStorico,
  valutaNtProBnp,
  type FePrecedente,
} from "../utils/scompenso";
import {
  calcolaChadsVasc,
  calcolaHasBled,
} from "../utils/fibrillazioneAtriale";
import {
  valutaMisura,
  valutaPressioneScritta,
  type ChiaveMisura,
} from "../utils/rangeClinici";
import {
  CATEGORIA_RISCHIO_LABELS,
  FATTORI_RISCHIO_CV,
  TARGET_APOB,
  TARGET_LDL,
  confrontaConTarget,
  descriviTargetLdl,
} from "../utils/rischioCv";
import {
  SOGLIA_CAC_PREDEFINITA,
  categoriaCac,
  type SogliaCacSevera,
} from "../utils/tcCoronarica";

// ─── Layout ──────────────────────────────────────────────────────────────────
//
// Margini a 18 mm invece di 15. Il foglio A4 e' largo 210 e la colonna resta
// centrata; i tre millimetri in piu' per lato sono tolleranza di stampa: fra
// l'area non stampabile della macchina e il trascinamento del foglio, una
// stampa leggermente fuori centro con margini stretti mangia del testo. Con 18
// la stessa deriva mangia solo bianco.
const ML = 18;
const MR = 192;
const PW = MR - ML;   // 174 mm
const PAGE_H = 297;
const FOOT_Y = PAGE_H - 14;
const LH = 4.8;
// Interlinea della prosa clinica in corpo 10,5: circa 1,4 volte il corpo.
// Era 6,1 mm e, con l'aria sotto le fasce e fra le righe delle tabelle, un
// referto normale arrivava a tre pagine: "spaziature eccessive", il
// cardiologo l'11 settembre 2026.
const LH_PROSA = 5.2;
/** Dal filo del contenuto alla linea di base della prima riga di prosa. */
const PRIMA_RIGA_PROSA = 3.9;
/** Altezza della fascia grigia dei titoli di sezione. */
const FASCIA_H = 5.6;

// ─── B&W palette ─────────────────────────────────────────────────────────────
const K0 = [0, 0, 0] as const;
const K30: [number, number, number] = [30, 30, 30];
const K80: [number, number, number] = [80, 80, 80];
const K140: [number, number, number] = [140, 140, 140];
const K200: [number, number, number] = [200, 200, 200];
const K235: [number, number, number] = [235, 235, 235];


/**
 * Apre l'intestazione di un gruppo di sezioni. Restituisce la `y` aggiornata e
 * disegna la fascia solo alla prima chiamata: i moduli decidono da soli se
 * hanno qualcosa da stampare, e il gruppo deve comparire solo se almeno uno lo
 * fa. Vedi `PdfService.gruppo`.
 */
type ApriGruppo = (y: number) => number;

interface VisitPdfOptions {
  /** Allega al referto le immagini caricate nella visita. */
  includeImages?: boolean;
}
interface FooterVisibilityOptions {
  showDoctorPhoneInPdf?: boolean;
  showDoctorEmailInPdf?: boolean;
}

// ─── Sanitizer + utils ────────────────────────────────────────────────────────

/**
 * I caratteri tipografici che WinAnsi colloca nella fascia 0x80-0x9F.
 *
 * In Unicode stanno sopra 0xFF, ma il font li sa scrivere: senza questo
 * elenco la rete di sicurezza di `san` li scambierebbe per caratteri non
 * rappresentabili e li sostituirebbe con un punto interrogativo. E' successo
 * con il trattino lungo delle categorie CAD-RADS.
 */
const WINANSI_ALTI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/**
 * Simboli che il font standard di jsPDF non sa scrivere.
 *
 * Il font usa la codifica WinAnsi: un carattere fuori da quella tabella fa
 * ripiegare jsPDF su UTF-16 per **tutta** la stringa. Il danno e' doppio e si
 * e' visto in ambulatorio sul calcium score: il testo esce illeggibile
 * ("Agatston BOM e 300") e, siccome `splitTextToSize` misura la stringa come
 * se fosse a un byte per carattere, la riga viene mandata a capo sulla misura
 * sbagliata e sborda oltre il margine destro del foglio.
 *
 * Qui stanno i simboli che l'applicazione produce davvero: le soglie con il
 * maggiore-uguale sono ovunque, dalle fasce Agatston ai fenotipi dello
 * scompenso.
 */
const SIMBOLI: Record<string, string> = {
  "\u2265": ">=", "\u2264": "<=", "\u2260": "!=", 
  "\u2081": "1", "\u2082": "2", "\u2083": "3",
  "\u2192": "->", "\u2190": "<-", "\u00a0": " ",
};

/**
 * Accenti -> apostrofo ASCII per la stampa.
 *
 * Il font standard di jsPDF (WinAnsi) non disegna le vocali accentate: senza
 * questa conversione il referto uscirebbe con caratteri sbagliati. E' il motivo
 * per cui nell'applicazione i testi si possono scrivere accentati.
 *
 * Esportata per essere coperta dai test: la mappa e' due righe di coppie
 * numero-stringa, si e' gia' rotta una volta durante una correzione
 * tipografica automatica, e un errore qui non si vede finche' qualcuno non
 * stampa un referto.
 */
export function san(t: string): string {
  if (!t) return "";
  for (const [simbolo, ascii] of Object.entries(SIMBOLI)) {
    if (t.includes(simbolo)) t = t.split(simbolo).join(ascii);
  }
  const M: Record<number, string> = {
    224: "a'", 232: "e'", 233: "e'", 236: "i'", 242: "o'", 249: "u'",
    192: "A'", 200: "E'", 201: "E'", 204: "I'", 210: "O'", 217: "U'",
  };
  let r = "";
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (M[c]) { r += M[c]; continue; }
    if (c === 195 && i + 1 < t.length) {
      const n = t.charCodeAt(i + 1);
      const U: Record<number, string> = { 160: "a'", 168: "e'", 169: "e'", 172: "i'", 178: "o'", 185: "u'" };
      if (U[n]) { r += U[n]; i++; continue; }
    }
    // Rete di sicurezza: qualunque altro carattere fuori dalla tabella a un
    // byte farebbe ripiegare jsPDF su UTF-16 e romperebbe la riga intera. Si
    // prova la scomposizione Unicode (e' quella che riduce "ﬁ" a "fi"), e solo
    // se non resta niente di stampabile si lascia un punto interrogativo:
    // meglio un carattere sbagliato che una riga illeggibile fuori margine.
    if (c > 255 && !WINANSI_ALTI.has(c)) {
      const piano = t[i].normalize("NFKD").replace(/[^\x20-\xFF]/g, "");
      r += piano || "?";
      continue;
    }
    r += t[i];
  }
  return r;
}

function fd(d: string): string {
  if (!d) return "-";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("it-IT");
}
function calcAge(dob: string): string {
  if (!dob) return "";
  const b = new Date(dob); if (isNaN(b.getTime())) return "";
  const t = new Date(); let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return String(a);
}
function v(x: string | number | undefined | null, fb = "-"): string {
  return (x === undefined || x === null || String(x).trim() === "") ? fb : String(x);
}

/** True se il valore mostrato indica "campo non inserito": la riga non va stampata nel PDF. */
function isInquadramentoValueEmpty(val: string): boolean {
  if (!val || String(val).trim() === "") return true;
  const s = String(val).trim();
  if (s === "-") return true;
  if (s === "0") return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
export class PdfService {

  /**
   * Contesto del piede di pagina durante la generazione.
   *
   * `differita` serve al referto di visita: la numerazione "Pagina 2 di 3" non
   * si puo' scrivere mentre si impagina, perche' il totale si conosce solo alla
   * fine. Con la stampa differita i piedi si disegnano tutti insieme in coda,
   * quando il documento e' chiuso.
   */
  private static fCtx: {
    doctor: Doctor | null;
    opts: FooterVisibilityOptions;
    differita?: boolean;
    /** Riga di emissione del referto: quando e' stato stampato, e quale copia. */
    emissione?: string;
  } | null = null;

  private static dc(d: jsPDF, c: readonly number[]) { d.setDrawColor(c[0], c[1], c[2]); }
  private static tc(d: jsPDF, c: readonly number[]) { d.setTextColor(c[0], c[1], c[2]); }

  // ── page break ───────────────────────────────────────────────────────────────
  private static pb(doc: jsPDF, y: number, need = 30): number {
    if (y + need > FOOT_Y - 8) {
      if (this.fCtx && !this.fCtx.differita) {
        this.drawFooter(doc, this.fCtx.doctor, this.fCtx.opts);
      }
      doc.addPage();
      // Sulle pagine dopo la prima il contenuto scende: sopra ci va la riga di
      // identificazione del paziente, scritta poi da `finalizzaPagine`.
      return this.fCtx?.differita ? 24 : 18;
    }
    return y;
  }

  // ── multiline text block ─────────────────────────────────────────────────────
  /** textStyle: ripristina font/size/colore prima di ogni riga (necessario dopo salto pagina, perché drawFooter cambia lo stile). */
  private static block(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    maxW: number,
    lh = LH,
    textStyle?: { font?: "helvetica"; style?: "normal" | "bold" | "italic"; fontSize?: number; color?: readonly number[] },
  ): number {
    if (!text?.trim()) return y;

    // Il carattere si imposta **prima** di mandare a capo, non solo prima di
    // scrivere: `splitTextToSize` misura con il font corrente, e il font
    // corrente era quello lasciato dall'ultima cosa disegnata — di solito
    // l'Helvetica 7 di un'etichetta di tabella. La prosa veniva quindi spezzata
    // sulla misura di un carattere piu' stretto e poi scritta in Times 10,5:
    // le righe uscivano fino a un centimetro e mezzo oltre il margine destro,
    // e nel testo estratto dal PDF non si vedeva perche' le parole c'erano
    // tutte.
    const applica = () => {
      if (!textStyle) return;
      doc.setFont(textStyle.font ?? "helvetica", textStyle.style ?? "normal");
      if (textStyle.fontSize != null) doc.setFontSize(textStyle.fontSize);
      if (textStyle.color) this.tc(doc, textStyle.color);
    };

    applica();
    const lines: string[] = doc.splitTextToSize(san(text), maxW);
    for (const line of lines) {
      y = this.pb(doc, y, lh + 1);
      // Da riapplicare a ogni riga: dopo un salto pagina il piede ha cambiato
      // font, corpo e colore.
      applica();
      doc.text(line, x, y);
      y += lh;
    }
    return y;
  }

  // ── horizontal rule ──────────────────────────────────────────────────────────
  private static rule(doc: jsPDF, y: number, x1 = ML, x2 = MR, lw = 0.2) {
    this.dc(doc, K200); doc.setLineWidth(lw); doc.line(x1, y, x2, y);
  }

  /**
   * Griglia "Inquadramento" in stile referto: titolo di sezione + N colonne,
   * ciascuna con sotto-intestazione su barra grigia e righe "Etichetta: valore".
   * Le righe con valore vuoto/zero ("-", "0", ...) vengono nascoste; se non resta
   * alcun dato la sezione non viene disegnata.
   */
  private static drawInquadramentoGrid(
    doc: jsPDF, y: number, title: string,
    columns: {
      header: string;
      /** Senza etichetta la voce e' una riga di elenco: il valore da solo. */
      items: { label?: string; value: string; forte?: boolean }[];
    }[],
  ): number {
    // Le colonne vuote non si stampano, nemmeno l'intestazione: "PARAMETRI
    // VITALI" senza niente sotto diceva che i parametri non erano stati
    // rilevati, quando era solo che la pressione ha una sezione sua. Le
    // colonne che restano si dividono la larghezza.
    const cols = columns
      .map((c) => ({
        header: c.header,
        items: c.items.filter((it) => !isInquadramentoValueEmpty(it.value)),
      }))
      .filter((c) => c.items.length > 0);
    if (cols.length === 0) return y;

    const colW = PW / cols.length;

    // Si misura tutto prima di disegnare. Dentro una colonna l'impaginazione
    // scorre in verticale senza mai chiedere un salto pagina: con la vecchia
    // riserva fissa di 40 mm, una colonna piu' lunga di quella scriveva sotto
    // il piede. Misurata l'altezza vera, la griglia o ci sta o scende intera
    // alla pagina dopo, titolo compreso.
    doc.setFontSize(8);
    const misurate = cols.map((c) =>
      c.items.map((item) => {
        doc.setFont("helvetica", "normal");
        const lbl = item.label ? san(item.label) + ": " : "";
        const lblW = lbl ? doc.getTextWidth(lbl) : 0;
        doc.setFont("helvetica", item.forte ? "bold" : "normal");
        const linee: string[] = doc.splitTextToSize(
          san(item.value), colW - lblW - 4,
        );
        return { lbl, lblW, linee };
      }),
    );
    // Voci a 4,2 mm in corpo 8. Erano a 4,8, l'interlinea della prosa, e in
    // tre colonne di voci brevi era solo bianco.
    const RIGA = 4.2;
    const altezza = 8.6 + Math.max(
      ...misurate.map((items) =>
        items.reduce((h, it) => h + it.linee.length * RIGA, 0),
      ),
    );

    y = this.sezione(doc, y, title, FASCIA_H + 1.3 + altezza + 1);
    let maxY = y;

    for (let c = 0; c < cols.length; c++) {
      const cx = ML + c * colW;

      doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); this.tc(doc, K80);
      doc.text(san(cols[c].header).toUpperCase(), cx, y + 3);
      this.rule(doc, y + 4.6, cx, cx + colW - 4, 0.2);

      let cy = y + 8.6;
      doc.setFontSize(8);

      cols[c].items.forEach((item, i) => {
        const { lbl, lblW, linee } = misurate[c][i];
        if (lbl) {
          doc.setFont("helvetica", "normal"); this.tc(doc, K80);
          doc.text(lbl, cx, cy);
        }

        doc.setFont("helvetica", item.forte ? "bold" : "normal"); this.tc(doc, K0);
        // Piccolo margine fra etichetta e valore; senza etichetta il valore
        // parte dal filo della colonna.
        const valueX = lbl ? cx + lblW + 1 : cx;
        for (const line of linee) {
          doc.text(line, valueX, cy);
          cy += RIGA;
        }
      });
      maxY = Math.max(maxY, cy);
    }

    return maxY + 0.8;
  }

  private static heading(doc: jsPDF, y: number, text: string): number {
    y = this.pb(doc, y, 12);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); this.tc(doc, K0);
    doc.text(san(text), ML, y);
    this.rule(doc, y + 1.2, ML, ML + doc.getTextWidth(san(text)), 0.4);
    return y + 5.5;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOCUMENT HEADER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawHeader(
    doc: jsPDF, title: string, subtitle: string,
    doctor: Doctor | null, showDoctor = true, vis?: FooterVisibilityOptions,
  ): number {
    let y = 17;

    if (showDoctor) {
      // A sinistra chi firma, a destra dove lo si trova: e' la carta intestata
      // di qualunque studio, e usa la larghezza del foglio invece di lasciarla
      // vuota ai lati di un titolo centrato. I recapiti stavano nel piede, in
      // corpo 6,5: e' il primo posto dove si cerca chi ha scritto il referto,
      // non l'ultimo.
      const nome = doctor
        ? `Dott. ${doctor.nome} ${doctor.cognome}`.trim()
        : "Studio medico";
      // Il nome in corpo 11, lo stesso del titolo del documento: a 15 pesava
      // piu' di "VISITA CARDIOLOGICA", e il cardiologo l'ha trovato
      // sproporzionato (call dell'11 settembre 2026).
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); this.tc(doc, K0);
      doc.text(san(nome), ML, y);
      // Sotto, la specializzazione come e' scritta nel profilo. Era stata
      // tolta perche' ripeteva il titolo del documento; il cardiologo la
      // rivuole, e con due specialita' ("cardiologia e geriatria") dice una
      // cosa che il titolo non dice. La riga si allinea con l'ultima dei
      // recapiti a destra.
      const specializzazione = doctor?.specializzazione?.trim();
      if (specializzazione) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K80);
        doc.text(san(specializzazione), ML, y + 4.2);
      }

      const recapiti: string[] = [];
      const amb = doctor?.ambulatori?.find((x) => x.isPrimario)
        ?? doctor?.ambulatori?.[0];
      if (amb) {
        recapiti.push(san(amb.nome));
        recapiti.push(san(
          [amb.indirizzo, [amb.cap, amb.citta].filter(Boolean).join(" ")]
            .filter(Boolean).join(" - "),
        ));
      }
      const contatti: string[] = [];
      if (vis?.showDoctorPhoneInPdf !== false && doctor?.telefono) {
        contatti.push(`Tel ${san(doctor.telefono)}`);
      }
      if (vis?.showDoctorEmailInPdf !== false && doctor?.email) {
        contatti.push(san(doctor.email));
      }
      if (contatti.length) recapiti.push(contatti.join("   -   "));

      doc.setFont("helvetica", "normal"); doc.setFontSize(7); this.tc(doc, K80);
      recapiti.forEach((riga, i) => {
        doc.text(riga, MR, y - 2.6 + i * 3.4, { align: "right" });
      });

      y = Math.max(
        y + (specializzazione ? 7.4 : 4),
        y - 2.6 + recapiti.length * 3.4 + 3,
      );
    }

    // Filetto doppio, grosso e sottile: separa la carta intestata dal
    // documento con piu' autorevolezza di una linea sola, e in bianco e nero
    // e' l'unico modo di dare peso a una separazione.
    this.dc(doc, K0); doc.setLineWidth(0.7);
    doc.line(ML, y, MR, y);
    this.rule(doc, y + 1.1, ML, MR, 0.15);
    y += 4;

    // Il titolo del documento sulla stessa fascia grigia delle sezioni, piu'
    // alta e in corpo piu' grande: e' il primo livello della stessa
    // gerarchia. Proposta dal cardiologo l'11 settembre 2026, "come gia' fai
    // con i paragrafi anamnesi".
    const TITOLO_H = 7.4;
    doc.setFillColor(...K235);
    doc.rect(ML, y, PW, TITOLO_H, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); this.tc(doc, K0);
    doc.text(san(title).toUpperCase(), 105, y + 5.1, { align: "center", charSpace: 0.7 });
    y += TITOLO_H;
    if (subtitle) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K80);
      doc.text(san(subtitle), 105, y + 4.2, { align: "center" });
      y += 4.2;
    }
    return y + 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATIENT BLOCK
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawPatientBlock(
    doc: jsPDF, patient: Patient, visitDate: string,
    y: number, dateLabel = "Data visita", opts?: { showDate?: boolean; showSesso?: boolean; showBirthDate?: boolean; extraRight?: { label: string; value: string }[]; centrato?: boolean }
  ): number {
    const a = calcAge(patient.dataNascita);
    const nascita = patient.dataNascita
      ? `${fd(patient.dataNascita)}${a ? `  (${a} anni)` : ""}`
      : "";

    // Il nome prende due colonne **solo se in una non ci sta**. Allargarlo
    // sempre faceva scendere la data della visita anche per "PROVA Mario", che
    // in 43 millimetri sta larghissimo: una riga in piu' nell'anagrafica di
    // ogni referto per un problema che quel referto non aveva.
    //
    // Si misura con lo stesso carattere con cui la tabella lo scrivera'
    // (helvetica bold 9, perche' il nome e' in grassetto), sulla larghezza utile
    // della cella. Se non ci sta nemmeno in due colonne, ci pensa la tabella:
    // manda a capo dentro la cella e alza la riga.
    const nome = this.nomePaziente(patient);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    const spanNome = doc.getTextWidth(san(nome)) > PW / 4 - 4 ? 2 : 1;

    const voci = [
      {
        label: "Paziente",
        value: nome,
        forte: true,
        span: spanNome,
      },
      ...(opts?.showBirthDate === false
        ? []
        : [{ label: "Data di nascita", value: nascita }]),
      ...(opts?.showSesso !== false && patient.sesso
        ? [{
            label: "Sesso",
            value: patient.sesso === "F" ? "Femminile" : "Maschile",
          }]
        : []),
      ...(opts?.showDate === false
        ? []
        : [{ label: dateLabel, value: fd(visitDate) }]),
      ...(patient.codiceFiscale?.trim()
        ? [{ label: "Codice fiscale", value: patient.codiceFiscale.toUpperCase() }]
        : []),
      ...(opts?.extraRight ?? []),
    ];

    this.rule(doc, y - 1, ML, MR, 0.2);
    y = this.drawMisureTable(doc, y, voci, 4, undefined, opts?.centrato);
    return y + 3;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEXT SECTION
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawTextSection(
    doc: jsPDF, y: number, title: string,
    content: string | undefined | null, note?: string
  ): number {
    if (!content?.trim()) return y;
    // Stessa barra grigia delle altre sezioni: "Anamnesi" e "Esami
    // ematochimici" sono lo stesso livello e devono pesare uguale.
    //
    // Il titolo si porta dietro due righe di testo, non una: con una sola,
    // "Conclusioni e Terapia" poteva aprire in fondo alla pagina con un rigo
    // orfano e proseguire su quella dopo.
    y = this.sezione(
      doc, y, title, FASCIA_H + 1.3 + PRIMA_RIGA_PROSA + 2 * LH_PROSA + 1,
    );
    y = this.block(doc, content, ML, y + PRIMA_RIGA_PROSA, PW, LH_PROSA, {
      font: "helvetica", style: "normal", fontSize: 10.5, color: K0,
    });
    if (note) {
      y += 1.5;
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); this.tc(doc, K140);
      y = this.block(doc, note, ML + 1, y, PW - 2, 3.8, {
        font: "helvetica", style: "italic", fontSize: 7, color: K140,
      });
    }
    // Nessun margine in coda: l'aria prima della fascia successiva e'
    // l'interlinea dell'ultima riga.
    return y;
  }

  /**
   * Anamnesi strutturata: titolo "Anamnesi" + una riga per ciascuna categoria
   * valorizzata ("Familiare: ...", "Patologica: ..."), con etichetta in grassetto
   * e valore a capo con rientro. Salta le categorie vuote.
   */
  private static drawStructuredAnamnesi(
    doc: jsPDF, y: number, as: NonNullable<Visit["anamnesiStrutturata"]>,
    order?: string[],
    etichette?: Record<string, string>
  ): number {
    // Ordine configurato per il tipo di visita; le sezioni con dato ma non
    // incluse nell'ordine (predefinite o personalizzate) vengono comunque
    // stampate in coda (no perdita dati).
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const k of order ?? []) if (!seen.has(k)) { keys.push(k); seen.add(k); }
    for (const k of ALL_ANAMNESI_CAMPO_KEYS) if (!seen.has(k)) { keys.push(k); seen.add(k); }
    for (const k of Object.keys(as)) if (!seen.has(k)) { keys.push(k); seen.add(k); }

    const rows = keys
      .map((key) => ({
        label: resolveAnamnesiLabel(key, etichette),
        value: (as[key] ?? "").trim(),
      }))
      .filter((r) => r.value !== "");
    if (rows.length === 0) return y;

    // La prima riga si scrive sulla sua linea di base, un corpo 9,5 sotto il
    // filo del contenuto.
    y = this.sezione(doc, y, "Anamnesi") + 3.6;

    for (const r of rows) {
      const lbl = san(r.label) + ": ";
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      const lblW = doc.getTextWidth(lbl);
      const valLines: string[] = doc.splitTextToSize(san(r.value), PW - 2 - lblW);

      valLines.forEach((line, i) => {
        y = this.pb(doc, y, LH + 1);
        if (i === 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); this.tc(doc, K30);
          doc.text(lbl, ML + 1, y);
        }
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); this.tc(doc, K30);
        doc.text(line, ML + 1 + lblW, y);
        y += LH;
      });
      y += 1.2; // gap tra categorie
    }
    // Il gap dopo l'ultima categoria si restituisce: l'aria prima della
    // fascia successiva e' gia' l'interlinea.
    return y - 1.2;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IMAGE GALLERY
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Converte in JPEG ridimensionando al lato lungo richiesto.
   *
   * Il ridimensionamento e' il punto: prima l'immagine entrava nel PDF alla
   * risoluzione nativa per essere disegnata larga otto centimetri, e quattro
   * foto di telefono facevano un referto da megabyte che poi doveva viaggiare
   * per posta elettronica. A 200 dpi sulla dimensione stampata non si perde
   * niente di quello che una laser sa rendere.
   */
  private static toJpeg(url: string, maxLatoPx: number): Promise<string> {
    return new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        const scala = Math.min(
          1, maxLatoPx / Math.max(img.naturalWidth, img.naturalHeight, 1),
        );
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scala));
        c.height = Math.max(1, Math.round(img.naturalHeight * scala));
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = () => rej(new Error("fail")); img.src = url;
    });
  }

  /**
   * Galleria degli allegati, in fondo al referto.
   *
   * Due larghezze invece di una: le immagini panoramiche — un tracciato ECG,
   * una striscia Holter — prendono la riga intera, le altre restano in coppia.
   * In una cella da 85 mm un tracciato lungo e basso e' decorativo e non
   * refertabile, e in un referto un'immagine che non si legge e' peggio di
   * un'immagine che manca.
   */
  private static async drawImages(doc: jsPDF, imgs: string[] | undefined, y: number): Promise<number> {
    if (!imgs?.length) return y;

    const GAP = 4;
    const MEZZA = (PW - GAP) / 2;
    /** Lato lungo massimo: 200 dpi sulla larghezza piena della colonna. */
    const MAX_PX = Math.round((PW / 25.4) * 200);
    /** Sopra questo rapporto base/altezza l'immagine prende la riga intera. */
    const PANORAMICA = 1.6;

    const convertite = await Promise.all(
      imgs.map((im) => this.toJpeg(im, MAX_PX).catch(() => null)),
    );
    const misurate = convertite.map((img) => {
      if (!img) return { img: null, ratio: 1, piena: false };
      try {
        const p = doc.getImageProperties(img);
        const ratio = p.width / p.height;
        return { img, ratio, piena: ratio >= PANORAMICA };
      } catch {
        return { img: null, ratio: 1, piena: false };
      }
    });

    y = this.sezione(doc, y, "Immagini allegate");

    let i = 0;
    let numero = 1;
    while (i < misurate.length) {
      const corrente = misurate[i];
      const successiva = misurate[i + 1];
      // Una panoramica non si accompagna: prende la riga da sola.
      const coppia = !corrente.piena && successiva && !successiva.piena;
      const riga = coppia ? [corrente, successiva] : [corrente];
      const larghezza = corrente.piena ? PW : MEZZA;
      const altezza = corrente.piena ? 78 : 55;

      y = this.pb(doc, y, altezza + 10);
      riga.forEach((cella, col) => {
        const x = ML + col * (larghezza + GAP);
        this.dc(doc, K200); doc.setLineWidth(0.2);
        doc.rect(x, y, larghezza, altezza, "S");

        let disegnata = false;
        if (cella.img) {
          try {
            let w = larghezza - 3, h = w / cella.ratio;
            if (h > altezza - 3) { h = altezza - 3; w = h * cella.ratio; }
            doc.addImage(
              cella.img, "JPEG",
              x + (larghezza - w) / 2, y + (altezza - h) / 2, w, h,
            );
            disegnata = true;
          } catch { /* sotto esce la nota al posto dell'immagine */ }
        }
        if (!disegnata) {
          doc.setFont("helvetica", "italic"); doc.setFontSize(7); this.tc(doc, K140);
          doc.text(
            "Immagine non disponibile",
            x + larghezza / 2, y + altezza / 2, { align: "center" },
          );
        }

        // La didascalia serve a poterla citare: "come da Fig. 2" nel testo del
        // referto non si puo' scrivere se le figure non hanno un numero.
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); this.tc(doc, K80);
        doc.text(`Fig. ${numero + col}`, x, y + altezza + 3.6);
      });

      numero += riga.length;
      i += riga.length;
      y += altezza + 7;
    }
    return y + 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FOOTER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawFooter(
    doc: jsPDF,
    _doctor: Doctor | null,
    _vis?: FooterVisibilityOptions,
    pagina?: { numero: number; totale: number },
  ) {
    // La firma dell'applicazione: corpo 5, grigio chiarissimo, a sinistra sotto
    // il filetto, in diagonale rispetto al numero di pagina. Si legge se la si
    // cerca, non si nota mentre si legge il referto.
    doc.setFont("helvetica", "normal"); doc.setFontSize(5); this.tc(doc, K200);
    doc.text("Creato con Corioli", ML, FOOT_Y + 4.5);

    this.rule(doc, FOOT_Y, ML, MR, 0.2);

    // Quando e' stato stampato questo foglio e da quale visita viene. Serve
    // alla ristampa: se una visita viene corretta e il referto ristampato, due
    // fogli identici in copertina possono portare contenuti diversi, e senza
    // una data di emissione non c'e' modo di sapere quale si ha in mano.
    // Stesso corpo e stesso grigio della firma dell'applicazione: si legge se
    // la si cerca.
    if (this.fCtx?.emissione) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(5); this.tc(doc, K200);
      doc.text(san(this.fCtx.emissione), 105, FOOT_Y + 4.5, { align: "center" });
    }

    // I recapiti dello studio sono saliti nella carta intestata, dove si
    // cercano. Qui resta la numerazione, che serve solo al foglio stampato: si
    // stampa anche su una pagina sola, perche' e' il modo in cui il foglio
    // dichiara di essere completo.
    if (pagina) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); this.tc(doc, K140);
      doc.text(
        `Pagina ${pagina.numero} di ${pagina.totale}`,
        MR, FOOT_Y + 4.5, { align: "right" },
      );
    }
  }

  /**
   * Chiude il documento: numera le pagine e ripete l'identita' del paziente.
   *
   * Si fa in coda perche' "Pagina 2 di 3" richiede un totale che si conosce
   * solo a documento finito. La riga di identificazione in testa alle pagine
   * successive e' la ragione per cui i referti ospedalieri la portano: un
   * foglio che si stacca dalla graffetta, o che viene fotocopiato da solo,
   * deve restare attribuibile al suo paziente.
   */
  private static finalizzaPagine(
    doc: jsPDF, patient: Patient, dataVisita: string,
    doctor: Doctor | null, opts: FooterVisibilityOptions,
  ): void {
    const totale = doc.getNumberOfPages();
    const autore = doctor
      ? san(`Dott. ${doctor.nome} ${doctor.cognome}`.trim())
      : "";
    const nato = patient.sesso === "F" ? "nata" : "nato";
    const identita = [
      san(this.nomePaziente(patient)),
      patient.dataNascita ? `${nato} il ${fd(patient.dataNascita)}` : "",
      dataVisita ? `visita del ${fd(dataVisita)}` : "",
    ].filter(Boolean).join("   -   ");

    for (let n = 1; n <= totale; n++) {
      doc.setPage(n);

      if (n > 1) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); this.tc(doc, K80);
        doc.text(identita, ML, 12);
        // A destra chi lo ha scritto. La carta intestata sta sulla prima
        // pagina soltanto: da qui in poi un foglio che si stacca era
        // attribuibile al paziente ma non al suo autore, ed e' la meta' che
        // serve a chi lo riceve.
        if (autore) doc.text(autore, MR, 12, { align: "right" });
        this.rule(doc, 14.5, ML, MR, 0.2);
      }

      this.drawFooter(doc, doctor, opts, { numero: n, totale });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SIGNATURE BLOCK — luogo + data (sinistra) e firma del medico (destra)
  // Stesso carattere del referto (helvetica); usato da ricetta, esame, certificato.
  // ─────────────────────────────────────────────────────────────────────────────
  private static async drawSignatureBlock(
    doc: jsPDF, doctor: Doctor | null, y: number, dataDocumento?: string,
  ): Promise<number> {
    const sigW = 48; // mm
    const sigH = sigW * (SIGNATURE_STAMP_PDF_LAYOUT_H / SIGNATURE_STAMP_PDF_LAYOUT_W);
    const hasImg = Boolean(doctor?.signatureStampImage);

    // Si riserva l'altezza reale del blocco, non una stima larga: riservando
    // sempre lo spazio del timbro anche quando il timbro non c'e', la firma
    // finiva su una pagina tutta sua con sopra tre centimetri di bianco.
    //
    //   aria sopra 6 + spazio per la firma a mano 10 + filetto e nome 4,5
    //   + nome 4 + qualifica 4 = 28,5 mm
    //
    y = this.pb(doc, y, hasImg ? sigH + 21 : 29);
    y += 6;
    const baseY = y;

    // Luogo e data (sinistra), come in calce a qualunque referto: la citta'
    // e' quella dell'ambulatorio in cui la prestazione e' stata eseguita, e
    // senza la data la firma non dice quando e' stata apposta.
    if (dataDocumento) {
      const amb = doctor?.ambulatori?.find((x) => x.isPrimario)
        ?? doctor?.ambulatori?.[0];
      const luogo = amb?.citta?.trim();
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); this.tc(doc, K30);
      doc.text(
        san(luogo ? `${luogo}, ${fd(dataDocumento)}` : fd(dataDocumento)),
        ML, baseY + 12,
      );
    }

    // Firma del medico (destra)
    const lineLeft = MR - 62;
    let cy = baseY;

    if (hasImg) {
      try {
        const img = await normalizeSignatureStampImage(doctor!.signatureStampImage!);
        const fmt = signatureStampPdfFormat(img);
        doc.addImage(img, fmt, MR - sigW, cy, sigW, sigH);
        cy += sigH + 2;
      } catch {
        cy += 10;
      }
    } else {
      // Spazio per la firma autografa sopra il filetto.
      cy += 10;
    }

    this.dc(doc, K30); doc.setLineWidth(0.4); doc.line(lineLeft, cy, MR, cy);
    cy += 4.5;

    const rawName = san(`${doctor?.nome || ""} ${doctor?.cognome || ""}`.trim());
    const name = rawName ? `Dott. ${rawName}` : "_______________________";
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); this.tc(doc, K0);
    doc.text(name, MR, cy, { align: "right" });
    cy += 4;

    if (doctor?.specializzazione) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K80);
      doc.text(san(doctor.specializzazione), MR, cy, { align: "right" });
      cy += 4;
    }

    return cy + 4;
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // FLAT NORMALISER
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Visite salvate prima dell'introduzione del blocco `visita` (o importate da
   * CSV) hanno solo i campi piatti: qui vengono ricondotte alla stessa forma,
   * così il referto stampa lo stesso contenuto in entrambi i casi.
   */
  private static mkVisita(vv: Visit): NonNullable<Visit["visita"]> {
    const conclusioni = [vv.conclusioniDiagnostiche, vv.terapie]
      .filter(Boolean)
      .join("\n");
    return {
      problemaClinico: vv.descrizioneClinica ?? "",
      prestazione: vv.anamnesi ?? "",
      esameObiettivo: vv.esamiObiettivo ?? "",
      accertamenti: "",
      terapiaSpecifica: conclusioni,
      immagini: [],
    };
  }

  private static norm(visit: Visit): Visit {
    return visit.visita ? visit : { ...visit, visita: this.mkVisita(visit) };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULI STRUMENTALI CARDIOLOGICI
  //
  // Ogni modulo stampa prima la riga di misure (solo quelle valorizzate) e poi
  // il referto testuale. Se non c'e' nessuna misura ne' referto la sezione
  // viene saltata del tutto, così un referto senza ECG non lascia intestazioni
  // vuote nel foglio.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Tabella di misure a griglia: ogni cella ha l'etichetta piccola in alto e il
   * valore in grassetto sotto. Sostituisce la vecchia riga continua separata da
   * punti, che con dieci o piu' valori diventava una massa di testo illeggibile.
   *
   * Disegna solo le misure valorizzate e sceglie da sola quante righe servono;
   * le celle vuote dell'ultima riga restano bianche senza bordo.
   */
  private static drawMisureTable(
    doc: jsPDF, y: number,
    items: { label: string; value: string; forte?: boolean; span?: number }[],
    colonne = 3,
    titolo?: string,
    /**
     * Celle centrate invece che a bandiera. Serve all'anagrafica del referto,
     * che sta sotto il titolo centrato: allineate a sinistra, "Data di
     * nascita" e "Sesso" non cadevano simmetriche rispetto a "VISITA
     * CARDIOLOGICA" e il cardiologo lo vedeva storto (call dell'11 settembre
     * 2026). Centrate, la riga e' simmetrica sull'asse del foglio.
     */
    centrato = false,
  ): number {
    const presenti = items.filter((i) => i.value && i.value !== "-");
    if (presenti.length === 0) return y;

    const colW = PW / colonne;
    // 8,4 mm per riga: etichetta, valore e filetto con un millimetro d'aria
    // fra l'uno e l'altro. Erano 9, e con quattro righe di ecocardiogramma e
    // sei di ematochimici il mezzo millimetro si vedeva in fondo al foglio.
    const RIGA_BASE = 8.4;

    // Le celle si dispongono per larghezza, non contandole: una voce puo'
    // chiedere piu' colonne con `span`, e quando nella riga non ci sta piu' si
    // va a capo. Serve al nome del paziente, che in una cella da 43 mm veniva
    // troncato senza dirlo: un referto che tronca il cognome e' un referto
    // sbagliato, e mandare a capo il campo accanto costa una riga.
    type Cella = { item: (typeof presenti)[number]; col: number; span: number };
    const righe: Cella[][] = [];
    let corrente: Cella[] = [];
    let col = 0;
    for (const item of presenti) {
      const span = Math.min(Math.max(Math.round(item.span ?? 1), 1), colonne);
      if (col + span > colonne) {
        if (corrente.length) righe.push(corrente);
        corrente = [];
        col = 0;
      }
      corrente.push({ item, col, span });
      col += span;
    }
    if (corrente.length) righe.push(corrente);

    // Si impagina una riga alla volta invece di riservare il blocco intero:
    // per una tabella di dodici misure lo spazio non c'e' quasi mai in fondo
    // alla pagina, e la tabella scivolava tutta a quella dopo lasciando mezzo
    // foglio bianco. Se il salto capita a meta', la pagina nuova riapre con il
    // nome del modulo.
    for (const riga of righe) {
      // Il valore che non entra nella sua cella va a capo dentro la cella, e
      // la riga si alza per contenerlo. Prima veniva disegnata la sola prima
      // riga di testo e il resto spariva.
      const spezzate = riga.map((cella) => {
        doc.setFont("helvetica", cella.item.forte ? "bold" : "normal");
        doc.setFontSize(9);
        const maxW = cella.span * colW - 4;
        return doc.splitTextToSize(san(cella.item.value), maxW) as string[];
      });
      const massimoRighe = Math.max(1, ...spezzate.map((l) => l.length));
      const rowH = RIGA_BASE + (massimoRighe - 1) * LH;

      const prima = y;
      y = this.pb(doc, y, rowH + 2);
      if (y !== prima) y = this.segue(doc, y, titolo);

      riga.forEach((cella, i) => {
        const maxW = cella.span * colW - 4;
        // Centrata, la cella si scrive dal suo asse invece che dal filo.
        const cx = centrato
          ? ML + (cella.col + cella.span / 2) * colW
          : ML + cella.col * colW + 2;
        const allinea = centrato ? "center" : "left";

        doc.setFont("helvetica", "normal"); doc.setFontSize(7); this.tc(doc, K80);
        doc.text(san(cella.item.label), cx, y + 3.2, { maxWidth: maxW, align: allinea });

        doc.setFont("helvetica", cella.item.forte ? "bold" : "normal");
        doc.setFontSize(9); this.tc(doc, K0);
        spezzate[i].forEach((linea, n) => {
          doc.text(linea, cx, y + 7.0 + n * LH, { align: allinea });
        });
      });

      // 0,15 e non 0,1: sotto quello spessore il filetto sparisce in
      // fotocopia, ed e' quello che al referto succede quasi sempre.
      this.dc(doc, K200); doc.setLineWidth(0.15);
      doc.line(ML, y + rowH, MR, y + rowH);
      y += rowH;
    }

    return y + 3;
  }

  /**
   * Tabella a due colonne "etichetta | valore" per i dati che hanno testi
   * lunghi (struttura, categoria CAD-RADS): qui il valore va mandato a capo,
   * non troncato.
   */
  private static drawDettagliTable(
    doc: jsPDF, y: number,
    items: { label: string; value: string; forte?: boolean }[],
    titolo?: string,
  ): number {
    const presenti = items.filter((i) => i.value && i.value !== "-");
    if (presenti.length === 0) return y;

    const labelW = 34;
    presenti.forEach((item) => {
      doc.setFont("helvetica", item.forte ? "bold" : "normal"); doc.setFontSize(9);
      const linee: string[] = doc.splitTextToSize(
        san(item.value), PW - labelW - 4,
      );
      const h = Math.max(1, linee.length) * LH + 1.6;
      const prima = y;
      y = this.pb(doc, y, h + 2);
      if (y !== prima) y = this.segue(doc, y, titolo);

      doc.setFont("helvetica", "normal"); doc.setFontSize(7); this.tc(doc, K80);
      doc.text(san(item.label), ML + 2, y + 4.1);

      doc.setFont("helvetica", item.forte ? "bold" : "normal");
      doc.setFontSize(9); this.tc(doc, K0);
      linee.forEach((linea, i) => {
        doc.text(linea, ML + labelW, y + 4.1 + i * LH);
      });

      y += h;
      this.rule(doc, y, ML, MR, 0.15);
    });
    return y + 3;
  }

  /**
   * Intestazione di sezione su fascia grigia.
   *
   * Restituisce la quota da cui comincia il contenuto, cioe' il bordo
   * inferiore della fascia piu' un soffio: le tabelle partono da li', la prosa
   * ci aggiunge la distanza della sua prima linea di base. Prima restituiva la
   * linea di base della prosa, e una tabella sotto la fascia aggiungeva la sua
   * distanza a quella: sette millimetri di bianco fra il titolo e i dati.
   *
   * La fascia comincia dove finisce il blocco precedente: l'aria fra i due la
   * lascia chi sta sopra, con l'interlinea della sua ultima riga.
   *
   * `need` e' quello che il titolo si porta dietro, la fascia e la prima riga
   * di contenuto, perche' non resti da solo in fondo alla pagina.
   */
  private static sezione(doc: jsPDF, y: number, titolo: string, need = 22): number {
    y = this.pb(doc, y, need);
    // Fascia grigio chiaro da margine a margine, uguale per tutte le sezioni:
    // prosa e dati pesano lo stesso. L'ha scelta il cardiologo sui referti
    // stampati (mail del 9 settembre 2026) al posto del filetto sotto la
    // parola, e l'11 settembre l'ha voluta anche su ogni esame, al posto del
    // titolo "Esami strumentali" che li raccoglieva: una fascia per voce e
    // nessun gruppo sopra.
    doc.setFillColor(...K235);
    doc.rect(ML, y, PW, FASCIA_H, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(8.6); this.tc(doc, K0);
    // La spaziatura fra le lettere fa leggere il maiuscoletto come
    // un'intestazione e non come una parola urlata.
    doc.text(san(titolo).toUpperCase(), ML + 2, y + 3.9, { charSpace: 0.35 });

    return y + FASCIA_H + 1.3;
  }

  /**
   * Titolo di un modulo dentro un gruppo di sezioni. Piu' leggero della
   * fascia: se "INQUADRAMENTO CLINICO" e "Scompenso cardiaco" avessero lo
   * stesso peso tipografico il raggruppamento non si leggerebbe.
   *
   * Resta per l'inquadramento clinico soltanto: gli esami strumentali hanno
   * ciascuno la sua fascia dall'11 settembre 2026.
   */
  private static sottosezione(doc: jsPDF, y: number, titolo: string): number {
    y = this.pb(doc, y, 16);
    y += 2.5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); this.tc(doc, K30);
    const t = san(titolo);
    doc.text(t, ML + 1, y);
    this.rule(doc, y + 1.1, ML + 1, ML + 1 + doc.getTextWidth(t), 0.25);
    return y + 3;
  }

  /**
   * Intestazione di gruppo disegnata alla prima chiamata e mai piu'.
   *
   * Ogni modulo si salta da solo quando e' vuoto: senza questa apertura pigra
   * una visita senza scompenso, fibrillazione ne' classe di rischio lascerebbe
   * la fascia del gruppo sospesa sopra il nulla.
   */
  private static gruppo(doc: jsPDF, titolo: string): ApriGruppo {
    let aperto = false;
    return (y: number) => {
      if (aperto) return y;
      aperto = true;
      // Spazio per la fascia, il titolo del modulo e la sua prima riga: il
      // gruppo non deve restare orfano in fondo alla pagina. I due millimetri
      // in piu' staccano il nome del modulo dalla fascia, come il cardiologo
      // aveva chiesto l'8 settembre.
      return this.sezione(doc, y, titolo, 34) + 2;
    };
  }

  /**
   * Ripete il nome del modulo in cima alla pagina quando la sua tabella si e'
   * spezzata.
   *
   * Senza, la pagina nuova si apriva con due righe di misure orfane: chi legge
   * trovava "STENOSI MASSIMA 35%" senza sapere a quale esame appartenesse,
   * perche' il titolo era rimasto sulla pagina prima.
   */
  private static segue(doc: jsPDF, y: number, titolo: string | undefined): number {
    if (!titolo) return y;
    doc.setFont("helvetica", "bolditalic"); doc.setFontSize(7); this.tc(doc, K80);
    doc.text(san(`${titolo} (segue)`), ML, y + 2.4);
    return y + 5.5;
  }

  /**
   * `true` quando la misura cade fuori dai limiti di riferimento.
   *
   * E' l'unica cosa che accende il grassetto nel referto: le soglie stanno
   * tutte in `rangeClinici`, qui si legge soltanto il verdetto.
   */
  private static fuoriNorma(
    chiave: ChiaveMisura, valore: number | undefined, sesso?: "M" | "F",
  ): boolean {
    if (valore == null || !Number.isFinite(valore)) return false;
    return valutaMisura(chiave, valore, sesso).livello !== "nella-norma";
  }

  /**
   * Cognome in maiuscolo e nome in tondo: "PROVA Mario".
   *
   * Scritti tutti e due allo stesso modo non si capisce quale sia quale, e su
   * un referto che arriva sulla scrivania di qualcun altro e' la prima cosa
   * che si legge. E' la convenzione dei referti ospedalieri, e costa niente.
   */
  private static nomePaziente(patient: Patient): string {
    const cognome = (patient.cognome ?? "").trim();
    const nome = (patient.nome ?? "").trim();
    return [cognome.toUpperCase(), nome].filter(Boolean).join(" ");
  }

  /** Referto testuale di un modulo strumentale. */
  private static drawRefertoModulo(
    doc: jsPDF, y: number, testo: string | undefined,
  ): number {
    if (!testo?.trim()) return y;
    // Due righe insieme o si va a capo pagina: il referto testuale di un
    // modulo non deve lasciare un rigo solo sotto la sua tabella.
    y = this.pb(doc, y, 3.6 + 2 * LH_PROSA + 1);
    return this.block(doc, testo, ML, y + 3.6, PW, LH_PROSA, {
      font: "helvetica", style: "normal", fontSize: 10.5, color: K0,
    });
  }

  /**
   * Pressione arteriosa, con la sua fascia prima dell'elettrocardiogramma.
   *
   * Stava fra i parametri vitali, in testa al referto. Il cardiologo la vuole
   * con gli esami, come nei suoi referti, e con la posizione in cui e' stata
   * misurata (call dell'11 settembre 2026): la seconda misurazione, di solito
   * in ortostatismo, e' quella che documenta un'ipotensione ortostatica.
   *
   * Senza posizione dichiarata la prima misurazione e' in clinostatismo e la
   * seconda in ortostatismo: e' come la maschera le presenta.
   */
  private static drawPressioneArteriosa(
    doc: jsPDF, y: number, vis: NonNullable<Visit["visita"]>,
  ): number {
    const misurazioni = [
      { valore: vis.pressioneArteriosa, posizione: vis.posizionePa ?? "clino" },
      { valore: vis.pressioneArteriosa2, posizione: vis.posizionePa2 ?? "orto" },
    ].filter((m) => m.valore?.trim());
    if (misurazioni.length === 0) return y;

    y = this.sezione(doc, y, "Pressione arteriosa");
    return this.drawMisureTable(
      doc, y,
      misurazioni.map((m) => ({
        label: m.posizione === "orto" ? "Ortostatismo" : "Clinostatismo",
        value: `${(m.valore ?? "").trim()} mmHg`,
        forte: valutaPressioneScritta(m.valore).livello !== "nella-norma",
      })),
      3, "Pressione arteriosa",
    );
  }

  private static drawEcg(
    doc: jsPDF, y: number,
    ecg: NonNullable<Visit["visita"]>["ecg"],
    frequenzaCardiaca: string | undefined,
  ): number {
    if (!ecg) return y;
    const qtc = calcolaQtcBazett(
      ecg.qt,
      frequenzaCardiaca ? Number(frequenzaCardiaca) : undefined,
    );
    // Niente riga "Ritmo": la diagnosi la scrive il cardiologo nel referto
    // testuale del modulo, ed e' li' che chi legge se l'aspetta.
    const misure = [
      {
        label: "PR",
        value: ecg.pr ? `${ecg.pr} ms` : "",
        forte: this.fuoriNorma("ecg.pr", ecg.pr),
      },
      {
        label: "QRS",
        value: ecg.qrs ? `${ecg.qrs} ms` : "",
        forte: this.fuoriNorma("ecg.qrs", ecg.qrs),
      },
      { label: "QT", value: ecg.qt ? `${ecg.qt} ms` : "" },
      {
        label: "QTc",
        value: qtc.ok ? `${qtc.result.display} ms` : "",
        forte: qtc.ok && this.fuoriNorma("ecg.qtc", qtc.result.value),
      },
      { label: "Asse", value: ecg.asse != null ? `${ecg.asse}°` : "" },
    ];
    const haMisure = misure.some((m) => m.value);
    if (!haMisure && !ecg.referto?.trim()) return y;

    y = this.sezione(doc, y, "Elettrocardiogramma");
    y = this.drawMisureTable(doc, y, misure, 3, "Elettrocardiogramma");
    y = this.drawRefertoModulo(doc, y, ecg.referto);
    return y;
  }

  private static drawEcocardiogramma(
    doc: jsPDF, y: number,
    eco: NonNullable<Visit["visita"]>["ecocardiogramma"],
  ): number {
    if (!eco) return y;
    const mm = (n: number | undefined) => (n != null ? `${n} mm` : "");
    // Sedici misure, quattro righe da quattro: e' il tetto del cardiologo, che
    // vuole la tabella da leggere a colpo d'occhio. Il resto, E/e' compreso,
    // lo descrive nel referto testuale: una misura nuova ne sostituisce una.
    const misure = [
      { label: "DTD VS", value: mm(eco.ddvs) },
      { label: "DTS VS", value: mm(eco.dsvs) },
      { label: "SIV", value: mm(eco.siv), forte: this.fuoriNorma("eco.siv", eco.siv) },
      { label: "PP", value: mm(eco.pp), forte: this.fuoriNorma("eco.pp", eco.pp) },
      {
        label: "FE",
        value: eco.fe != null ? `${eco.fe}%` : "",
        forte: this.fuoriNorma("eco.fe", eco.fe),
      },
      {
        label: "Atrio sx",
        value: mm(eco.atrioSinistro),
        forte: this.fuoriNorma("eco.atrioSinistro", eco.atrioSinistro),
      },
      {
        label: "Grad. Ao. medio",
        value: eco.gradienteAorticoMedio != null
          ? `${eco.gradienteAorticoMedio} mmHg`
          : "",
      },
      {
        label: "Grad. Ao. max",
        value: eco.gradienteAorticoMassimo != null
          ? `${eco.gradienteAorticoMassimo} mmHg`
          : "",
      },
      {
        label: "AVA",
        value: eco.areaValvolareAortica != null
          ? `${eco.areaValvolareAortica} cm²`
          : "",
      },
      {
        label: "Grad. Mitr. medio",
        value: eco.gradienteMitralicoMedio != null
          ? `${eco.gradienteMitralicoMedio} mmHg`
          : "",
      },
      {
        label: "Grad. Mitr. max",
        value: eco.gradienteMitralicoMassimo != null
          ? `${eco.gradienteMitralicoMassimo} mmHg`
          : "",
      },
      { label: "Radice ao.", value: mm(eco.radiceAortica) },
      {
        label: "Ao. asc.",
        value: mm(eco.aortaAscendente),
        forte: this.fuoriNorma("eco.aortaAscendente", eco.aortaAscendente),
      },
      {
        label: "TAPSE",
        value: mm(eco.tapse),
        forte: this.fuoriNorma("eco.tapse", eco.tapse),
      },
      {
        label: "PAPs",
        value: eco.paps != null ? `${eco.paps} mmHg` : "",
        forte: this.fuoriNorma("eco.paps", eco.paps),
      },
      { label: "E/A", value: eco.rapportoEA != null ? String(eco.rapportoEA) : "" },
    ];
    if (!misure.some((m) => m.value) && !eco.referto?.trim()) return y;

    y = this.sezione(doc, y, "Ecocardiogramma color-Doppler transtoracico");
    y = this.drawMisureTable(doc, y, misure, 4, "Ecocardiogramma");
    y = this.drawRefertoModulo(doc, y, eco.referto);
    return y;
  }

  private static drawTcCoronarica(
    doc: jsPDF, y: number,
    tc: NonNullable<Visit["visita"]>["tcCoronarica"],
    sogliaCac: SogliaCacSevera,
  ): number {
    if (!tc) return y;
    const esitoCac = categoriaCac(tc.cacScore, sogliaCac);
    // Solo la sigla: la descrizione per esteso ("tronco comune >= 50% o
    // trivasale >= 70%") ripete a chi refertava la definizione della classe.
    const cadRads = tc.cadRads ? `CAD-RADS ${tc.cadRads}` : "";

    // I modificatori si scrivono attaccati alla categoria, come si refertano:
    // "CAD-RADS 3 / HRP, S".
    const modificatori = (tc.cadRadsModificatori ?? []).join(", ");

    // Tre valori e nessun commento, su una riga sola (mail del cardiologo del
    // 10 settembre 2026). Data, struttura, metodica, componenti, stenosi,
    // segmenti e FFR-TC restano compilabili nella maschera per gli studi, ma
    // nel referto non entrano nemmeno quando ci sono: la lettura del quadro la
    // scrive lui nel testo del modulo.
    const misure = [
      {
        label: "Calcium score",
        // Il solo punteggio Agatston. La fascia resta nella maschera, dove
        // serve mentre si compila, e non nel referto.
        value: tc.cacScore != null ? String(tc.cacScore) : "",
        forte: esitoCac?.categoria === "severa",
      },
      {
        label: "CAD-RADS",
        value: cadRads ? `${cadRads}${modificatori ? ` / ${modificatori}` : ""}` : "",
      },
      { label: "Burden di placca", value: v(tc.burdenPlacca, "") },
    ];
    if (!misure.some((m) => m.value) && !tc.referto?.trim()) return y;

    y = this.sezione(doc, y, "TC coronarica");
    y = this.drawMisureTable(doc, y, misure, 3, "TC coronarica");
    // L'avvertenza sul CAC resta nella maschera e non entra nel referto: "il
    // punteggio CAC non equivale a stenosi ostruttiva" e' una cosa che il
    // cardiologo sa, e nel referto occupa due righe per non dire niente. Il
    // giudizio lo formula lui qui sotto.
    y = this.drawRefertoModulo(doc, y, tc.referto);
    return y;
  }

  /**
   * Frazioni di eiezione delle visite precedenti dello stesso paziente.
   *
   * Serve al fenotipo HFimpEF, che nasce dal confronto fra due misure e quindi
   * non e' ricavabile dalla sola visita in stampa. Le si rilegge qui invece di
   * farsele passare da chi chiama: il referto si genera da sei punti diversi
   * dell'applicazione, e in due di quelli la cronologia del paziente non e'
   * caricata. Se la lettura fallisce il fenotipo ripiega sulla sola FE
   * corrente: un referto senza la sigla HFimpEF e' un peggioramento
   * accettabile, un referto che non si genera no.
   */
  private static async fePrecedenti(
    patientId: string,
    visitaCorrenteId: string,
  ): Promise<FePrecedente[]> {
    try {
      const visite = await VisitService.getVisitsByPatientId(patientId);
      return visite
        .filter((v) => v.id !== visitaCorrenteId)
        .map((v) => ({
          valore: Number(v.visita?.ecocardiogramma?.fe),
          // L'ecocardiogramma non ha una data propria: la FE si riferisce alla
          // visita in cui e' stata registrata.
          data: v.dataVisita,
        }))
        .filter((p) => Number.isFinite(p.valore) && p.valore > 0);
    } catch {
      return [];
    }
  }

  /**
   * Scompenso cardiaco.
   *
   * Il fenotipo e l'esito del peptide vengono **ricalcolati qui** dalla FE e
   * dal valore salvati, non ripresi da un campo: e' la stessa ragione per cui
   * il test ergometrico ricalcola la percentuale di FC massima, cioe' evitare
   * che il referto porti un giudizio rimasto indietro rispetto ai numeri che
   * lo hanno prodotto.
   */
  private static drawScompenso(
    doc: jsPDF, y: number,
    sc: NonNullable<Visit["visita"]>["scompenso"],
    fe: number | undefined,
    patient: Patient,
    apriGruppo: ApriGruppo,
    fePrecedenti: FePrecedente[] = [],
  ): number {
    if (!sc) return y;
    const eta = Number(calcAge(patient.dataNascita));
    const fenotipo = fenotipoConStorico(fe, fePrecedenti);
    const esito = valutaNtProBnp(
      sc.ntProBnp,
      sc.contestoBnp,
      Number.isFinite(eta) ? eta : undefined,
    );
    const misure = [
      // Senza FE la riga resta, con il motivo: chi legge deve sapere che il
      // fenotipo manca, non che e' stato valutato e trovato normale.
      {
        label: "Fenotipo (da FE)",
        value: fenotipo ? fenotipo.label : FENOTIPO_DA_DEFINIRE.label,
      },
      { label: "Classe NYHA", value: sc.nyha ? `NYHA ${sc.nyha}` : "" },
      { label: "Data dosaggio", value: sc.dataBnp ? fd(sc.dataBnp) : "" },
      {
        // Il solo valore dosato. Accanto al numero non va nessun giudizio
        // scritto: "210 pg/mL (Sopra la soglia di esclusione)" faceva dire al
        // referto quello che il grassetto dice gia' da solo, e la lettura della
        // soglia la fa il cardiologo nel testo del modulo. E' la stessa regola
        // per cui la pressione non porta scritto "iperteso" e il calcium score
        // non porta la sua fascia.
        //
        // La valutazione resta: decide il grassetto, che e' l'unico segnale.
        label: "NT-proBNP",
        value: sc.ntProBnp != null ? `${sc.ntProBnp} pg/mL` : "",
        forte: esito != null && esito.livello !== "esclusione",
      },
      {
        label: "Contesto",
        value: sc.contestoBnp ? CONTESTO_BNP_LABELS[sc.contestoBnp] : "",
      },
    ];
    if (!misure.some((m) => m.value) && !sc.referto?.trim()) return y;

    y = apriGruppo(y);
    y = this.sottosezione(doc, y, "Scompenso cardiaco");
    y = this.drawDettagliTable(doc, y, misure, "Scompenso cardiaco");
    // Sotto la tabella c'e' solo il testo del cardiologo. Le note che l'app
    // scriveva qui — la fascia HFmrEF di ESC 2021, l'avvertenza a non
    // sospendere la terapia quando la frazione risale, la lettura della soglia
    // dell'NT-proBNP, il confronto fra la frazione precedente e quella attuale
    // — uscivano nello stesso carattere della sua prosa, e niente sul foglio
    // diceva che non le aveva scritte lui. Il referto lo legge un medico.
    //
    // Il confronto fra le due frazioni resta dove serve: e' quello che fa
    // comparire la sigla HFimpEF nella riga del fenotipo.
    y = this.drawRefertoModulo(doc, y, sc.referto);
    return y;
  }

  /**
   * Fibrillazione atriale: CHA₂DS₂-VASc e HAS-BLED.
   *
   * I punteggi si ricalcolano qui dai fattori salvati, come il fenotipo dello
   * scompenso, e restano **separati**: sono due domande diverse, e affiancarli
   * come un bilancio unico suggerirebbe una sottrazione che le linee guida non
   * fanno.
   *
   * Del punteggio esce **solo il totale**. Le voci che lo compongono e la
   * lettura della fascia stavano nel referto perche' un totale da solo non e'
   * verificabile da chi legge; il cardiologo le ha tolte perche' sono gia'
   * nella prosa dell'anamnesi e nel referto diventano rumore fra lui e il
   * numero che gli serve. Restano visibili nella maschera, dove servono
   * mentre si compila.
   *
   * Peso, creatinina, eta' ed eGFR si stampano qui anche se compaiono altrove
   * nel referto: sono i quattro dati da cui si decide la dose
   * dell'anticoagulante orale, e cercarli in tre punti diversi del foglio e'
   * esattamente il tempo che il referto deve far risparmiare.
   */
  private static drawFibrillazioneAtriale(
    doc: jsPDF, y: number,
    fa: NonNullable<Visit["visita"]>["fibrillazioneAtriale"],
    patient: Patient,
    fattoriRischio: NonNullable<Visit["visita"]>["fattoriRischio"],
    pesoCorporeo: number | undefined,
    creatinina: number | undefined,
    apriGruppo: ApriGruppo,
  ): number {
    if (!fa) return y;
    const etaNum = Number(calcAge(patient.dataNascita));
    const eta = Number.isFinite(etaNum) ? etaNum : undefined;
    const sesso =
      patient.sesso === "M" || patient.sesso === "F" ? patient.sesso : undefined;

    const chads = calcolaChadsVasc({
      eta,
      sesso,
      fattori: {
        scompenso: fa.cvScompenso,
        // Dichiarati fra i fattori di rischio della visita, non nel modulo FA.
        ipertensione: fattoriRischio?.ipertensione,
        diabete: fattoriRischio?.diabete,
        ictus: fa.cvIctus,
        vascolare: fa.cvVascolare,
      },
    });
    const hasBled = calcolaHasBled({
      eta,
      // Senza piu' la voce sulla terapia anticoagulante, a dichiarare il
      // warfarin e' la spunta stessa dell'INR labile.
      inTao: Boolean(fa.hbInrLabile),
      fattori: {
        ipertensioneNonControllata: fa.hbIpertensioneNonControllata,
        funzioneRenale: fa.hbFunzioneRenale,
        funzioneEpatica: fa.hbFunzioneEpatica,
        ictus: fa.hbIctus,
        sanguinamento: fa.hbSanguinamento,
        inrLabile: fa.hbInrLabile,
        farmaci: fa.hbFarmaci,
        alcol: fa.hbAlcol,
      },
    });

    // Il modulo esce solo se il medico ha acceso l'interruttore. I due
    // punteggi si calcolano da eta', sesso e fattori di rischio, quindi sono
    // quasi sempre disponibili: senza una dichiarazione esplicita ogni referto
    // porterebbe una "Fibrillazione atriale 0 / 9" anche su chi non l'ha mai
    // avuta.
    //
    // Le visite salvate prima dell'interruttore non hanno il campo: per quelle
    // vale il vecchio criterio, altrimenti ristampando un referto vecchio la
    // sezione sparirebbe.
    // Solo i campi che la maschera non sa piu' scrivere: forma clinica e
    // terapia anticoagulante non esistono piu', e il referto testuale si puo'
    // compilare solo a modulo acceso. Le spunte dei punteggi non bastano —
    // sono esattamente il caso che il cardiologo non vuole vedere stampato.
    const legacy =
      fa.attivo == null &&
      (Boolean(fa.tipo) ||
        Boolean(fa.anticoagulante) ||
        Boolean(fa.referto?.trim()));
    if (fa.attivo !== true && !legacy) return y;

    // Ne' forma clinica ne' terapia anticoagulante: sono diagnosi e decisioni,
    // e nel referto le formula il cardiologo nel testo del modulo.
    const misureFa = [
      {
        label: "CHA2DS2-VASc",
        value: chads.ok ? `${chads.esito.punteggio} / ${chads.esito.massimo}` : "",
      },
      {
        label: "HAS-BLED",
        value: hasBled.ok ? `${hasBled.esito.punteggio} / ${hasBled.esito.massimo}` : "",
      },
    ];

    const egfr = calcolaEgfrCkdEpi(creatinina, eta, sesso);
    // Le soglie di riduzione dei DOAC sono scritte sulla clearance secondo
    // Cockcroft-Gault, non sull'eGFR: nel paziente anziano e magro i due
    // numeri divergono, ed e' esattamente il paziente in cui la dose si riduce.
    const clcr = calcolaClearanceCockcroftGault(creatinina, eta, pesoCorporeo, sesso);
    const misure = [
      ...misureFa,
      { label: "Peso", value: pesoCorporeo != null ? `${pesoCorporeo} kg` : "" },
      { label: "Creatinina", value: creatinina != null ? `${creatinina} mg/dL` : "" },
      { label: "Età", value: eta != null ? `${eta} anni` : "" },
      {
        // Senza unità come nel blocco degli ematochimici: "mL/min/1,73 m²" ha
        // un carattere che il font standard di jsPDF non disegna.
        // Senza lo stadio KDIGO fra parentesi: e' una classificazione che il
        // medico legge dal numero, e accanto al valore non va nessun giudizio.
        label: "eGFR (CKD-EPI)",
        value: egfr.ok ? egfr.result.display : "",
      },
      {
        label: "ClCr (Cockcroft-Gault)",
        value: clcr.ok ? `${clcr.result.display} mL/min` : "",
      },
    ];

    y = apriGruppo(y);
    y = this.sottosezione(doc, y, "Fibrillazione atriale");
    y = this.drawDettagliTable(doc, y, misure, "Fibrillazione atriale");
    y = this.drawRefertoModulo(doc, y, fa.referto);
    return y;
  }

  /**
   * Test ergometrico. La percentuale della frequenza massima teorica viene
   * ricalcolata qui invece di essere ripresa dal campo: se il medico corregge
   * la FC raggiunta senza ritoccare la percentuale, il referto resterebbe
   * altrimenti con due numeri che non si parlano.
   */
  private static drawTestErgometrico(
    doc: jsPDF, y: number,
    erg: NonNullable<Visit["visita"]>["testErgometrico"],
    patient: Patient,
  ): number {
    if (!erg) return y;
    const eta = Number(calcAge(patient.dataNascita));
    const pct = calcolaPercentualeFcMax(
      erg.fcMax,
      Number.isFinite(eta) && eta > 0 ? eta : undefined,
    );
    const misure = [
      { label: "Data esame", value: erg.dataEsame ? fd(erg.dataEsame) : "" },
      { label: "Protocollo", value: v(erg.protocollo, "") },
      { label: "Durata", value: erg.durataMin != null ? `${erg.durataMin} min` : "" },
      { label: "Carico max", value: erg.caricoWatt != null ? `${erg.caricoWatt} W` : "" },
      { label: "METs", value: erg.mets != null ? String(erg.mets) : "" },
      { label: "FC max", value: erg.fcMax != null ? `${erg.fcMax} bpm` : "" },
      {
        label: "% FC teorica",
        value: pct.ok ? `${pct.result.display}%` : "",
      },
      { label: "P.A. al picco", value: v(erg.paMax, "") },
      { label: "Interruzione", value: v(erg.motivoInterruzione, "") },
      { label: "Esito", value: v(erg.esito, "") },
    ];
    if (!misure.some((m) => m.value) && !erg.referto?.trim()) return y;

    y = this.sezione(doc, y, "Test ergometrico");
    y = this.drawMisureTable(doc, y, misure, 3, "Test ergometrico");
    y = this.drawRefertoModulo(doc, y, erg.referto);
    return y;
  }

  private static drawHolterEcg(
    doc: jsPDF, y: number,
    h: NonNullable<Visit["visita"]>["holterEcg"],
  ): number {
    if (!h) return y;
    const bpm = (n: number | undefined) => (n != null ? `${n} bpm` : "");
    const misure = [
      { label: "Data inizio", value: h.dataEsame ? fd(h.dataEsame) : "" },
      { label: "Durata", value: h.durataOre != null ? `${h.durataOre} ore` : "" },
      { label: "Ritmo prevalente", value: v(h.ritmoPrevalente, "") },
      { label: "FC media", value: bpm(h.fcMedia) },
      { label: "FC minima", value: bpm(h.fcMin) },
      { label: "FC massima", value: bpm(h.fcMax) },
      { label: "BESV / 24h", value: h.besv != null ? String(h.besv) : "" },
      { label: "BEV / 24h", value: h.bev != null ? String(h.bev) : "" },
      {
        label: "Pausa max",
        value: h.pausaMaxSec != null ? `${h.pausaMaxSec} s` : "",
      },
    ];
    if (!misure.some((m) => m.value) && !h.referto?.trim()) return y;

    y = this.sezione(doc, y, "ECG dinamico secondo Holter");
    y = this.drawMisureTable(doc, y, misure, 3, "ECG dinamico secondo Holter");
    y = this.drawRefertoModulo(doc, y, h.referto);
    return y;
  }

  /**
   * Monitoraggio pressorio delle 24 ore. Le medie sono stampate accoppiate
   * ("128/78") invece che in due caselle: una pressione si legge come coppia, e
   * separarla raddoppierebbe le celle senza aggiungere informazione.
   */
  private static drawHolterPressorio(
    doc: jsPDF, y: number,
    h: NonNullable<Visit["visita"]>["holterPressorio"],
  ): number {
    if (!h) return y;
    const coppia = (s?: number, d?: number) =>
      s != null || d != null ? `${s ?? "-"}/${d ?? "-"} mmHg` : "";
    // Se il referto riporta gia' il calo notturno vince quello; altrimenti si
    // ricava dalle medie diurna e notturna.
    const caloRicavato = calcolaCaloNotturno(h.mediaDiurnaSist, h.mediaNotturnaSist);
    const calo =
      h.caloNotturnoPct != null
        ? `${h.caloNotturnoPct}%`
        : caloRicavato.ok
          ? `${caloRicavato.result.display}%`
          : "";

    const misure = [
      { label: "Data inizio", value: h.dataEsame ? fd(h.dataEsame) : "" },
      { label: "Media 24 ore", value: coppia(h.media24Sist, h.media24Diast) },
      {
        label: "Media diurna",
        value: coppia(h.mediaDiurnaSist, h.mediaDiurnaDiast),
      },
      {
        label: "Media notturna",
        value: coppia(h.mediaNotturnaSist, h.mediaNotturnaDiast),
      },
      { label: "Calo notturno", value: calo },
      {
        label: "Carico pressorio",
        value: h.caricoPressorioPct != null ? `${h.caricoPressorioPct}%` : "",
      },
    ];
    if (!misure.some((m) => m.value) && !h.referto?.trim()) return y;

    y = this.sezione(doc, y, "Monitoraggio pressorio delle 24 ore");
    y = this.drawMisureTable(doc, y, misure, 3, "Monitoraggio pressorio delle 24 ore");
    y = this.drawRefertoModulo(doc, y, h.referto);
    return y;
  }

  /**
   * Esami ematochimici. Oltre ai valori dosati stampa i due indici derivati che
   * il medico userebbe altrimenti a mano — LDL secondo Friedewald quando manca
   * il dosaggio diretto, ed eGFR — etichettati come calcolati per non
   * confonderli mai con un valore di laboratorio.
   */
  /**
   * Classe di rischio e obiettivi lipidici che ne discendono.
   *
   * La direzione conta e va detta: la classe di rischio **non si ricava dai
   * lipidi**. La attribuisce il medico dall'anamnesi dei fattori di rischio —
   * eventi pregressi, danno d'organo, comorbidita' — e sono le linee guida a
   * legare a quella classe l'obiettivo di LDL e di ApoB. Qui si stampa la
   * classe dichiarata, l'obiettivo che le corrisponde e il valore del paziente:
   * e' il ragionamento che il curante deve poter rifare leggendo il referto, e
   * per rifarlo gli bastano i due numeri.
   *
   * La distanza fra i due era scritta accanto al valore ("77 mg/dL sopra
   * l'obiettivo di 55 mg/dL") ed e' stata tolta con tutte le altre letture
   * che l'applicazione aggiungeva ai dati: il referto lo legge un medico.
   *
   * Senza classe dichiarata la sezione non esce: un obiettivo lipidico senza
   * la classe da cui deriva sarebbe un numero senza motivo.
   */
  private static drawRischioCv(
    doc: jsPDF, y: number,
    categoria: NonNullable<Visit["visita"]>["categoriaRischioCv"],
    lab: NonNullable<Visit["visita"]>["laboratorio"],
    sintesi: string | undefined,
    apriGruppo: ApriGruppo,
  ): number {
    if (!categoria) {
      // Senza classe resta la sola sintesi scritta dal medico, che e' comunque
      // un inquadramento e sta nel gruppo con gli altri.
      if (!sintesi?.trim()) return y;
      y = apriGruppo(y);
      y = this.sottosezione(doc, y, "Sintesi del rischio");
      return this.drawRefertoModulo(doc, y, sintesi);
    }

    // LDL dosato quando c'e', altrimenti quello di Friedewald: e' il valore su
    // cui il medico ragiona, e il referto dice sempre da dove viene.
    const ldlCalc = lab?.ldlMisurato == null
      ? calcolaLdlFriedewald(lab?.colesteroloTotale, lab?.hdl, lab?.trigliceridi)
      : null;
    const ldl = lab?.ldlMisurato ?? (ldlCalc?.ok ? ldlCalc.result.value : undefined);
    const ldlEsito = confrontaConTarget(ldl, categoria, TARGET_LDL);
    const apoBEsito = confrontaConTarget(lab?.apoB, categoria, TARGET_APOB);
    const targetApoB = TARGET_APOB[categoria];

    const misure = [
      { label: "Classe di rischio", value: CATEGORIA_RISCHIO_LABELS[categoria] },
      { label: "Obiettivo LDL", value: descriviTargetLdl(categoria) },
      {
        // Il valore dosato e nient'altro. L'obiettivo della classe sta nella
        // riga sopra e il grassetto dice se il paziente e' fuori: la distanza
        // scritta ("77 mg/dL sopra l'obiettivo di 55") era una sottrazione fra
        // due numeri che il referto ha gia' stampato entrambi.
        label: lab?.ldlMisurato != null ? "LDL dosato" : "LDL (Friedewald)",
        value: ldl != null ? `${Math.round(ldl)} mg/dL` : "",
        forte: ldlEsito != null && !ldlEsito.aTarget,
      },
      {
        label: "Obiettivo ApoB",
        value: targetApoB
          ? `< ${targetApoB.mgdl} mg/dL${targetApoB.opzionale ? " \u2014 opzione considerabile" : ""}`
          : "",
      },
      {
        label: "ApoB",
        value: lab?.apoB != null ? `${lab.apoB} mg/dL` : "",
        forte: apoBEsito != null && !apoBEsito.aTarget,
      },
    ];

    y = apriGruppo(y);
    y = this.sottosezione(doc, y, "Rischio cardiovascolare");
    y = this.drawDettagliTable(doc, y, misure, "Rischio cardiovascolare");
    y = this.drawRefertoModulo(doc, y, sintesi);
    return y;
  }

  /**
   * EcoColorDoppler dei tronchi sovraaortici.
   *
   * Sta fra gli esami strumentali anche se a refertarlo e' il chirurgo
   * vascolare: il cardiologo lo legge per la stessa ragione per cui legge la TC
   * coronarica, cioe' perche' la placca vista con gli ultrasuoni e'
   * aterosclerosi documentata e sposta la classe di rischio.
   */
  private static drawDopplerTsa(
    doc: jsPDF, y: number,
    tsa: NonNullable<Visit["visita"]>["dopplerTsa"],
  ): number {
    if (!tsa) return y;

    const misure = [
      { label: "Data esame", value: tsa.dataEsame ? fd(tsa.dataEsame) : "" },
      { label: "Struttura", value: v(tsa.struttura, "") },
      { label: "IMT massimo", value: tsa.imtMax != null ? `${tsa.imtMax} mm` : "" },
      {
        // "ATS carotidea" nelle variabili cliniche, "stenosi massima" qui: e'
        // lo stesso campo, e nel referto dell'esame porta il nome con cui
        // l'esame la referta.
        label: "Stenosi massima",
        value: tsa.stenosiCarotidea != null
          ? `${tsa.stenosiCarotidea}%${
              tsa.sedeStenosi?.trim() ? ` (${san(tsa.sedeStenosi.trim())})` : ""
            }`
          : "",
      },
      { label: "Placche", value: v(tsa.placche, "") },
      { label: "Assi vertebrali", value: v(tsa.vertebrali, "") },
    ];
    if (!misure.some((m) => m.value) && !tsa.referto?.trim()) return y;

    y = this.sezione(doc, y, "EcoColorDoppler dei tronchi sovraaortici");
    y = this.drawDettagliTable(doc, y, misure, "Doppler TSA");
    y = this.drawRefertoModulo(doc, y, tsa.referto);
    return y;
  }

  private static drawLaboratorio(
    doc: jsPDF, y: number,
    lab: NonNullable<Visit["visita"]>["laboratorio"],
    patient: Patient,
  ): number {
    if (!lab) return y;
    const mg = (n: number | undefined) => (n != null ? `${n} mg/dL` : "");

    const ldlCalc = lab.ldlMisurato == null
      ? calcolaLdlFriedewald(lab.colesteroloTotale, lab.hdl, lab.trigliceridi)
      : null;
    const ctHdl = calcolaRapportoCtHdl(lab.colesteroloTotale, lab.hdl);
    const tgHdl = calcolaRapportoTgHdl(lab.trigliceridi, lab.hdl);
    const homa = calcolaHomaIr(lab.glicemia, lab.insulina);
    const eta = Number(calcAge(patient.dataNascita));
    const sesso = patient.sesso === "M" || patient.sesso === "F"
      ? patient.sesso
      : undefined;
    const egfr = calcolaEgfrCkdEpi(
      lab.creatinina,
      Number.isFinite(eta) && eta > 0 ? eta : undefined,
      sesso,
    );

    const misure = [
      { label: "Col. totale", value: mg(lab.colesteroloTotale) },
      { label: "HDL", value: mg(lab.hdl) },
      {
        label: lab.ldlMisurato != null ? "LDL (dosato)" : "LDL (Friedewald)",
        value: lab.ldlMisurato != null
          ? mg(lab.ldlMisurato)
          : ldlCalc?.ok ? `${ldlCalc.result.display} mg/dL` : "",
        forte: this.fuoriNorma(
          "lab.ldl",
          lab.ldlMisurato ?? (ldlCalc?.ok ? ldlCalc.result.value : undefined),
        ),
      },
      {
        label: "Trigliceridi",
        value: mg(lab.trigliceridi),
        forte: this.fuoriNorma("lab.trigliceridi", lab.trigliceridi),
      },
      { label: "ApoB", value: mg(lab.apoB), forte: this.fuoriNorma("lab.apoB", lab.apoB) },
      { label: "Lp(a)", value: mg(lab.lpa), forte: this.fuoriNorma("lab.lpa", lab.lpa) },
      {
        label: "CT / HDL (calc.)",
        value: ctHdl.ok ? ctHdl.result.display : "",
        forte: ctHdl.ok && this.fuoriNorma("lab.ctHdl", ctHdl.result.value),
      },
      {
        label: "TG / HDL (calc.)",
        value: tgHdl.ok ? tgHdl.result.display : "",
        forte: tgHdl.ok && this.fuoriNorma("lab.tgHdl", tgHdl.result.value),
      },
      // Profilo infiammatorio / redox: e' la parte della placca che i lipidi
      // non misurano, e nel referto sta subito sotto il burden aterogeno come
      // nella maschera.
      {
        label: "hs-PCR",
        value: lab.hsPcr != null ? `${lab.hsPcr} mg/L` : "",
        forte: this.fuoriNorma("lab.hsPcr", lab.hsPcr),
      },
      {
        label: "Fibrinogeno",
        value: lab.fibrinogeno != null ? `${lab.fibrinogeno} mg/dL` : "",
      },
      { label: "LDL ossidate", value: lab.oxLdl != null ? `${lab.oxLdl} U/L` : "" },
      {
        label: "Glicemia",
        value: mg(lab.glicemia),
        forte: this.fuoriNorma("lab.glicemia", lab.glicemia),
      },
      { label: "Insulinemia", value: lab.insulina != null ? `${lab.insulina} uU/mL` : "" },
      {
        // Il numero e basta: la fascia di lettura resta nella maschera, e nel
        // referto la categoria la dichiara il cardiologo nelle conclusioni.
        label: "HOMA-IR (calc.)",
        value: homa.ok ? homa.result.display : "",
        forte: homa.ok && this.fuoriNorma("lab.homa", homa.result.value),
      },
      {
        label: "HbA1c",
        value: lab.hba1c != null ? `${lab.hba1c}%` : "",
        forte: this.fuoriNorma("lab.hba1c", lab.hba1c),
      },
      { label: "Creatinina", value: mg(lab.creatinina) },
      {
        label: "eGFR (CKD-EPI)",
        value: egfr.ok ? egfr.result.display : "",
        forte: egfr.ok && this.fuoriNorma("lab.egfr", egfr.result.value),
      },
      {
        label: "Albuminuria",
        value: lab.albuminuria != null ? `${lab.albuminuria} mg/g` : "",
        forte: this.fuoriNorma("lab.albuminuria", lab.albuminuria),
      },
      {
        label: "Emoglobina",
        value: lab.emoglobina != null ? `${lab.emoglobina} g/dL` : "",
        forte: this.fuoriNorma("lab.emoglobina", lab.emoglobina, sesso),
      },
      {
        label: "AST",
        value: lab.ast != null ? `${lab.ast} U/L` : "",
        forte: this.fuoriNorma("lab.ast", lab.ast),
      },
      {
        label: "ALT",
        value: lab.alt != null ? `${lab.alt} U/L` : "",
        forte: this.fuoriNorma("lab.alt", lab.alt),
      },
      {
        label: "Uricemia",
        value: mg(lab.uricemia),
        forte: this.fuoriNorma("lab.uricemia", lab.uricemia, sesso),
      },
      // Accanto all'uricemia come nella maschera. Senza grassetto finche' il
      // cardiologo non indica la soglia.
      { label: "Azotemia", value: mg(lab.azotemia) },
      {
        label: "TSH",
        value: lab.tsh != null ? `${lab.tsh} mU/L` : "",
        forte: this.fuoriNorma("lab.tsh", lab.tsh),
      },
    ];
    if (!misure.some((m) => m.value)) return y;

    const titolo = lab.dataPrelievo
      ? `Esami ematochimici (prelievo del ${fd(lab.dataPrelievo)})`
      : "Esami ematochimici";
    y = this.sezione(doc, y, titolo);
    y = this.drawMisureTable(doc, y, misure, 3, "Esami ematochimici");
    // Niente nota sui valori calcolati: che l'LDL sia di Friedewald e l'eGFR
    // una stima lo dice l'etichetta della cella, e chi legge il referto lo sa.
    return y;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── REFERTO DI VISITA ─────────────────────────────────────────────────────
  static async generateVisitPDF(
    patient: Patient,
    visit: Visit,
    options?: VisitPdfOptions,
  ): Promise<Blob | undefined> {
    const nv = this.norm(visit);
    if (!nv.visita) return;
    const vis = nv.visita;

    const [doctor, prefs] = await Promise.all([
      DoctorService.getDoctor(),
      PreferenceService.getPreferences(),
    ]);
    const fo: FooterVisibilityOptions = {
      showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
      showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
    };
    // Timbro di emissione: quando questa copia e' stata prodotta e da quale
    // visita viene. La visita si puo' correggere e il referto ristampare, e
    // due copie della stessa visita sono due fogli diversi.
    const ora = new Date();
    const rif = (visit.id ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    const emissione = [
      `Emesso il ${ora.toLocaleDateString("it-IT")} alle ${
        ora.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
      }`,
      rif ? `rif. ${rif}` : "",
    ].filter(Boolean).join("   -   ");

    // Piedi differiti: la numerazione "Pagina 2 di 3" vuole un totale che si
    // conosce solo a documento chiuso.
    this.fCtx = { doctor, opts: fo, differita: true, emissione };
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    // Il referto viaggia: finisce in una cartella di rete, in un gestionale
    // documentale, in un allegato di posta. Senza proprieta' il file e' un
    // "documento senza titolo" che nessuna ricerca trova, mentre il nome del
    // paziente sta gia' nel nome del file e nel corpo del referto.
    doc.setProperties({
      title: `Referto di visita cardiologica - ${this.nomePaziente(patient)} - ${fd(visit.dataVisita)}`,
      subject: "Referto di visita cardiologica",
      author: doctor ? `Dott. ${doctor.nome} ${doctor.cognome}`.trim() : "",
      creator: "Corioli Cardiologia",
    });
    doc.setLanguage("it");

    let y = this.drawHeader(doc, "VISITA CARDIOLOGICA", "", doctor, true, fo);

    // Il blocco in testa porta la sola identita' del paziente. Peso e BMI
    // stavano anche qui, e poi di nuovo nella colonna "Antropometria" venti
    // millimetri piu' sotto: sono variabili della visita, e vivono la' dove
    // cambiano a ogni controllo.
    const altezzaCm = patient?.altezza ?? 0;
    const peso = Number(vis.pesoCorporeo) || 0;
    const bmi = altezzaCm > 0 && peso > 0
      ? (peso / Math.pow(altezzaCm / 100, 2)).toFixed(1)
      : "-";
    // Anagrafica centrata sotto il titolo centrato: vedi `drawMisureTable`.
    y = this.drawPatientBlock(doc, patient, visit.dataVisita, y, "Data visita", {
      centrato: true,
    });

    // I fattori di rischio dichiarati dal medico nella maschera. Il referto
    // stampa piu' sotto la classe di rischio e l'obiettivo lipidico che ne
    // discende, ma la classe non e' calcolata: la attribuisce il medico
    // guardando proprio queste caselle. Senza, il referto chiede al curante di
    // credere alla classe sulla parola, e il ragionamento che dice di voler
    // documentare resta a meta'.
    //
    // Sono righe di elenco senza etichetta: sette "Ipertensione arteriosa: Si'"
    // di fila direbbero sette volte la stessa cosa.
    const dichiarati = FATTORI_RISCHIO_CV
      .filter((f) => vis.fattoriRischio?.[f.chiave])
      .map((f) => ({ value: f.label }));
    // Il fumo tiene l'etichetta perche' e' l'unico che si stampa anche in
    // negativo: la maschera lo chiede a tre stati, e "non fumatore" e' un dato,
    // "non rilevato" no.
    const fumo = vis.fumatore === "si" ? "Si'" : vis.fumatore === "no" ? "No" : "";

    // "Variabili" e non "parametri": un parametro e' fisso, questi cambiano a
    // ogni controllo, ed e' il confronto con il valore precedente che si guarda.
    y = this.drawInquadramentoGrid(doc, y, "Variabili cliniche", [
      {
        // La pressione non sta piu' qui: ha la sua sezione prima
        // dell'elettrocardiogramma, con la posizione della misurazione.
        header: "Parametri vitali",
        items: [
          {
            label: "F.C.",
            value: v(vis.frequenzaCardiaca ? `${vis.frequenzaCardiaca} bpm` : ""),
            forte: this.fuoriNorma(
              "vitali.frequenzaCardiaca", Number(vis.frequenzaCardiaca) || undefined,
            ),
          },
        ],
      },
      {
        header: "Antropometria",
        items: [
          { label: "Peso", value: peso > 0 ? `${peso} kg` : "-" },
          { label: "Altezza", value: altezzaCm > 0 ? `${altezzaCm} cm` : "-" },
          {
            label: "BMI",
            value: bmi,
            forte: this.fuoriNorma("vitali.bmi", Number(bmi) || undefined),
          },
        ],
      },
      {
        // Il fumo stava fra i parametri vitali, dove non e' mai stato un segno
        // vitale: e' un fattore di rischio, ed era anche l'unico dei suoi a
        // uscire nel referto mentre gli altri sette restavano nella maschera.
        header: "Fattori di rischio",
        items: [
          ...(fumo ? [{ label: "Fumo", value: fumo }] : []),
          ...dichiarati,
        ],
      },
    ]);

    // L'anamnesi precede il motivo della visita, come nel referto cardiologico
    // standard: chi legge deve avere la storia del paziente prima della
    // domanda che lo ha portato qui. Stesso ordine della maschera di inserimento.
    if (hasAnamnesiStrutturataContent(nv.anamnesiStrutturata)) {
      const anamnesiCfg = parseAnamnesiConfig(prefs).generale;
      y = this.drawStructuredAnamnesi(
        doc, y, nv.anamnesiStrutturata!, anamnesiCfg.campi, anamnesiCfg.etichette,
      );
    } else {
      y = this.drawTextSection(doc, y, "Anamnesi", vis.prestazione);
    }

    y = this.drawTextSection(doc, y, "Motivo della visita", vis.problemaClinico);

    y = this.drawTextSection(doc, y, "Esame Obiettivo", vis.esameObiettivo);

    // Ogni esame con la sua fascia, come anamnesi ed esame obiettivo. C'e'
    // stato un titolo "Esami strumentali" che li raccoglieva, con i moduli
    // come sottotitoli sottolineati: il cardiologo l'ha fatto togliere l'11
    // settembre 2026 ("meglio evidenziare in grigio le singole voci").
    //
    // La pressione apre la serie, prima dell'elettrocardiogramma.
    y = this.drawPressioneArteriosa(doc, y, vis);
    y = this.drawEcg(doc, y, vis.ecg, vis.frequenzaCardiaca);
    y = this.drawEcocardiogramma(doc, y, vis.ecocardiogramma);
    y = this.drawTcCoronarica(
      doc, y, vis.tcCoronarica,
      Number(prefs?.sogliaCacSevera) === 400 ? 400 : SOGLIA_CAC_PREDEFINITA,
    );
    y = this.drawTestErgometrico(doc, y, vis.testErgometrico, patient);
    y = this.drawHolterEcg(doc, y, vis.holterEcg);
    y = this.drawHolterPressorio(doc, y, vis.holterPressorio);
    y = this.drawDopplerTsa(doc, y, vis.dopplerTsa);
    y = this.drawLaboratorio(doc, y, vis.laboratorio, patient);

    // Scompenso, fibrillazione atriale e rischio cardiovascolare restano sotto
    // un titolo solo, con i moduli come sottotitoli: sono i tre inquadramenti
    // che il cardiologo formula dopo aver letto gli esami. Qui la fascia per
    // voce non l'ha voluta ("lascia così", call dell'11 settembre 2026), e sta
    // ancora decidendo cosa ci debba entrare, per esempio la cardiopatia
    // ischemica. Il gruppo si apre da solo al primo che ha qualcosa da dire.
    const inquadramento = this.gruppo(doc, "Inquadramento clinico");
    y = this.drawScompenso(
      doc, y, vis.scompenso, vis.ecocardiogramma?.fe, patient, inquadramento,
      await this.fePrecedenti(patient.id, visit.id),
    );
    y = this.drawFibrillazioneAtriale(
      doc, y, vis.fibrillazioneAtriale, patient, vis.fattoriRischio,
      vis.pesoCorporeo, vis.laboratorio?.creatinina, inquadramento,
    );
    // La sintesi del rischio si stampa: e' il punto in cui il medico mette
    // insieme rischio calcolato e reperti di imaging, e le linee guida chiedono
    // che quell'integrazione resti documentata.
    //
    // Con essa esce ora anche la classe di rischio dichiarata e l'obiettivo
    // lipidico che ne discende: chiesto dal cardiologo perche' e' il dato che
    // il medico curante deve ritrovare per sapere se il paziente e' a bersaglio.
    // Il punteggio SCORE2 resta invece di supporto e fuori dal referto.
    y = this.drawRischioCv(
      doc, y, vis.categoriaRischioCv, vis.laboratorio, vis.sintesiRischio,
      inquadramento,
    );
    y = this.drawTextSection(doc, y, "Accertamenti", vis.accertamenti);
    y = this.drawTextSection(doc, y, "Conclusioni e Terapia", vis.terapiaSpecifica);

    // Le immagini chiudono il referto, dopo le conclusioni. Stavano prima, e
    // con quattro allegati da 55 mm la sezione che il curante e il paziente
    // cercano per prima finiva dietro una galleria, a pagina tre. Un allegato
    // sta in fondo: e' quello che significa allegato.
    if (options?.includeImages) await this.drawImages(doc, vis.immagini, y);

    // Niente blocco firma in calce al referto: luogo, data e riga per la firma
    // erano stati aggiunti sull'esempio dei referti ospedalieri, il cardiologo
    // li ha tolti. Il referto si chiude sulle conclusioni; chi lo firma lo
    // firma sul foglio stampato, e il nome del medico e' gia' in testa a ogni
    // pagina. Ricetta, certificato e richiesta di esame la firma la tengono:
    // senza, non varrebbero niente.
    try {
      this.finalizzaPagine(doc, patient, visit.dataVisita, doctor, fo);
      return doc.output("blob") as Blob;
    } finally { this.fCtx = null; }
  }

  // ─── RICHIESTA ESAME ──────────────────────────────────────────────────────
  static async generateRichiestaEsamePDF(
    patient: Patient, richiesta: RichiestaEsameComplementare, doctor: Doctor | null
  ): Promise<Blob> {
    const prefs = await PreferenceService.getPreferences();
    const fo: FooterVisibilityOptions = {
      showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
      showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
    };
    this.fCtx = { doctor, opts: fo };
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    try {
      let y = this.drawHeader(doc, "RICHIESTA DI ESAME", "Prescrizione di esame complementare", doctor, true, fo);
      y = this.drawPatientBlock(doc, patient, richiesta.dataRichiesta, y, "Data richiesta", { showDate: false, showSesso: false, showBirthDate: false });
      y += 2;
      y = this.heading(doc, y, "Si richiede");
      y = this.block(doc, richiesta.nome, ML + 1, y, PW - 2, undefined, {
        font: "helvetica", style: "bold", fontSize: 10.5, color: K0,
      });
      if (richiesta.note?.trim()) {
        y += 3;
        y = this.heading(doc, y, "Quesito diagnostico");
        y = this.block(doc, richiesta.note, ML + 1, y, PW - 2, undefined, {
          font: "helvetica", style: "normal", fontSize: 9.5, color: K30,
        });
      }
      await this.drawSignatureBlock(doc, doctor, y, richiesta.dataRichiesta);
      this.drawFooter(doc, doctor, fo);
      return doc.output("blob") as Blob;
    } finally {
      this.fCtx = null;
    }
  }

  // ─── CERTIFICATO ──────────────────────────────────────────────────────────
  static async generateCertificatoPDF(
    patient: Patient, certificato: CertificatoPaziente, doctor: Doctor | null
  ): Promise<Blob> {
    const prefs = await PreferenceService.getPreferences();
    const fo: FooterVisibilityOptions = {
      showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
      showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
    };
    this.fCtx = { doctor, opts: fo };
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    try {
      const tipoL: Record<CertificatoPaziente["tipo"], string> = {
        assenza_lavoro: "Assenza da lavoro", idoneita: "Idoneità", malattia: "Malattia", altro: "Altro",
      };
      let y = this.drawHeader(doc, "CERTIFICATO MEDICO", tipoL[certificato.tipo] || certificato.tipo, doctor, true, fo);
      y = this.drawPatientBlock(doc, patient, certificato.dataCertificato, y, "Data certificato", { showDate: false, showSesso: false, showBirthDate: false });
      y += 2;
      y = this.heading(doc, y, "Si certifica che");
      y = this.block(doc, certificato.descrizione || "", ML + 1, y, PW - 2, LH + 0.6, {
        font: "helvetica", style: "normal", fontSize: 10, color: K30,
      });
      await this.drawSignatureBlock(doc, doctor, y, certificato.dataCertificato);
      this.drawFooter(doc, doctor, fo);
      return doc.output("blob") as Blob;
    } finally {
      this.fCtx = null;
    }
  }

  // ─── RICETTA ──────────────────────────────────────────────────────────────
  static async generateRicettaPDF(
    patient: Patient, ricetta: RicettaPaziente, doctor: Doctor | null
  ): Promise<Blob> {
    const prefs = await PreferenceService.getPreferences();
    const fo: FooterVisibilityOptions = {
      showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
      showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
    };
    this.fCtx = { doctor, opts: fo };
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    try {
      let y = this.drawHeader(doc, "RICETTA MEDICA", "Ricetta bianca", doctor, true, fo);
      y = this.drawPatientBlock(doc, patient, ricetta.dataRicetta, y, "Data ricetta", { showDate: false, showSesso: false, showBirthDate: false });
      y += 2;
      y = this.heading(doc, y, "Prescrizione");

      const testoRicetta = getRicettaTesto(ricetta);
      if (testoRicetta.trim()) {
        y = this.block(doc, testoRicetta, ML + 1, y, PW - 2, LH + 0.6, {
          font: "helvetica", style: "normal", fontSize: 10.5, color: K30,
        });
      } else {
        doc.setFont("helvetica", "italic"); doc.setFontSize(9); this.tc(doc, K140);
        doc.text("Nessuna prescrizione indicata.", ML + 1, y + 4);
        y += 10;
      }

      await this.drawSignatureBlock(doc, doctor, y, ricetta.dataRicetta);
      this.drawFooter(doc, doctor, fo);
      return doc.output("blob") as Blob;
    } finally {
      this.fCtx = null;
    }
  }
}