/**
 * Il grassetto nei campi del referto.
 *
 * Il testo della visita resta **testo semplice**, con il risalto segnato come
 * nei messaggi (`**cosi'**`): e' cio' che viene salvato, e il PDF lo stampa in
 * grassetto. Nel campo, pero', i marcatori non si devono vedere — il 22
 * settembre 2026 la prima versione li lasciava a schermo e sembrava un errore.
 * Il campo e' quindi un'area di testo modificabile che mostra il grassetto vero,
 * e queste funzioni fanno la conversione nei due sensi:
 *
 * - `testoInHtml` per riempire il campo partendo dal testo salvato;
 * - `testoDaiNodi` per tornare al testo salvato leggendo quello che c'e' nel
 *   campo.
 *
 * Il disegno del grassetto sul foglio sta in `PdfService`.
 */

/** Il marcatore del grassetto: `**testo**`. */
export const MARCATORE_GRASSETTO = "**";

const LUNGHEZZA = MARCATORE_GRASSETTO.length;

/** Testo nuovo e selezione da rimettere nel campo dopo l'operazione. */
export interface EsitoGrassetto {
  testo: string;
  inizio: number;
  fine: number;
}

/**
 * Mette (o toglie) il grassetto sul tratto selezionato.
 *
 * Senza selezione apre e chiude i marcatori e lascia il cursore in mezzo, cosi'
 * si puo' premere il tasto e continuare a scrivere in grassetto. Con una
 * selezione gia' in grassetto li toglie, che e' come si comporta il tasto
 * grassetto di qualunque editor: premuto due volte torna indietro.
 */
export function applicaGrassetto(
  testo: string,
  inizio: number,
  fine: number,
): EsitoGrassetto {
  const prima = testo.slice(0, inizio);
  const dopo = testo.slice(fine);
  const selezione = testo.slice(inizio, fine);

  if (!selezione) {
    return {
      testo: `${prima}${MARCATORE_GRASSETTO}${MARCATORE_GRASSETTO}${dopo}`,
      inizio: inizio + LUNGHEZZA,
      fine: inizio + LUNGHEZZA,
    };
  }

  // Selezione che si porta dentro i marcatori: "**cosi'**" selezionato tutto.
  if (
    selezione.startsWith(MARCATORE_GRASSETTO) &&
    selezione.endsWith(MARCATORE_GRASSETTO) &&
    selezione.length > 2 * LUNGHEZZA
  ) {
    const nudo = selezione.slice(LUNGHEZZA, -LUNGHEZZA);
    return { testo: `${prima}${nudo}${dopo}`, inizio, fine: inizio + nudo.length };
  }

  // Selezione del solo testo, con i marcatori appena fuori: "**|cosi'|**".
  if (prima.endsWith(MARCATORE_GRASSETTO) && dopo.startsWith(MARCATORE_GRASSETTO)) {
    const primaNuda = prima.slice(0, -LUNGHEZZA);
    return {
      testo: `${primaNuda}${selezione}${dopo.slice(LUNGHEZZA)}`,
      inizio: primaNuda.length,
      fine: primaNuda.length + selezione.length,
    };
  }

  // Gli spazi ai bordi restano fuori dai marcatori: selezionando con un doppio
  // clic si prende spesso anche lo spazio dopo la parola, e "**parola **"
  // stamperebbe in grassetto anche quello.
  const guidaIniziale = selezione.length - selezione.trimStart().length;
  const guidaFinale = selezione.length - selezione.trimEnd().length;
  const nucleo = selezione.slice(guidaIniziale, selezione.length - guidaFinale);
  if (!nucleo) {
    return { testo, inizio, fine };
  }
  const apertura = `${prima}${selezione.slice(0, guidaIniziale)}${MARCATORE_GRASSETTO}`;
  return {
    testo: `${apertura}${nucleo}${MARCATORE_GRASSETTO}${selezione.slice(
      selezione.length - guidaFinale,
    )}${dopo}`,
    inizio: apertura.length,
    fine: apertura.length + nucleo.length,
  };
}

