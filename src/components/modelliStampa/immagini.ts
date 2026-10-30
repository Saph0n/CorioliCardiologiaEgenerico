import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * pdf.js per l'editor dei modelli: disegna l'anteprima e trasforma in
 * immagine la carta intestata caricata come PDF. Il worker si imposta qui una
 * volta per tutti e due.
 */
GlobalWorkerOptions.workerSrc = workerUrl;
export { getDocument };

function leggiComeDataUrl(file: File, errore: string): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(new Error(errore));
    r.readAsDataURL(file);
  });
}

function caricaImmagine(url: string, errore: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error(errore));
    i.src = url;
  });
}

/** Ridisegna su una tela alla larghezza data; lo sfondo bianco serve al JPEG. */
function ridisegna(
  sorgente: CanvasImageSource, larghezza: number, altezza: number, bianco: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(larghezza));
  c.height = Math.max(1, Math.round(altezza));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("L'immagine non si può preparare.");
  if (bianco) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(sorgente, 0, 0, c.width, c.height);
  return c;
}

/**
 * Il logo entra nel modello gia' rimpicciolito: nel PDF occupa al piu'
 * 50 x 20 mm, e 600 pixel sul lato lungo bastano e avanzano per la stampa.
 * Una foto da 5 MB caricata cosi' com'e' farebbe pesare ogni referto.
 */
export async function preparaLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    throw new Error("Il logo deve essere un'immagine PNG o JPG.");
  }
  const img = await caricaImmagine(
    await leggiComeDataUrl(file, "Il file del logo non si legge."),
    "Il file del logo non è un'immagine valida.",
  );
  const scala = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const jpeg = file.type === "image/jpeg";
  const c = ridisegna(img, img.naturalWidth * scala, img.naturalHeight * scala, jpeg);
  return jpeg ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
}

/** 150 dpi sull'A4: abbastanza per stampare un'intestazione, pochi kB in JPEG. */
const LARGHEZZA_CARTA = 1240;
const ALTEZZA_CARTA = Math.round(LARGHEZZA_CARTA * 297 / 210);

/**
 * Mette l'immagine su un foglio A4 bianco senza deformarla: il PDF la stende
 * sul foglio intero. Un foglio intero la riempie; la sola striscia
 * dell'intestazione (un'immagine larga e bassa, ed e' frequente) va in cima,
 * a tutta larghezza, invece di essere stirata fino in fondo alla pagina.
 */
function suFoglioA4(sorgente: CanvasImageSource, larghezza: number, altezza: number): string {
  const c = document.createElement("canvas");
  c.width = LARGHEZZA_CARTA;
  c.height = ALTEZZA_CARTA;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("La carta intestata non si può preparare.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  const scala = Math.min(c.width / larghezza, c.height / altezza);
  const w = larghezza * scala;
  const h = altezza * scala;
  // Un foglio quasi A4 (scansioni, PDF con margini diversi) si stende tutto;
  // un'immagine piu' bassa del foglio sta in cima, centrata.
  const quasiA4 = Math.abs(altezza / larghezza - 297 / 210) < 0.06;
  if (quasiA4) ctx.drawImage(sorgente, 0, 0, c.width, c.height);
  else ctx.drawImage(sorgente, (c.width - w) / 2, 0, w, h);
  return c.toDataURL("image/jpeg", 0.85);
}

/**
 * La carta intestata, da PDF (la prima pagina) o da immagine, come JPEG a
 * foglio intero. JPEG e non PNG: e' un'immagine grande che sta sotto a ogni
 * pagina, e l'anteprima si rifa' a ogni modifica.
 */
export async function preparaCartaIntestata(file: File): Promise<string> {
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (pdf) {
    const dati = new Uint8Array(await file.arrayBuffer());
    let documento;
    try {
      documento = await getDocument({ data: dati }).promise;
    } catch {
      throw new Error("Il PDF della carta intestata non si apre.");
    }
    try {
      const pagina = await documento.getPage(1);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: LARGHEZZA_CARTA / base.width });
      const c = document.createElement("canvas");
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("La carta intestata non si può preparare.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      await pagina.render({ canvasContext: ctx, viewport }).promise;
      return suFoglioA4(c, c.width, c.height);
    } finally {
      void documento.destroy();
    }
  }
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    throw new Error("La carta intestata deve essere un PDF, un PNG o un JPG.");
  }
  const img = await caricaImmagine(
    await leggiComeDataUrl(file, "Il file della carta intestata non si legge."),
    "Il file della carta intestata non è un'immagine valida.",
  );
  return suFoglioA4(img, img.naturalWidth, img.naturalHeight);
}

/**
 * Lato anche nella pagina dell'editor, perche' le miniature degli stili e il
 * campione "Aa" lo mostrino com'e' davvero: sono gli stessi file che vanno
 * nei PDF, caricati una volta sola.
 */
let latoNellaPagina: Promise<void> | null = null;
export function caricaLatoNellaPagina(): Promise<void> {
  latoNellaPagina ??= (async () => {
    const f = await import("../../assets/fonts/lato");
    const voci: [string, string, string][] = [
      [f.LATO_NORMALE, "400", "normal"],
      [f.LATO_GRASSETTO, "700", "normal"],
      [f.LATO_CORSIVO, "400", "italic"],
      [f.LATO_GRASSETTO_CORSIVO, "700", "italic"],
    ];
    for (const [dati, weight, style] of voci) {
      const byte = Uint8Array.from(atob(dati), (c) => c.charCodeAt(0));
      const carattere = new FontFace("Lato", byte, { weight, style });
      await carattere.load();
      document.fonts.add(carattere);
    }
  })().catch(() => undefined);
  return latoNellaPagina;
}
