/** Rapporto blocco firma/timbro ricetta (180×60 px layout → 3:1) */
export const SIGNATURE_STAMP_ASPECT = 3;

/** Risoluzione export ritaglio (4× rispetto al layout PDF) */
export const SIGNATURE_STAMP_EXPORT_WIDTH = 720;
export const SIGNATURE_STAMP_EXPORT_HEIGHT =
  SIGNATURE_STAMP_EXPORT_WIDTH / SIGNATURE_STAMP_ASPECT;

/** Dimensioni display nel PDF ricetta (unità layout prima di RX) */
export const SIGNATURE_STAMP_PDF_LAYOUT_W = 180;
export const SIGNATURE_STAMP_PDF_LAYOUT_H = 60;

const ASPECT_TOLERANCE = 0.02;

function isAlreadyCroppedExport(
  width: number,
  height: number,
  dataUrl: string,
): boolean {
  return (
    width === SIGNATURE_STAMP_EXPORT_WIDTH &&
    height === SIGNATURE_STAMP_EXPORT_HEIGHT &&
    Math.abs(width / height - SIGNATURE_STAMP_ASPECT) < ASPECT_TOLERANCE &&
    dataUrl.startsWith("data:image/png")
  );
}

/**
 * Normalizza timbro/firma al rapporto 3:1 (ritaglio centrale se necessario).
 * Immagini già esportate dal crop in Settings vengono riusate così come sono.
 */
export function normalizeSignatureStampImage(
  imageSrc: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) {
        reject(new Error("Immagine non valida"));
        return;
      }

      if (isAlreadyCroppedExport(nw, nh, imageSrc)) {
        resolve(imageSrc);
        return;
      }

      const currentAspect = nw / nh;
      let sx: number;
      let sy: number;
      let sw: number;
      let sh: number;

      if (currentAspect > SIGNATURE_STAMP_ASPECT) {
        sh = nh;
        sw = nh * SIGNATURE_STAMP_ASPECT;
        sx = (nw - sw) / 2;
        sy = 0;
      } else {
        sw = nw;
        sh = nw / SIGNATURE_STAMP_ASPECT;
        sx = 0;
        sy = (nh - sh) / 2;
      }

      const canvas = document.createElement("canvas");
      canvas.width = SIGNATURE_STAMP_EXPORT_WIDTH;
      canvas.height = SIGNATURE_STAMP_EXPORT_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas non disponibile"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIGNATURE_STAMP_EXPORT_WIDTH, SIGNATURE_STAMP_EXPORT_HEIGHT);
      ctx.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        SIGNATURE_STAMP_EXPORT_WIDTH,
        SIGNATURE_STAMP_EXPORT_HEIGHT,
      );
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Caricamento immagine fallito"));
    img.src = imageSrc;
  });
}

/**
 * Porta a bianco la carta di una firma fotografata.
 *
 * Una firma fotografata col telefono arriva su un foglio grigio, non bianco, e
 * il referto si stampa in bianco e nero: senza questo passaggio sotto la firma
 * si stamperebbe un rettangolo grigio. La carta si riconosce come la
 * luminosita' mediana del ritaglio, perche' inchiostro e timbro ne coprono
 * sempre meno della meta'; ogni canale viene riscalato in modo che la carta
 * vada a 255, e quello che resta quasi bianco diventa bianco pieno. Il colore
 * dell'inchiostro si conserva in proporzione: un timbro blu resta blu.
 *
 * Lavora sui pixel RGBA di un canvas e li modifica sul posto.
 */
export function schiarisciSfondo(pixel: Uint8ClampedArray): void {
  const istogramma = new Array<number>(256).fill(0);
  for (let i = 0; i < pixel.length; i += 4) {
    istogramma[luminanza(pixel[i], pixel[i + 1], pixel[i + 2])]++;
  }
  const meta = pixel.length / 8;
  let carta = 0;
  for (let somma = 0; carta < 255; carta++) {
    somma += istogramma[carta];
    if (somma >= meta) break;
  }
  // Una mediana scura non e' un foglio: meglio lasciare l'immagine com'e'
  // che sbiancare una foto sbagliata.
  if (carta < 96) return;

  const k = 255 / carta;
  for (let i = 0; i < pixel.length; i += 4) {
    const r = Math.min(255, pixel[i] * k);
    const g = Math.min(255, pixel[i + 1] * k);
    const b = Math.min(255, pixel[i + 2] * k);
    if (luminanza(r, g, b) >= 235) {
      pixel[i] = pixel[i + 1] = pixel[i + 2] = 255;
    } else {
      pixel[i] = r;
      pixel[i + 1] = g;
      pixel[i + 2] = b;
    }
  }
}

function luminanza(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

export function signatureStampPdfFormat(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}
