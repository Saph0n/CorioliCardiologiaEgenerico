/**
 * Quello che i pezzi della guida condividono col resto della pagina: gli
 * attributi che la mettono sopra a tutto e il modo di cercare un elemento
 * senza trovare la guida stessa. In un file senza componenti, perche' il
 * ricaricamento a caldo di Vite non azzeri la guida a ogni modifica.
 */

/**
 * Attributi del contenitore della guida.
 *
 * `data-react-aria-top-layer` dice a react-aria (sotto i modal e i menu di
 * NextUI) che la guida sta sopra a tutto: un clic sul fumetto non chiude il
 * modal aperto sotto, il fuoco puo' entrarci e i lettori di schermo non lo
 * nascondono. Senza, premere "Scrivilo per me" con la ricerca aperta chiudeva
 * la ricerca.
 */
export const ATTRIBUTI_LIVELLO_GUIDA = {
  "data-guida-ui": "",
  "data-react-aria-top-layer": "true",
} as const;

/** Il primo elemento del selettore che non fa parte della guida stessa. */
export function trovaNellaPagina(selettore: string): HTMLElement | null {
  const elementi = Array.from(document.querySelectorAll<HTMLElement>(selettore));
  return elementi.find((el) => !el.closest("[data-guida-ui]")) ?? null;
}
