import jsPDF from "jspdf";
import {
  Patient, Visit, Doctor,
  RichiestaEsameComplementare,
  CertificatoPaziente,
  RicettaPaziente,
} from "../types/Storage";
import { DoctorService, PreferenceService } from "./OfflineServices";
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
import { calculateAge } from "../utils/dateUtils";
import { titoloMedico } from "../utils/doctorProfile";
import { titoloReferto } from "../utils/titoloReferto";
import {
  calcolaBmi,
  classeBmi,
  conVirgola,
  eAdulto,
  ETICHETTA_CLASSE_BMI,
  haSecondaMisura,
  posizioni,
  valutaOrtostatismo,
} from "../utils/parametriVitali";

// ─── Layout ──────────────────────────────────────────────────────────────────
//
// Impaginazione presa da Corioli Cardiologia, dove il cardiologo l'ha rivista
// sui referti stampati: carta intestata a due colonne, titolo del documento
// su fascia grigia, una fascia per ogni sezione, piede con la numerazione.
//
// Margini a 18 mm: i millimetri in piu' rispetto ai 15 di prima sono
// tolleranza di stampa, una stampa un po' fuori centro mangia bianco e non
// testo.
const ML = 18;
const MR = 192;
const PW = MR - ML;   // 174 mm
/** Spaziatura fra le lettere del titolo del documento, in millimetri. */
const SPAZIATURA_TITOLO = 0.7;
const PAGE_H = 297;
const FOOT_Y = PAGE_H - 14;
const LH = 4.8;
/** Interlinea della prosa clinica in corpo 10,5. */
const LH_PROSA = 5.2;
/** Dal filo del contenuto alla linea di base della prima riga di prosa. */
const PRIMA_RIGA_PROSA = 3.9;
/** Altezza della fascia grigia dei titoli di sezione. */
const FASCIA_H = 5.6;
/** Aria fra la fascia e il contenuto della sezione. */
const ARIA_SOTTO_FASCIA = 2.5;
/** Dove riparte il contenuto sulle pagine dopo la prima (sopra c'e' la riga del paziente). */
const Y_PAGINE_SEGUENTI = 22;

// ─── B&W palette ─────────────────────────────────────────────────────────────
// Il referto si stampa in bianco e nero: solo neri, grigi e filetti.
const K0 = [0, 0, 0] as const;
const K30: [number, number, number] = [30, 30, 30];
const K80: [number, number, number] = [80, 80, 80];
const K140: [number, number, number] = [140, 140, 140];
const K200: [number, number, number] = [200, 200, 200];
const K235: [number, number, number] = [235, 235, 235];

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
 * I caratteri tipografici che WinAnsi colloca nella fascia 0x80-0x9F: in
 * Unicode stanno sopra 0xFF ma il font li sa scrivere (trattini, virgolette).
 */
const WINANSI_ALTI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Simboli che il font standard di jsPDF non sa scrivere, con il loro sostituto. */
const SIMBOLI: Record<string, string> = {
  "\u2265": ">=", "\u2264": "<=", "\u2260": "!=", "\u2212": "-",
  "\u2081": "1", "\u2082": "2", "\u2083": "3", "\u00b2": "2",
  "\u2192": "->", "\u2190": "<-", "\u00a0": " ", "\u0394": "D",
};

/**
 * Prepara il testo per il font standard di jsPDF.
 *
 * Le vocali accentate passano cosi' come sono: stanno nella codifica WinAnsi
 * e Helvetica le disegna. Prima venivano cambiate in apostrofo ("attivita'",
 * "Obesita' I") credendo che il font non le sapesse scrivere; Corioli
 * Cardiologia l'aveva gia' corretto a settembre 2026.
 *
 * Un carattere fuori dalla tabella farebbe passare jsPDF a UTF-16 per tutta
 * la stringa, con la riga illeggibile e mandata a capo male: si prova la
 * scomposizione Unicode e, se non resta niente, un punto interrogativo.
 */