/**
 * Il testo come si legge a schermo, senza i marcatori.
 *
 * Serve dove il referto si mostra come testo semplice — le anteprime nello
 * storico delle visite — e gli asterischi sarebbero solo rumore: il grassetto
 * si vede sul foglio, non nell'estratto di due righe.
 */
export function senzaMarcatori(testo: string | undefined | null): string {
  if (!testo) return "";
  return testo.split(MARCATORE_GRASSETTO).join("");
}

/**
 * Un nodo come lo legge `testoDaiNodi`.
 *
 * E' la parte di `Node` che serve davvero: cosi' la funzione si puo' provare
 * con oggetti semplici, senza un DOM, e resta valida per quello vero.
 */
export interface NodoLeggibile {
  /** 1 = elemento, 3 = testo (gli stessi numeri del DOM). */
  nodeType: number;
  nodeName: string;
  textContent?: string | null;
  childNodes?: ArrayLike<NodoLeggibile>;
}

const NODO_TESTO = 3;
const NODO_ELEMENTO = 1;

/** Elementi che il campo produce andando a capo. */
const BLOCCHI = new Set(["DIV", "P"]);
/** Elementi che segnano il grassetto. */
const GRASSETTI = new Set(["B", "STRONG"]);

function scrivi(testo: string, grassetto: boolean): string {
  if (!grassetto || !testo.trim()) return testo;
  // Gli spazi ai bordi restano fuori dai marcatori: "**parola **" stamperebbe
  // in grassetto anche lo spazio, e al giro dopo lo rimetterebbe dentro.
  const prima = testo.slice(0, testo.length - testo.trimStart().length);
  const dopo = testo.slice(testo.trimEnd().length);
  const nucleo = testo.trim();
  return `${prima}${MARCATORE_GRASSETTO}${nucleo}${MARCATORE_GRASSETTO}${dopo}`;
}

/**
 * Il testo salvato a partire dal contenuto del campo.
 *
 * Tiene solo testo, a capo e grassetto: tutto il resto — corsivi, colori,
 * tabelle incollate da un altro programma — torna testo semplice, perche' il
 * referto non sa stampare nient'altro e salvarlo darebbe una formattazione che
 * poi sparisce.
 */
export function testoDaiNodi(
  nodi: ArrayLike<NodoLeggibile> | undefined,
  grassetto = false,
): string {
  if (!nodi) return "";
  let fuori = "";
  for (let i = 0; i < nodi.length; i++) {
    const nodo = nodi[i];
    if (nodo.nodeType === NODO_TESTO) {
      fuori += scrivi(nodo.textContent ?? "", grassetto);
      continue;
    }
    if (nodo.nodeType !== NODO_ELEMENTO) continue;
    const nome = nodo.nodeName.toUpperCase();
    if (nome === "BR") {
      fuori += "\n";
      continue;
    }
    if (BLOCCHI.has(nome)) {
      // Il campo avvolge in un blocco ogni riga dopo la prima: il capoverso
      // sta nel passaggio da un blocco all'altro, non dentro al blocco.
      if (fuori && !fuori.endsWith("\n")) fuori += "\n";
      fuori += testoDaiNodi(nodo.childNodes, grassetto);
      continue;
    }
    fuori += testoDaiNodi(nodo.childNodes, grassetto || GRASSETTI.has(nome));
  }
  return fuori;
}

function proteggi(testo: string): string {
  return testo
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;");
}

/**
 * Il contenuto del campo a partire dal testo salvato.
 *
 * Marcatore spaiato: resta scritto com'e', come nei messaggi — chi scrive
 * "vedi ** nota" non stava chiedendo il grassetto.
 */
export function testoInHtml(testo: string | undefined | null): string {
  if (!testo) return "";
  const pezzi = proteggi(testo).split(MARCATORE_GRASSETTO);
  const chiusi = pezzi.length % 2 === 1;
  return pezzi
    .map((pezzo, i) => {
      const righe = pezzo.split("\n").join("<br>");
      if (!chiusi && i > 0) return `${MARCATORE_GRASSETTO}${righe}`;
      return chiusi && i % 2 === 1 ? `<b>${righe}</b>` : righe;
    })
    .join("");
}
