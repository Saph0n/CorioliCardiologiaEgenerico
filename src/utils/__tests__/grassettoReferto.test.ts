import { describe, expect, it } from "vitest";
import {
  applicaGrassetto,
  testoDaiNodi,
  testoInHtml,
} from "../grassettoReferto";

/**
 * Il tasto grassetto dei campi del referto. La selezione che resta dopo
 * l'operazione conta quanto il testo: se il cursore salta, si perde il punto
 * in cui si stava scrivendo.
 */
describe("tasto grassetto del referto", () => {
  it("mette i marcatori attorno alla selezione e la tiene selezionata", () => {
    const esito = applicaGrassetto("soffio sistolico 2/6", 7, 16);
    expect(esito.testo).toBe("soffio **sistolico** 2/6");
    expect(esito.testo.slice(esito.inizio, esito.fine)).toBe("sistolico");
  });

  it("senza selezione apre i marcatori e lascia il cursore in mezzo", () => {
    const esito = applicaGrassetto("PA ", 3, 3);
    expect(esito.testo).toBe("PA ****");
    expect(esito.inizio).toBe(5);
    expect(esito.fine).toBe(5);
  });

  it("premuto di nuovo toglie il grassetto", () => {
    const messo = applicaGrassetto("soffio sistolico", 7, 16);
    const tolto = applicaGrassetto(messo.testo, messo.inizio, messo.fine);
    expect(tolto.testo).toBe("soffio sistolico");
    expect(tolto.testo.slice(tolto.inizio, tolto.fine)).toBe("sistolico");
  });

  it("toglie il grassetto anche selezionando i marcatori", () => {
    const esito = applicaGrassetto("soffio **sistolico**", 7, 20);
    expect(esito.testo).toBe("soffio sistolico");
  });

  it("lascia fuori dai marcatori gli spazi presi con la selezione", () => {
    // Il doppio clic su una parola si porta dietro lo spazio che la segue.
    const esito = applicaGrassetto("nota importante qui", 5, 16);
    expect(esito.testo).toBe("nota **importante** qui");
    expect(esito.testo.slice(esito.inizio, esito.fine)).toBe("importante");
  });

  it("su una selezione di soli spazi non fa niente", () => {
    const esito = applicaGrassetto("due  spazi", 3, 5);
    expect(esito.testo).toBe("due  spazi");
  });
});

/**
 * Il campo mostra il grassetto vero, il referto salva testo con i marcatori:
 * queste due funzioni sono il passaggio fra le due forme, e devono chiudere il
 * giro senza cambiare niente per strada.
 */
describe("dal testo salvato al campo e ritorno", () => {
  /** Un nodo di testo, come quelli veri. */
  const testo = (t: string) => ({ nodeType: 3, nodeName: "#text", textContent: t });
  /** Un elemento con i suoi figli. */
  const el = (nome: string, figli: ReturnType<typeof testo>[] | object[] = []) => ({
    nodeType: 1,
    nodeName: nome,
    childNodes: figli as never,
  });

  it("scrive il grassetto come <b>", () => {
    expect(testoInHtml("Soffio **sistolico** aortico")).toBe(
      "Soffio <b>sistolico</b> aortico",
    );
  });

  it("legge il <b> come marcatori", () => {
    expect(
      testoDaiNodi([testo("Soffio "), el("B", [testo("sistolico")]), testo(" aortico")]),
    ).toBe("Soffio **sistolico** aortico");
  });

  it("tratta <strong> come <b>", () => {
    expect(testoDaiNodi([el("STRONG", [testo("grave")])])).toBe("**grave**");
  });

  it("va a capo con <br> e con i blocchi", () => {
    expect(testoDaiNodi([testo("prima"), el("BR"), testo("dopo")])).toBe(
      "prima\ndopo",
    );
    expect(testoDaiNodi([testo("prima"), el("DIV", [testo("dopo")])])).toBe(
      "prima\ndopo",
    );
  });

  it("riporta a capo il testo salvato", () => {
    expect(testoInHtml("prima\ndopo")).toBe("prima<br>dopo");
  });

  it("butta via la formattazione che il referto non sa stampare", () => {
    // Una tabella incollata da un altro programma torna testo semplice.
    expect(
      testoDaiNodi([el("SPAN", [el("I", [testo("corsivo")]), testo(" normale")])]),
    ).toBe("corsivo normale");
  });

  it("non lascia passare l'HTML scritto nel campo", () => {
    expect(testoInHtml("uso di <b> nel testo")).toBe(
      "uso di &lt;b&gt; nel testo",
    );
  });

  it("tiene gli spazi fuori dai marcatori", () => {
    expect(testoDaiNodi([el("B", [testo("nota ")]), testo("dopo")])).toBe(
      "**nota** dopo",
    );
  });

  it("lascia stare un marcatore spaiato", () => {
    expect(testoInHtml("vedi ** nota")).toBe("vedi ** nota");
  });

  it("chiude il giro senza cambiare il testo", () => {
    const originale = "Toni validi, **soffio 2/6** sul focolaio\nseconda riga";
    const nodi = [
      testo("Toni validi, "),
      el("B", [testo("soffio 2/6")]),
      testo(" sul focolaio"),
      el("BR"),
      testo("seconda riga"),
    ];
    expect(testoInHtml(originale)).toBe(
      "Toni validi, <b>soffio 2/6</b> sul focolaio<br>seconda riga",
    );
    expect(testoDaiNodi(nodi)).toBe(originale);
  });
});
