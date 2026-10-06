import { SIGNATURE_STAMP_ASPECT } from "./signatureStamp";

/**
 * Firma scritta sullo schermo, con il pennino, il dito o il mouse.
 *
 * I punti si tengono in coordinate del riquadro con l'altezza uguale a 1 e la
 * larghezza uguale al rapporto della firma nel PDF (3): cosi' lo stesso
 * tratto si ridisegna uguale sul riquadro a schermo, di qualunque misura sia
 * la finestra, e sull'immagine che va nei documenti.
 */
export type PuntoFirma = {
  x: number;
  y: number;
  /** Pressione del pennino fra 0 e 1; per dito e mouse vale 0,5. */
  p: number;
};

export type TrattoFirma = PuntoFirma[];

export type Adattamento = { scala: number; dx: number; dy: number };

/** Margine attorno alla firma nell'immagine esportata, in altezze. */
const MARGINE = 0.1;
/**
 * Ingrandimento massimo: una sigla piccola si porta alla misura del riquadro,
 * ma non oltre, se no un punto diventa una macchia.
 */
const SCALA_MASSIMA = 3;

/**
 * Come portare la firma a riempire il riquadro del PDF.
 *
 * Chi firma sullo schermo non usa tutto lo spazio: firma in un angolo, piccolo
 * o grande secondo la mano. Nei documenti la firma deve avere sempre la stessa
 * misura, quindi si prende il rettangolo che contiene i tratti e lo si centra
 * nel riquadro, ingrandito o ridotto senza deformarlo.
 */
export function adattaAlRiquadro(
  tratti: TrattoFirma[],
  rapporto = SIGNATURE_STAMP_ASPECT,
): Adattamento {
  const punti = tratti.flat();
  if (punti.length === 0) return { scala: 1, dx: 0, dy: 0 };

  const xs = punti.map((pt) => pt.x);
  const ys = punti.map((pt) => pt.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const largo = maxX - minX;
  const alto = maxY - minY;

  const spazioX = rapporto - 2 * MARGINE;
  const spazioY = 1 - 2 * MARGINE;
  const scala = Math.min(
    SCALA_MASSIMA,
    largo > 0 ? spazioX / largo : SCALA_MASSIMA,
    alto > 0 ? spazioY / alto : SCALA_MASSIMA,
  );

  return {
    scala,
    dx: rapporto / 2 - ((minX + maxX) / 2) * scala,
    dy: 0.5 - ((minY + maxY) / 2) * scala,
  };
}

/**
 * Spessore del tratto in altezze del riquadro. Il pennino passa la pressione
 * e il tratto si ingrossa dove si preme, come con la penna; dito e mouse
 * tracciano a spessore fisso.
 */
export function spessoreTratto(p: number): number {
  return 0.02 * (0.4 + 1.2 * Math.min(1, Math.max(0, p)));
}

/**
 * Disegna i tratti su un canvas alto `altezza` pixel.
 *
 * Fra un punto e l'altro passa una curva che ha per estremi i punti medi dei
 * segmenti e per controllo il punto registrato: senza, a velocita' alta il
 * tratto si vede fatto di spezzate.
 */
export function disegnaTratti(
  ctx: CanvasRenderingContext2D,
  tratti: TrattoFirma[],
  altezza: number,
  colore: string,
  adattamento: Adattamento = { scala: 1, dx: 0, dy: 0 },
): void {
  const { scala, dx, dy } = adattamento;
  const px = (pt: PuntoFirma) => (pt.x * scala + dx) * altezza;
  const py = (pt: PuntoFirma) => (pt.y * scala + dy) * altezza;

  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const tratto of tratti) {
    if (tratto.length === 0) continue;
    if (tratto.length === 1) {
      const [pt] = tratto;
      ctx.beginPath();
      ctx.arc(px(pt), py(pt), (spessoreTratto(pt.p) * altezza) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    let daX = px(tratto[0]);
    let daY = py(tratto[0]);
    for (let i = 1; i < tratto.length; i++) {
      const pt = tratto[i];
      const ultimo = i === tratto.length - 1;
      const aX = ultimo ? px(pt) : (px(pt) + px(tratto[i + 1])) / 2;
      const aY = ultimo ? py(pt) : (py(pt) + py(tratto[i + 1])) / 2;
      ctx.beginPath();
      ctx.lineWidth = spessoreTratto(pt.p) * altezza;
      ctx.moveTo(daX, daY);
      ctx.quadraticCurveTo(px(pt), py(pt), aX, aY);
      ctx.stroke();
      daX = aX;
      daY = aY;
    }
  }
}
