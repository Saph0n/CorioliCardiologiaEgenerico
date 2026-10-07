import { describe, expect, it } from "vitest";
import { schiarisciSfondo } from "../signatureStamp";

/**
 * Una firma fotografata col telefono: carta grigia e inchiostro scuro. Sul
 * referto, stampato in bianco e nero, la carta deve uscire bianca.
 */
function foto(carta: number[], inchiostro: number[], pixelInchiostro: number, totale: number) {
  const pixel = new Uint8ClampedArray(totale * 4);
  for (let i = 0; i < totale; i++) {
    const [r, g, b] = i < pixelInchiostro ? inchiostro : carta;
    pixel.set([r, g, b, 255], i * 4);
  }
  return pixel;
}

const rgb = (pixel: Uint8ClampedArray, i: number) =>
  Array.from(pixel.slice(i * 4, i * 4 + 3));

describe("schiarisciSfondo", () => {
  it("porta a bianco la carta grigia", () => {
    const pixel = foto([170, 168, 160], [30, 30, 40], 10, 100);
    schiarisciSfondo(pixel);
    expect(rgb(pixel, 50)).toEqual([255, 255, 255]);
  });

  it("lascia scuro l'inchiostro", () => {
    const pixel = foto([170, 168, 160], [30, 30, 40], 10, 100);
    schiarisciSfondo(pixel);
    const [r, g, b] = rgb(pixel, 0);
    expect(Math.max(r, g, b)).toBeLessThan(80);
  });

  it("un timbro blu resta blu", () => {
    const pixel = foto([180, 180, 180], [40, 60, 150], 20, 100);
    schiarisciSfondo(pixel);
    const [r, , b] = rgb(pixel, 0);
    expect(b).toBeGreaterThan(r + 80);
  });

  it("non tocca la trasparenza", () => {
    const pixel = foto([170, 168, 160], [30, 30, 40], 10, 100);
    schiarisciSfondo(pixel);
    expect(pixel[50 * 4 + 3]).toBe(255);
  });

  it("lascia com'e' un'immagine scura, che non e' un foglio", () => {
    const pixel = foto([40, 40, 40], [200, 200, 200], 10, 100);
    const prima = Array.from(pixel);
    schiarisciSfondo(pixel);
    expect(Array.from(pixel)).toEqual(prima);
  });
});