export function san(t: string): string {
  if (!t) return "";
  // Testo UTF-8 riletto come Latin-1 ("Ã¨" al posto di "è"), per esempio da
  // un CSV importato con la codifica sbagliata: si ricompone la lettera.
  t = t.replace(/\u00c3([\u00a0\u00a8\u00a9\u00ac\u00b2\u00b9])/g, (_, c: string) =>
    String.fromCharCode(c.charCodeAt(0) + 0x40),
  );
  for (const [simbolo, ascii] of Object.entries(SIMBOLI)) {
    if (t.includes(simbolo)) t = t.split(simbolo).join(ascii);
  }
  let r = "";
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
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

/** Una cella dell'anagrafica: etichetta piccola sopra, valore sotto. */
type CellaAnagrafica = { label: string; value: string; forte?: boolean; span?: number };

// ─────────────────────────────────────────────────────────────────────────────
export class PdfService {

  private static dc(d: jsPDF, c: readonly number[]) { d.setDrawColor(c[0], c[1], c[2]); }
  private static tc(d: jsPDF, c: readonly number[]) { d.setTextColor(c[0], c[1], c[2]); }

  // ── page break ───────────────────────────────────────────────────────────────
  /**
   * Il piede non si disegna qui ma alla fine (`finalizzaPagine`), quando si
   * sa quante pagine sono: "Pagina 2 di 3" richiede il totale.
   */
  private static pb(doc: jsPDF, y: number, need = 30): number {
    if (y + need > FOOT_Y - 8) {
      doc.addPage();
      return Y_PAGINE_SEGUENTI;
    }
    return y;
  }

  // ── multiline text block ─────────────────────────────────────────────────────
  /** textStyle: ripristina font/size/colore prima di ogni riga (necessario dopo salto pagina). */
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
    const applica = () => {
      if (!textStyle) return;
      doc.setFont(textStyle.font ?? "helvetica", textStyle.style ?? "normal");
      if (textStyle.fontSize != null) doc.setFontSize(textStyle.fontSize);
      if (textStyle.color) this.tc(doc, textStyle.color);
    };
    // Il carattere si imposta prima di mandare a capo: `splitTextToSize`
    // misura con il font corrente, e con un altro le righe sbordano.
    applica();
    const lines: string[] = doc.splitTextToSize(san(text), maxW);
    for (const line of lines) {
      y = this.pb(doc, y, lh + 1);
      applica();
      doc.text(line, x, y);
      y += lh;
    }
    return y;
  }

  /** Prosa clinica del referto: corpo 10,5 in nero, come su Corioli Cardiologia. */
  private static prosa(doc: jsPDF, text: string, y: number): number {
    return this.block(doc, text, ML, y + PRIMA_RIGA_PROSA, PW, LH_PROSA, {
      font: "helvetica", style: "normal", fontSize: 10.5, color: K0,
    });
  }

  // ── horizontal rule ──────────────────────────────────────────────────────────
  private static rule(doc: jsPDF, y: number, x1 = ML, x2 = MR, lw = 0.2) {
    this.dc(doc, K200); doc.setLineWidth(lw); doc.line(x1, y, x2, y);
  }

  /**
   * Titolo di sezione su fascia grigio chiaro da margine a margine, uguale per
   * tutte le sezioni: prosa e dati pesano lo stesso. `need` e' lo spazio che
   * il titolo si porta dietro, perche' non resti solo in fondo alla pagina.
   */
  private static sezione(doc: jsPDF, y: number, titolo: string, need = 22): number {
    y = this.pb(doc, y, need);
    doc.setFillColor(...K235);
    doc.rect(ML, y, PW, FASCIA_H, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.6); this.tc(doc, K0);
    doc.text(san(titolo).toUpperCase(), ML + 2, y + 3.9, { charSpace: 0.35 });
    return y + FASCIA_H + ARIA_SOTTO_FASCIA;
  }

  /**
   * Parametri in colonne: un titoletto per colonna e righe "Etichetta valore".
   * Le righe vuote ("-", "0") non si stampano; una colonna vuota nemmeno; se
   * non resta niente la sezione non c'e'.
   */
  private static drawInquadramentoGrid(
    doc: jsPDF, y: number, title: string,
    columns: { header: string; items: { label: string; value: string }[] }[],
  ): number {
    const cols = columns
      .map((c) => ({
        header: c.header,
        items: c.items.filter((it) => !isInquadramentoValueEmpty(it.value)),
      }))
      .filter((c) => c.items.length > 0);
    if (cols.length === 0) return y;

    const righe = Math.max(...cols.map((c) => c.items.length));
    y = this.sezione(doc, y, title, FASCIA_H + ARIA_SOTTO_FASCIA + 8 + righe * LH);

    const GAP = 6;
    const colW = (PW - GAP * (cols.length - 1)) / cols.length;
    let maxY = y;

    for (let c = 0; c < cols.length; c++) {
      const cx = ML + c * (colW + GAP);
      let cy = y + 3.2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); this.tc(doc, K80);
      doc.text(san(cols[c].header), cx, cy);
      this.rule(doc, cy + 1.3, cx, cx + colW, 0.2);
      cy += 5.8;

      for (const item of cols[c].items) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); this.tc(doc, K80);
        const lbl = san(item.label);
        doc.text(lbl, cx, cy);
        const lblW = Math.max(doc.getTextWidth(lbl) + 2.5, 15);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); this.tc(doc, K0);
        const vlines: string[] = doc.splitTextToSize(san(item.value), colW - lblW);
        for (const line of vlines) {
          doc.text(line, cx + lblW, cy);
          cy += LH;
        }
      }
      maxY = Math.max(maxY, cy);
    }

    return maxY + 1.5;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOCUMENT HEADER
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Carta intestata: a sinistra chi firma (titolo, nome, specializzazione), a
   * destra dove lo si trova (studio, indirizzo, telefono ed email, partita
   * IVA). Sotto un filetto doppio e il titolo del documento su fascia grigia.
   * I recapiti stavano nel piede in corpo 6,5: e' il primo posto dove si
   * cerca chi ha scritto il referto, non l'ultimo.
   */
  private static drawHeader(
    doc: jsPDF, title: string, subtitle: string,
    doctor: Doctor | null, vis?: FooterVisibilityOptions,
  ): number {
    let y = 17;

    const nome = doctor
      ? `${titoloMedico(doctor)} ${doctor.nome} ${doctor.cognome}`.trim()
      : "Studio medico";
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); this.tc(doc, K0);
    doc.text(san(nome), ML, y);
    const specializzazione = doctor?.specializzazione?.trim();
    if (specializzazione) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); this.tc(doc, K80);
      doc.text(san(specializzazione), ML, y + 4.6);
    }

    const recapiti: string[] = [];
    const amb = doctor?.ambulatori?.find((x) => x.isPrimario) ?? doctor?.ambulatori?.[0];
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
    if (contatti.length) recapiti.push(contatti.join("  -  "));
    // La partita IVA chiude i recapiti, su una riga sua.
    const partitaIva = doctor?.partitaIva?.trim();
    if (partitaIva) recapiti.push(`P.IVA ${san(partitaIva)}`);

    // Corpo 8: sotto, sul foglio stampato non si legge.
    const RIGA_RECAPITI = 3.7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K80);
    recapiti.forEach((riga, i) => {
      doc.text(riga, MR, y - 2.4 + i * RIGA_RECAPITI, { align: "right" });
    });

    y = Math.max(
      y + (specializzazione ? 8 : 4),
      y - 2.4 + recapiti.length * RIGA_RECAPITI + 2.6,
    );

    // Filetto doppio, grosso e sottile: separa la carta intestata dal
    // documento, e in bianco e nero e' il modo di dare peso a una separazione.
    this.dc(doc, K0); doc.setLineWidth(0.7);
    doc.line(ML, y, MR, y);
    this.rule(doc, y + 1.1, ML, MR, 0.15);
    y += 4;

    // Il titolo su fascia grigia, centrato misurando la larghezza a mano:
    // `align: "center"` di jsPDF non conta la spaziatura fra le lettere e il
    // titolo uscirebbe spostato a destra.
    const TITOLO_H = 7.6;
    doc.setFillColor(...K235);
    doc.rect(ML, y, PW, TITOLO_H, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); this.tc(doc, K0);
    const titolo = san(title).toUpperCase();
    const larghezza =
      doc.getTextWidth(titolo) + SPAZIATURA_TITOLO * Math.max(titolo.length - 1, 0);
    doc.text(titolo, 105 - larghezza / 2, y + 5.2, { charSpace: SPAZIATURA_TITOLO });
    y += TITOLO_H;
    if (subtitle) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); this.tc(doc, K80);
      doc.text(san(subtitle), 105, y + 4.4, { align: "center" });
      y += 4.4;
    }
    return y + 4.5;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATIENT BLOCK
  // ─────────────────────────────────────────────────────────────────────────────
  /** "ROSSI Mario": cognome in maiuscolo, come nei referti ospedalieri. */
  private static nomePaziente(patient: Patient): string {
    const cognome = (patient.cognome ?? "").trim();
    const nome = (patient.nome ?? "").trim();
    return [cognome.toUpperCase(), nome].filter(Boolean).join(" ");
  }

  /**
   * Anagrafica a celle: quattro per riga, etichetta piccola sopra e valore
   * sotto, il nome in grassetto. Prima era una lista "Etichetta:valore" su due
   * colonne, con le etichette attaccate ai valori.
   */
  private static drawPatientBlock(
    doc: jsPDF, patient: Patient, visitDate: string,
    y: number, dateLabel = "Data visita", opts?: { showDate?: boolean; showSesso?: boolean; showBirthDate?: boolean },
  ): number {
    const eta = patient.dataNascita ? calculateAge(patient.dataNascita, visitDate || undefined) : null;
    const nascita = patient.dataNascita
      ? `${fd(patient.dataNascita)}${eta != null ? `  (${eta} anni)` : ""}`
      : "";
    const nome = this.nomePaziente(patient) || "-";
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    // Il nome prende due celle solo se in una non ci sta.
    const spanNome = doc.getTextWidth(san(nome)) > PW / 4 - 4 ? 2 : 1;

    const celle: CellaAnagrafica[] = [
      { label: "Paziente", value: nome, forte: true, span: spanNome },
      ...(opts?.showBirthDate === false ? [] : [{ label: "Data di nascita", value: nascita }]),
      ...(opts?.showSesso !== false && patient.sesso
        ? [{ label: "Sesso", value: patient.sesso === "F" ? "Femminile" : "Maschile" }]
        : []),
      ...(opts?.showDate === false ? [] : [{ label: dateLabel, value: fd(visitDate) }]),
      ...(patient.codiceFiscale?.trim()
        ? [{ label: "Codice fiscale", value: patient.codiceFiscale.toUpperCase(), span: 1 }]
        : []),
    ].filter((c) => c.value && c.value !== "-");

    // Una riga sola quando ci sta: ogni cella larga quanto il suo contenuto
    // piu' un po' d'aria, e lo spazio che avanza diviso fra tutte. Con la
    // griglia fissa a quattro colonne il codice fiscale finiva da solo su una
    // seconda riga.
    const ARIA_CELLA = 6;
    const larghezze = celle.map((c) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      const etichetta = doc.getTextWidth(san(c.label));
      doc.setFont("helvetica", c.forte ? "bold" : "normal"); doc.setFontSize(c.forte ? 10 : 9.5);
      return Math.max(etichetta, doc.getTextWidth(san(c.value))) + ARIA_CELLA;
    });
    const totale = larghezze.reduce((a, b) => a + b, 0);
    let rigaY = y + 2.6;
    if (totale <= PW) {
      const extra = (PW - totale) / Math.max(celle.length - 1, 1);
      let x = ML;
      celle.forEach((cella, i) => {
        this.cellaAnagrafica(doc, cella, x, rigaY, larghezze[i]);
        x += larghezze[i] + extra;
      });
    } else {
      const COLONNE = 4;
      const cellaW = PW / COLONNE;
      let col = 0;
      for (const cella of celle) {
        const span = Math.min(cella.span ?? 1, COLONNE);
        if (col + span > COLONNE) {
          col = 0;
          rigaY += 10.5;
        }
        this.cellaAnagrafica(doc, cella, ML + col * cellaW, rigaY, cellaW * span);
        col += span;
      }
    }
    y = rigaY + 7.4;
    this.rule(doc, y, ML, MR, 0.2);
    return y + 4;
  }

  /** Una cella dell'anagrafica: etichetta piccola in grigio, valore sotto. */
  private static cellaAnagrafica(
    doc: jsPDF, cella: CellaAnagrafica, x: number, y: number, larghezza: number,
  ) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K80);
    doc.text(san(cella.label), x, y);
    doc.setFont("helvetica", cella.forte ? "bold" : "normal");
    doc.setFontSize(cella.forte ? 10 : 9.5); this.tc(doc, K0);
    const righe: string[] = doc.splitTextToSize(san(cella.value), larghezza - 2);
    doc.text(righe[0] ?? "", x, y + 4.6);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEXT SECTION
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawTextSection(
    doc: jsPDF, y: number, title: string,
    content: string | undefined | null, note?: string
  ): number {
    if (!content?.trim()) return y;
    // Il titolo si porta dietro due righe di testo: con una sola potrebbe
    // aprire in fondo alla pagina con un rigo orfano.
    y = this.sezione(
      doc, y, title,
      FASCIA_H + ARIA_SOTTO_FASCIA + PRIMA_RIGA_PROSA + 2 * LH_PROSA + 1,
    );
    y = this.prosa(doc, content, y);
    if (note) {
      y += 1.5;
      y = this.block(doc, note, ML + 1, y, PW - 2, 4, {
        font: "helvetica", style: "italic", fontSize: 8, color: K140,
      });
    }
    // L'aria prima della fascia successiva e' l'interlinea dell'ultima riga.
    return y + 1.5;
  }

  /**
   * Anamnesi strutturata: una fascia "Anamnesi" e una riga per ciascuna
   * categoria valorizzata, con l'etichetta in grassetto. Salta le vuote.
   */
  private static drawStructuredAnamnesi(
    doc: jsPDF, y: number, as: NonNullable<Visit["anamnesiStrutturata"]>,
    order?: string[],
    etichette?: Record<string, string>
  ): number {
    // Ordine configurato; le sezioni con dato ma non incluse nell'ordine
    // vengono comunque stampate in coda (nessuna perdita di dati).
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

    y = this.sezione(doc, y, "Anamnesi", FASCIA_H + ARIA_SOTTO_FASCIA + PRIMA_RIGA_PROSA + 2 * LH_PROSA);
    y += PRIMA_RIGA_PROSA;

    for (const r of rows) {
      const lbl = san(r.label) + ": ";
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
      const lblW = doc.getTextWidth(lbl);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
      const valLines: string[] = doc.splitTextToSize(san(r.value), PW - lblW);

      valLines.forEach((line, i) => {
        y = this.pb(doc, y, LH_PROSA + 1);
        if (i === 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); this.tc(doc, K0);
          doc.text(lbl, ML, y);
        }
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); this.tc(doc, K0);
        doc.text(line, ML + lblW, y);
        y += LH_PROSA;
      });
      y += 0.8;
    }
    return y + 0.7;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IMAGE GALLERY
  // ─────────────────────────────────────────────────────────────────────────────
  private static toJpeg(url: string): Promise<string> {
    return new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
        res(c.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = () => rej(new Error("fail")); img.src = url;
    });
  }

  private static async drawImages(doc: jsPDF, imgs: string[] | undefined, y: number): Promise<number> {
    if (!imgs?.length) return y;
    const COLS = 2, GAP = 4, tW = (PW - GAP) / COLS, tH = 55;
    y = this.sezione(doc, y + 2, "Immagini allegate", FASCIA_H + ARIA_SOTTO_FASCIA + tH + 6);
    for (let i = 0; i < imgs.length; i += COLS) {
      y = this.pb(doc, y, tH + 6);
      const row = imgs.slice(i, i + COLS);
      const conv = await Promise.all(row.map(im => this.toJpeg(im).catch(() => null)));
      conv.forEach((img, col) => {
        const x = ML + col * (tW + GAP);
        this.dc(doc, K200); doc.setLineWidth(0.2); doc.rect(x, y, tW, tH, "S");
        if (img) {
          try {
            const p = (doc as unknown as { getImageProperties: (i: string) => { width: number; height: number } }).getImageProperties(img);
            const r = p.width / p.height;
            let w = tW - 3, h = w / r;
            if (h > tH - 3) { h = tH - 3; w = h * r; }
            doc.addImage(img, "JPEG", x + (tW - w) / 2, y + (tH - h) / 2, w, h);
          } catch {
            doc.setFont("helvetica", "italic"); doc.setFontSize(8); this.tc(doc, K140);
            doc.text("Immagine non disponibile", x + tW / 2, y + tH / 2, { align: "center" });
          }
        }
      });
      y += tH + 4;
    }
    return y + 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FOOTER E NUMERAZIONE
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Piede: "Creato con Corioli" a sinistra e "Pagina x di y" a destra, in
   * corpo 8. I recapiti sono saliti nella carta intestata, dove si cercano.
   */
  private static drawFooter(doc: jsPDF, pagina: { numero: number; totale: number }) {
    this.rule(doc, FOOT_Y, ML, MR, 0.2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K140);
    doc.text("Creato con Corioli", ML, FOOT_Y + 4.5);
    this.tc(doc, K80);
    doc.text(`Pagina ${pagina.numero} di ${pagina.totale}`, MR, FOOT_Y + 4.5, { align: "right" });
  }

  /**
   * Chiude il documento: numera le pagine e, dalla seconda, ripete in testa
   * chi e' il paziente e chi ha scritto il documento. Un foglio che si stacca
   * dalla graffetta, o viene fotocopiato da solo, resta attribuibile.
   */
  private static finalizzaPagine(
    doc: jsPDF, patient: Patient, data: string, doctor: Doctor | null,
  ): void {
    const totale = doc.getNumberOfPages();
    const autore = doctor
      ? san(`${titoloMedico(doctor)} ${doctor.nome} ${doctor.cognome}`.trim())
      : "";
    const nato =
      patient.sesso === "F" ? "nata" : patient.sesso === "M" ? "nato" : "nato/a";
    const identita = [
      san(this.nomePaziente(patient)),
      patient.dataNascita ? `${nato} il ${fd(patient.dataNascita)}` : "",
      data ? `del ${fd(data)}` : "",
    ].filter(Boolean).join("  -  ");

    for (let n = 1; n <= totale; n++) {
      doc.setPage(n);
      if (n > 1) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K80);
        doc.text(identita, ML, 12);
        if (autore) doc.text(autore, MR, 12, { align: "right" });
        this.rule(doc, 14.5, ML, MR, 0.2);
      }
      this.drawFooter(doc, { numero: n, totale });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SIGNATURE BLOCK — firma del medico in calce, a destra
  // ─────────────────────────────────────────────────────────────────────────────
  private static async drawSignatureBlock(
    doc: jsPDF, doctor: Doctor | null, y: number,
  ): Promise<number> {
    const sigW = 48; // mm
    const sigH = sigW * (SIGNATURE_STAMP_PDF_LAYOUT_H / SIGNATURE_STAMP_PDF_LAYOUT_W);
    const hasImg = Boolean(doctor?.signatureStampImage);

    y = this.pb(doc, y, sigH + 30);
    y += 10;
    const lineLeft = MR - 62;
    let cy = y;

    if (hasImg) {
      try {
        const img = await normalizeSignatureStampImage(doctor!.signatureStampImage!);
        const fmt = signatureStampPdfFormat(img);
        doc.addImage(img, fmt, MR - sigW, cy, sigW, sigH);
        cy += sigH + 2;
      } catch {
        cy += 12;
      }
    } else {
      cy += 12;
    }

    this.dc(doc, K30); doc.setLineWidth(0.4); doc.line(lineLeft, cy, MR, cy);
    cy += 4.5;

    const rawName = san(`${doctor?.nome || ""} ${doctor?.cognome || ""}`.trim());
    const name = rawName ? `${titoloMedico(doctor)} ${rawName}` : "_______________________";
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

  private static async opzioniPiede(): Promise<{ prefs: Record<string, unknown> | null; fo: FooterVisibilityOptions }> {
    const prefs = (await PreferenceService.getPreferences()) as Record<string, unknown> | null;
    return {
      prefs,
      fo: {
        showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
        showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
      },
    };
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

    const [doctor, { prefs, fo }] = await Promise.all([
      DoctorService.getDoctor(),
      this.opzioniPiede(),
    ]);
    const doc = new jsPDF({ format: "a4" });

    // Il titolo dice che visita e': dalla specializzazione del medico
    // ("VISITA INTERNISTICA"), o quello scritto nelle impostazioni.
    const titolo = titoloReferto(prefs?.titoloReferto, doctor?.specializzazione);
    let y = this.drawHeader(doc, titolo, "", doctor, fo);
    y = this.drawPatientBlock(doc, patient, visit.dataVisita, y, "Data visita");

    // Pressione con la sua posizione. Con una sola misura la posizione si
    // scrive solo se e' "orto" (quella normale e' in clino); con due sempre,
    // se no non si capisce il confronto.
    const altezzaCm = patient?.altezza ?? 0;
    const peso = Number(vis.pesoCorporeo) || 0;
    const bmiNum = calcolaBmi(peso, altezzaCm);
    const conSeconda = haSecondaMisura(vis);
    const { prima, seconda } = posizioni(vis);
    const posizione1 = conSeconda || prima === "orto" ? ` (${prima})` : "";
    // L'eta' alla data della visita: e' quella che decide i giudizi.
    const eta = patient?.dataNascita ? calculateAge(patient.dataNascita, visit.dataVisita) : null;
    const vita = Number(vis.circonferenzaVita) || 0;
    const colonne: { header: string; items: { label: string; value: string }[] }[] = [
      {
        header: "Parametri vitali",
        items: [
          { label: "P.A.", value: v(vis.pressioneArteriosa ? `${vis.pressioneArteriosa} mmHg${posizione1}` : "") },
          { label: "F.C.", value: v(vis.frequenzaCardiaca ? `${vis.frequenzaCardiaca} bpm` : "") },
          ...(conSeconda
            ? [
                {
                  label: "P.A. 2ª",
                  value: v(vis.pressioneArteriosa2 ? `${vis.pressioneArteriosa2} mmHg (${seconda})` : ""),
                },
                { label: "F.C. 2ª", value: v(vis.frequenzaCardiaca2 ? `${vis.frequenzaCardiaca2} bpm` : "") },
              ]
            : []),
        ],
      },
    ];
    // La prova ortostatica: la variazione in piedi e l'esito; le misure
    // stanno gia' nella colonna accanto.
    const esito = valutaOrtostatismo(vis, eta);
    if (esito) {
      const segnato = (n: number) => (n > 0 ? `+${n}` : String(n));
      colonne.push({
        header: "Prova ortostatica",
        items: [
          {
            label: "In orto",
            value: `${segnato(esito.deltaSistolica)}/${segnato(esito.deltaDiastolica)} mmHg`,
          },
          ...(esito.deltaFc != null
            ? [{ label: "F.C.", value: `${segnato(esito.deltaFc)} bpm` }]
            : []),
          {
            label: "Esito",
            value: esito.ipotensioneOrtostatica
              ? "ipotensione ortostatica"
              : esito.tachicardiaOrtostatica
                ? "tachicardia in ortostatismo"
                : "nessun calo significativo",
          },
        ],
      });
    }
    colonne.push({
      header: "Antropometria",
      items: [
        { label: "Peso", value: peso > 0 ? `${conVirgola(peso, Number.isInteger(peso) ? 0 : 1)} kg` : "-" },
        { label: "Altezza", value: altezzaCm > 0 ? `${altezzaCm} cm` : "-" },
        {
          label: "BMI",
          // La classe OMS solo per l'adulto: sotto i 18 anni il BMI si legge
          // sui percentili.
          value:
            bmiNum == null
              ? "-"
              : eAdulto(eta)
                ? `${conVirgola(bmiNum)} (${ETICHETTA_CLASSE_BMI[classeBmi(bmiNum)].toLowerCase().replace(/ i+$/, (r) => r.toUpperCase())})`
                : conVirgola(bmiNum),
        },
        { label: "Vita", value: vita > 0 ? `${vita} cm` : "-" },
      ],
    });
    y = this.drawInquadramentoGrid(doc, y, "Parametri", colonne);

    y = this.drawTextSection(doc, y, "Descrizione del problema", vis.problemaClinico);

    if (hasAnamnesiStrutturataContent(nv.anamnesiStrutturata)) {
      const anamnesiCfg = parseAnamnesiConfig(prefs).generale;
      y = this.drawStructuredAnamnesi(
        doc, y, nv.anamnesiStrutturata!, anamnesiCfg.campi, anamnesiCfg.etichette,
      );
    } else {
      y = this.drawTextSection(doc, y, "Anamnesi", vis.prestazione);
    }

    y = this.drawTextSection(doc, y, "Esame obiettivo", vis.esameObiettivo);
    y = this.drawTextSection(doc, y, "Accertamenti", vis.accertamenti);
    y = this.drawTextSection(doc, y, "Conclusioni e terapia", vis.terapiaSpecifica);

    // La firma del medico in calce, se l'ha caricata e non l'ha spenta nelle
    // impostazioni; senza immagine nessun blocco firma vuoto. Viene prima
    // degli allegati: chiude il referto, le immagini sono in appendice.
    if (doctor?.signatureStampImage && prefs?.firmaSulReferto !== false) {
      y = await this.drawSignatureBlock(doc, doctor, y);
    }
    if (options?.includeImages) await this.drawImages(doc, vis.immagini, y);

    this.finalizzaPagine(doc, patient, visit.dataVisita, doctor);
    return doc.output("blob") as Blob;
  }

  // ─── RICHIESTA ESAME ──────────────────────────────────────────────────────
  static async generateRichiestaEsamePDF(
    patient: Patient, richiesta: RichiestaEsameComplementare, doctor: Doctor | null
  ): Promise<Blob> {
    const { fo } = await this.opzioniPiede();
    const doc = new jsPDF({ format: "a4" });
    let y = this.drawHeader(doc, "Richiesta di esame", "", doctor, fo);
    y = this.drawPatientBlock(doc, patient, richiesta.dataRichiesta, y, "Data", { showSesso: false });
    y = this.sezione(doc, y, "Si richiede");
    y = this.block(doc, richiesta.nome, ML, y + PRIMA_RIGA_PROSA, PW, LH_PROSA, {
      font: "helvetica", style: "bold", fontSize: 11, color: K0,
    });
    if (richiesta.note?.trim()) {
      y = this.drawTextSection(doc, y + 1.5, "Quesito diagnostico", richiesta.note);
    }
    await this.drawSignatureBlock(doc, doctor, y);
    this.finalizzaPagine(doc, patient, richiesta.dataRichiesta, doctor);
    return doc.output("blob") as Blob;
  }

  // ─── CERTIFICATO ──────────────────────────────────────────────────────────
  static async generateCertificatoPDF(
    patient: Patient, certificato: CertificatoPaziente, doctor: Doctor | null
  ): Promise<Blob> {
    const { fo } = await this.opzioniPiede();
    const doc = new jsPDF({ format: "a4" });
    const tipoL: Record<CertificatoPaziente["tipo"], string> = {
      assenza_lavoro: "Assenza dal lavoro", idoneita: "Idoneità", malattia: "Malattia", altro: "",
    };
    let y = this.drawHeader(doc, "Certificato medico", tipoL[certificato.tipo] ?? "", doctor, fo);
    y = this.drawPatientBlock(doc, patient, certificato.dataCertificato, y, "Data", { showSesso: false });
    y = this.sezione(doc, y, "Si certifica che");
    y = this.prosa(doc, certificato.descrizione || "", y);
    await this.drawSignatureBlock(doc, doctor, y);
    this.finalizzaPagine(doc, patient, certificato.dataCertificato, doctor);
    return doc.output("blob") as Blob;
  }

  // ─── RICETTA ──────────────────────────────────────────────────────────────
  static async generateRicettaPDF(
    patient: Patient, ricetta: RicettaPaziente, doctor: Doctor | null
  ): Promise<Blob> {
    const { fo } = await this.opzioniPiede();
    const doc = new jsPDF({ format: "a4" });
    // Il promemoria della terapia non e' una ricetta: il titolo lo dice.
    const titoloRicetta = ricetta.tipo === "promemoria" ? "Promemoria della terapia" : "Ricetta medica";
    let y = this.drawHeader(doc, titoloRicetta, "", doctor, fo);
    y = this.drawPatientBlock(doc, patient, ricetta.dataRicetta, y, "Data", { showSesso: false });
    y = this.sezione(doc, y, "Prescrizione");

    const testoRicetta = getRicettaTesto(ricetta);
    if (testoRicetta.trim()) {
      y = this.prosa(doc, testoRicetta, y);
    } else {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); this.tc(doc, K140);
      doc.text("Nessuna prescrizione indicata.", ML, y + PRIMA_RIGA_PROSA);
      y += 10;
    }

    await this.drawSignatureBlock(doc, doctor, y);
    this.finalizzaPagine(doc, patient, ricetta.dataRicetta, doctor);
    return doc.output("blob") as Blob;
  }
}
