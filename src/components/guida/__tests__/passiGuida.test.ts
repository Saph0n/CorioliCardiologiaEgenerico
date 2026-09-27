import { describe, expect, it } from "vitest";
import {
  CF_PROVA,
  EVENTO_REFERTO_APERTO,
  g,
  passiGuida,
  pazienteDellaVisita,
  type ContestoPasso,
} from "../passiGuida";
import { isValidCodiceFiscaleFormat } from "../../../utils/codiceFiscale";

/** Una pagina finta: percorso, elementi presenti, testi e valori dei campi. */
function contesto(parziale: {
  percorso?: string;
  ricerca?: string;
  presenti?: string[];
  testi?: Record<string, string>;
  valori?: Record<string, string>;
  eventi?: string[];
}): ContestoPasso {
  const presenti = new Set(parziale.presenti ?? []);
  return {
    percorso: parziale.percorso ?? "/",
    ricerca: parziale.ricerca ?? "",
    esiste: (s) => presenti.has(s),
    testo: (s) => parziale.testi?.[s] ?? "",
    valore: (s) => parziale.valori?.[s] ?? "",
    eventi: new Set(parziale.eventi ?? []),
  };
}

const passi = passiGuida("Ctrl");
const passo = (id: string) => {
  const trovato = passi.find((p) => p.id === id);
  if (!trovato) throw new Error(`passo ${id} mancante`);
  return trovato;
};
const CAMPO_EO = `${g("campo-esame-obiettivo")} [contenteditable="true"]`;

describe("passi della prova guidata", () => {
  it("non ripete lo stesso id e rimanda solo a passi esistenti", () => {
    const ids = passi.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Il codice fiscale di prova deve passare il controllo dell'app, se no la
  // scheda non ricava data, luogo e sesso e il passo non mostra niente.
  it("usa un codice fiscale di prova che l'app accetta", () => {
    expect(isValidCodiceFiscaleFormat(CF_PROVA)).toBe(true);
  });

  it("comincia dalla ricerca gia' aperta, e la riapre se si chiude", () => {
    expect(passi[0].id).toBe("scrivi-cf");
    const p = passo("scrivi-cf");
    expect(p.apriRicerca?.(contesto({ percorso: "/" }))).toBe(true);
    expect(p.apriRicerca?.(contesto({ percorso: "/", presenti: [g("pannello-paziente")] }))).toBe(false);
    expect(p.apriRicerca?.(contesto({ percorso: "/add-patient" }))).toBe(false);
    expect(p.fatto?.(contesto({ percorso: "/add-patient" }))).toBe(true);
  });

  it("torna alla ricerca se si torna in dashboard prima di salvare il paziente", () => {
    for (const id of ["dati-da-cf", "cognome", "salva-paziente"]) {
      expect(passo(id).perso?.(contesto({ percorso: "/" })), id).toBe("scrivi-cf");
      expect(passo(id).perso?.(contesto({ percorso: "/add-patient" })), id).toBeNull();
    }
  });

  it("abilita Avanti sul cognome solo quando e' scritto", () => {
    const p = passo("cognome");
    expect(p.pronto?.(contesto({ percorso: "/add-patient" }))).toBe(false);
    expect(
      p.pronto?.(contesto({ percorso: "/add-patient", valori: { 'input[name="lastName"]': "Prova" } })),
    ).toBe(true);
  });

  it("riconosce il paziente nuovo dalla visita che si apre", () => {
    expect(pazienteDellaVisita({ percorso: "/add-visit", ricerca: "?patientId=abc" })).toBe("abc");
    expect(pazienteDellaVisita({ percorso: "/add-patient", ricerca: "?patientId=abc" })).toBeNull();
    expect(passo("salva-paziente").fatto?.(contesto({ percorso: "/add-visit", ricerca: "?patientId=abc" }))).toBe(true);
  });

  it("vede il modello inserito e poi il grassetto nell'esame obiettivo", () => {
    expect(passo("modello").fatto?.(contesto({ testi: { [CAMPO_EO]: "  " } }))).toBe(false);
    expect(passo("modello").fatto?.(contesto({ testi: { [CAMPO_EO]: "Paziente in condizioni…" } }))).toBe(true);
    expect(passo("grassetto").fatto?.(contesto({}))).toBe(false);
    expect(passo("grassetto").fatto?.(contesto({ presenti: [`${CAMPO_EO} b`] }))).toBe(true);
  });

  it("aspetta il referto aperto per la stampa, e lascia passare Ctrl+P", () => {
    const p = passo("stampa");
    expect(p.consentiti).toEqual(["p"]);
    expect(p.fatto?.(contesto({}))).toBe(false);
    expect(p.fatto?.(contesto({ eventi: [EVENTO_REFERTO_APERTO] }))).toBe(true);
  });

  it("chiude sull'editor dei modelli quando l'editor si chiude", () => {
    const p = passo("editor-modello");
    expect(p.tipo).toBe("attesa");
    expect(p.fatto?.(contesto({ percorso: "/settings", presenti: [g("editor-modello")] }))).toBe(false);
    expect(p.fatto?.(contesto({ percorso: "/settings" }))).toBe(true);
  });

  // La guida fa vedere, non solo dire: ogni passo da provare ha la manina,
  // i tasti che si premono, un campo da farsi scrivere o una dimostrazione.
  it("mostra come si fa in ogni passo da provare", () => {
    for (const p of passi.filter((x) => x.tipo === "prova")) {
      const mostra = Boolean(p.punta?.length || p.tasti || p.scrivi || p.demo);
      expect(mostra, p.id).toBe(true);
    }
  });

  it("dice il tasto giusto sul Mac", () => {
    const mac = passiGuida("Cmd");
    expect(mac.find((p) => p.id === "stampa")?.tasti).toEqual(["Cmd", "P"]);
    expect(mac.find((p) => p.id === "grassetto")?.testo).toContain("Cmd+B");
  });
});
