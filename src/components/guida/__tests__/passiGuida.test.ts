import { describe, expect, it } from "vitest";
import {
  BOTTONE_ANDAMENTO,
  EVENTO_REFERTO_APERTO,
  FINESTRA_ESAMI,
  RISULTATO_PAZIENTE_DELLA_PROVA,
  g,
  passiGuida,
  pazienteDellaVisita,
  type ContestoPasso,
} from "../passiGuida";
import { PAZIENTE_DELLA_PROVA } from "../archivioDiProva";

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

  it("comincia dalla colonna dei pazienti a rischio", () => {
    expect(passi[0].id).toBe("rischio");
    expect(passi[0].bersagli).toEqual([g("colonna-rischio")]);
  });

  it("apre la ricerca con Ctrl+N e lascia passare solo quella scorciatoia", () => {
    const p = passo("apri-visita");
    expect(p.consentiti).toEqual(["n"]);
    expect(p.fatto?.(contesto({}))).toBe(false);
    expect(p.fatto?.(contesto({ presenti: [g("pannello-paziente")] }))).toBe(true);
  });

  // Si cerca per cognome, come si fa davvero: nessuno cerca per codice fiscale.
  // E lo si sceglie col mouse, dove punta la manina: non con Invio.
  it("fa cercare il paziente della prova per cognome e sceglierlo col clic", () => {
    const p = passo("cerca");
    expect(p.scrivi?.testo).toBe(PAZIENTE_DELLA_PROVA.cognome);
    expect(p.titolo).toContain("cognome");
    expect(p.punta).toEqual([RISULTATO_PAZIENTE_DELLA_PROVA]);
    expect(p.testo).toContain("clic");
    expect(p.testo).not.toContain("Invio");
  });

  it("torna a Ctrl+N se la ricerca si chiude senza aprire la visita", () => {
    const p = passo("cerca");
    expect(p.perso?.(contesto({ percorso: "/" }))).toBe("apri-visita");
    expect(p.perso?.(contesto({ percorso: "/", presenti: [g("pannello-paziente")] }))).toBeNull();
    expect(p.fatto?.(contesto({ percorso: "/" }))).toBe(false);
    expect(p.fatto?.(contesto({ percorso: "/add-visit", ricerca: "?patientId=prova-martelli" }))).toBe(true);
  });

  it("riconosce il paziente dalla visita che si apre", () => {
    expect(pazienteDellaVisita({ percorso: "/add-visit", ricerca: "?patientId=abc" })).toBe("abc");
    expect(pazienteDellaVisita({ percorso: "/add-patient", ricerca: "?patientId=abc" })).toBeNull();
  });

  it("apre gli esami, poi il grafico, poi fa chiudere la finestra", () => {
    const visita = { percorso: "/add-visit", ricerca: "?patientId=prova-martelli" };
    expect(passo("esami").fatto?.(contesto(visita))).toBe(false);
    expect(passo("esami").fatto?.(contesto({ ...visita, presenti: [FINESTRA_ESAMI] }))).toBe(true);

    const andamento = passo("andamento");
    const conGrafici = { ...visita, presenti: [FINESTRA_ESAMI, BOTTONE_ANDAMENTO] };
    expect(andamento.fatto?.(contesto(conGrafici))).toBe(false);
    expect(andamento.pronto?.(contesto(conGrafici))).toBe(false);
    expect(
      andamento.fatto?.(contesto({ ...visita, presenti: [...conGrafici.presenti, g("grafico-andamento")] })),
    ).toBe(true);
    // Finestra chiusa prima del grafico: si torna a riaprirla.
    expect(andamento.perso?.(contesto(visita))).toBe("esami");

    const chiudi = passo("chiudi-esami");
    expect(chiudi.fatto?.(contesto({ ...visita, presenti: [FINESTRA_ESAMI] }))).toBe(false);
    expect(chiudi.fatto?.(contesto(visita))).toBe(true);
  });

  // Un paziente con un solo prelievo non ha il grafico: la guida non deve
  // restare ferma ad aspettare un clic impossibile.
  it("lascia andare avanti se il paziente scelto non ha grafici", () => {
    const p = passo("andamento");
    expect(p.pronto?.(contesto({ percorso: "/add-visit", presenti: [FINESTRA_ESAMI] }))).toBe(true);
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
    expect(mac.find((p) => p.id === "apri-visita")?.tasti).toEqual(["Cmd", "N"]);
    expect(mac.find((p) => p.id === "grassetto")?.testo).toContain("Cmd+B");
  });
});
