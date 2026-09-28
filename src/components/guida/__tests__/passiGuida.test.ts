import { describe, expect, it } from "vitest";
import {
  EVENTO_REFERTO_APERTO,
  g,
  passiGuida,
  pazienteDellaVisita,
  type ContestoPasso,
} from "../passiGuida";
import { CF_PAZIENTE_DA_CERCARE } from "../../../utils/pazientiProva";

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

  it("comincia dalla ricerca gia' aperta, e la riapre se si chiude", () => {
    expect(passi[0].id).toBe("scrivi-cf");
    const p = passo("scrivi-cf");
    expect(p.apriRicerca?.(contesto({ percorso: "/" }))).toBe(true);
    expect(p.apriRicerca?.(contesto({ percorso: "/", presenti: [g("pannello-paziente")] }))).toBe(false);
    // Con «Nuovo paziente» si finisce nella registrazione: la ricerca torna.
    expect(p.apriRicerca?.(contesto({ percorso: "/add-patient" }))).toBe(true);
    expect(
      p.apriRicerca?.(contesto({ percorso: "/add-visit", ricerca: "?patientId=mario" })),
    ).toBe(false);
  });

  // Mario Rossi e' in archivio: il codice fiscale lo trova, e Invio apre la
  // sua visita invece della registrazione di un paziente nuovo.
  it("cerca Mario Rossi e va avanti quando si apre la sua visita", () => {
    const p = passo("scrivi-cf");
    expect(p.scrivi?.testo).toBe(CF_PAZIENTE_DA_CERCARE);
    expect(p.fatto?.(contesto({ percorso: "/add-patient" }))).toBe(false);
    expect(p.fatto?.(contesto({ percorso: "/add-visit", ricerca: "?patientId=mario" }))).toBe(true);
    expect(pazienteDellaVisita({ percorso: "/add-visit", ricerca: "?patientId=abc" })).toBe("abc");
    expect(pazienteDellaVisita({ percorso: "/add-patient", ricerca: "?patientId=abc" })).toBeNull();
  });

  it("fa scrivere il codice fiscale con cui Mario e' finito in archivio", () => {
    const riserva = passiGuida("Ctrl", "RSSMRA80A02H501Z");
    expect(riserva.find((p) => p.id === "scrivi-cf")?.scrivi?.testo).toBe("RSSMRA80A02H501Z");
  });

  it("apre gli esami, poi il grafico dell'LDL, poi li richiude", () => {
    expect(passo("esami").fatto?.(contesto({}))).toBe(false);
    expect(passo("esami").fatto?.(contesto({ presenti: [g("finestra-esami")] }))).toBe(true);

    const andamento = passo("andamento");
    const finestra = [g("finestra-esami")];
    expect(andamento.fatto?.(contesto({ presenti: finestra }))).toBe(false);
    expect(
      andamento.fatto?.(contesto({ presenti: [...finestra, g("pannello-andamento")] })),
    ).toBe(true);
    // Chiusa la finestra prima del grafico, si torna a riaprirla.
    expect(andamento.perso?.(contesto({ presenti: finestra }))).toBeNull();
    expect(andamento.perso?.(contesto({}))).toBe("esami");

    const chiudi = passo("chiudi-esami");
    expect(chiudi.fatto?.(contesto({ presenti: finestra }))).toBe(false);
    expect(chiudi.fatto?.(contesto({}))).toBe(true);
  });

  it("porta ai pazienti a rischio in dashboard", () => {
    const vai = passo("vai-dashboard");
    expect(vai.fatto?.(contesto({ percorso: "/patient-history/mario" }))).toBe(false);
    expect(vai.fatto?.(contesto({ percorso: "/" }))).toBe(true);
    expect(passo("rischio").tipo).toBe("guarda");
    expect(passo("rischio").bersagli).toEqual([g("pazienti-a-rischio")]);
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
