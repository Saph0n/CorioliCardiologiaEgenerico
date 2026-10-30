import { describe, expect, it } from "vitest";
import {
  DOCUMENTI_STAMPA,
  SEZIONI_REFERTO,
  STILI_PRONTI,
  VARIANTI,
  applicaAspetto,
  aspettoDi,
  copiaAspetto,
  eModelloPronto,
  idModelloPronto,
  modelloPronto,
  prontoDi,
  ripiegoDopoEliminazione,
  stileProntoDi,
  unisciArchivi,
  usaStileProntoOvunque,
  duplicaModello,
  fileModelli,
  idPredefinito,
  leggiFileModelli,
  modelliDelDocumento,
  modelloInUso,
  modelloPredefinito,
  nomeFileModelli,
  nomeUnivoco,
  normalizzaArchivio,
  normalizzaModello,
} from "../modelliStampa";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("modelli di stampa: predefiniti", () => {
  it("il referto ha tutte le sezioni nell'ordine di Corioli, visibili e col loro titolo", () => {
    const m = modelloPredefinito("referto");
    expect(m.sezioni.map((s) => s.id)).toEqual(SEZIONI_REFERTO.map((s) => s.id));
    expect(m.sezioni.every((s) => s.visibile && s.titolo === "")).toBe(true);
    expect(m.firma.luogoData).toBe(false);
  });

  it("ricetta, certificato e richiesta non hanno sezioni e tengono luogo e data", () => {
    for (const d of ["ricetta", "certificato", "richiestaEsame"] as const) {
      const m = modelloPredefinito(d);
      expect(m.sezioni).toEqual([]);
      expect(m.firma.luogoData).toBe(true);
      expect(m.paziente.dataNascita).toBe(false);
    }
  });

  it("senza modello scelto si usa il predefinito, e un id che non c'e' piu' non rompe", () => {
    expect(modelloInUso({ modelli: [], inUso: {} }, "ricetta").id).toBe(idPredefinito("ricetta"));
    expect(modelloInUso({ modelli: [], inUso: { ricetta: "sparito" } }, "ricetta").id)
      .toBe(idPredefinito("ricetta"));
  });

  it("l'elenco di un documento mette il predefinito per primo e solo i suoi modelli", () => {
    const mio = duplicaModello(modelloPredefinito("referto"), []);
    const altro = duplicaModello(modelloPredefinito("ricetta"), []);
    const elenco = modelliDelDocumento({ modelli: [altro, mio], inUso: {} }, "referto");
    expect(elenco.map((m) => m.id)).toEqual([idPredefinito("referto"), mio.id]);
  });
});

describe("modelli di stampa: normalizzazione", () => {
  it("riempie i campi mancanti col predefinito e scarta i valori non ammessi", () => {
    const m = normalizzaModello({
      documento: "referto",
      nome: "Studio",
      pagina: { colore: "fucsia", formato: "A5", carattere: "times" },
      intestazione: { spazioAlto: 500, logo: "javascript:alert(1)" },
    })!;
    expect(m.pagina.colore).toBe("nero");
    // Il referto resta A4 anche se il file dice A5.
    expect(m.pagina.formato).toBe("A4");
    expect(m.pagina.carattere).toBe("times");
    expect(m.intestazione.spazioAlto).toBe(90);
    expect(m.intestazione.logo).toBeUndefined();
    expect(m.titolo.testo).toBe("Visita cardiologica");
  });

  it("i campi nuovi mancano nei modelli vecchi e prendono il valore di Corioli", () => {
    const m = normalizzaModello({ documento: "ricetta", nome: "Vecchio" })!;
    expect(m.intestazione.grandezzaLogo).toBe("medio");
    expect(m.intestazione.sfondoInStampa).toBe(false);
    expect(m.firma.grandezza).toBe("normale");
    expect(m.testi).toEqual({ principale: "Prescrizione", secondario: "" });
    expect(m.paziente).toMatchObject({ luogoNascita: false, residenza: false, data: false });
  });

  it("rifiuta una carta intestata che non e' un'immagine", () => {
    const m = normalizzaModello({
      documento: "referto",
      intestazione: { sfondo: "data:application/pdf;base64,JVBERi0=", sfondoInStampa: true },
    })!;
    expect(m.intestazione.sfondo).toBeUndefined();
    expect(m.intestazione.sfondoInStampa).toBe(true);
  });

  it("tiene un titoletto vuoto: vuol dire nessun titoletto", () => {
    const m = normalizzaModello({ documento: "certificato", testi: { principale: "" } })!;
    expect(m.testi.principale).toBe("");
  });

  it("tiene un logo PNG o JPEG valido", () => {
    const m = normalizzaModello({ documento: "ricetta", intestazione: { logo: PNG } })!;
    expect(m.intestazione.logo).toBe(PNG);
  });

  it("rimette le sezioni mancanti dopo quella che le precede e toglie quelle sconosciute", () => {
    const m = normalizzaModello({
      documento: "referto",
      sezioni: [
        { id: "conclusioni", titolo: "Conclusioni", visibile: true },
        { id: "anamnesi", titolo: "", visibile: false },
        { id: "anamnesi", titolo: "doppione", visibile: true },
        { id: "ginecologia", titolo: "", visibile: true },
      ],
    })!;
    const ids = m.sezioni.map((s) => s.id);
    expect(ids).toHaveLength(SEZIONI_REFERTO.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("variabili");
    expect(ids.indexOf("conclusioni")).toBeLessThan(ids.indexOf("anamnesi"));
    expect(ids.indexOf("motivo")).toBe(ids.indexOf("anamnesi") + 1);
    expect(m.sezioni.find((s) => s.id === "anamnesi")!.visibile).toBe(false);
    expect(m.sezioni.find((s) => s.id === "conclusioni")!.titolo).toBe("Conclusioni");
  });

  it("non sa che farsene di un modello senza documento", () => {
    expect(normalizzaModello({ nome: "x" })).toBeNull();
    expect(normalizzaModello("referto")).toBeNull();
  });

  it("l'archivio scarta i finti predefiniti e gli 'in uso' che non esistono", () => {
    const buono = duplicaModello(modelloPredefinito("certificato"), []);
    const archivio = normalizzaArchivio({
      modelli: [buono, { ...modelloPredefinito("referto") }, "rotto"],
      inUso: { certificato: buono.id, referto: "nessuno", ricetta: buono.id },
    });
    expect(archivio.modelli.map((m) => m.id)).toEqual([buono.id]);
    expect(archivio.inUso).toEqual({ certificato: buono.id });
    expect(normalizzaArchivio(null)).toEqual({ modelli: [], inUso: {} });
  });
});

describe("modelli di stampa: nomi e copie", () => {
  it("numera i nomi gia' presi", () => {
    expect(nomeUnivoco("Studio", [])).toBe("Studio");
    expect(nomeUnivoco("Studio", ["studio"])).toBe("Studio (2)");
    expect(nomeUnivoco("Studio (2)", ["Studio", "Studio (2)"])).toBe("Studio (3)");
  });

  it("la copia del predefinito e' un modello nuovo, modificabile", () => {
    const copia = duplicaModello(modelloPredefinito("referto"), ["Il mio modello"]);
    expect(copia.id).not.toBe(idPredefinito("referto"));
    expect(copia.nome).toBe("Il mio modello (2)");
    expect(copia.creatoIl).not.toBe("");
  });
});

describe("modelli di stampa: file", () => {
  it("esporta e reimporta lo stesso modello con un id nuovo e senza ambulatorio", () => {
    const m = duplicaModello(modelloPredefinito("referto"), [], "Studio di Pisa");
    m.intestazione.logo = PNG;
    m.intestazione.ambulatorioId = "amb-1";
    m.sezioni[0].visibile = false;
    m.piede.testo = "Documento riservato";

    const testo = fileModelli([m], "1.4.1");
    expect(testo).not.toContain("amb-1");
    expect(testo).not.toContain(m.id);

    const letto = leggiFileModelli(testo);
    expect(letto.ok).toBe(true);
    if (!letto.ok) return;
    const [r] = letto.modelli;
    expect(r.id).not.toBe(m.id);
    expect(r.nome).toBe("Studio di Pisa");
    expect(r.intestazione.logo).toBe(PNG);
    expect(r.intestazione.ambulatorioId).toBeUndefined();
    expect(r.sezioni[0].visibile).toBe(false);
    expect(r.piede.testo).toBe("Documento riservato");
  });

  it("accetta un modello solo senza involucro", () => {
    const letto = leggiFileModelli(JSON.stringify({ documento: "ricetta", nome: "A5" }));
    expect(letto.ok && letto.modelli[0].documento).toBe("ricetta");
  });

  it("rifiuta file non suoi, rotti o di una versione futura", () => {
    expect(leggiFileModelli("{rotto").ok).toBe(false);
    expect(leggiFileModelli(JSON.stringify({ patients: [] })).ok).toBe(false);
    expect(leggiFileModelli(JSON.stringify({
      formato: "corioli-modelli-di-stampa", versione: 99, modelli: [],
    })).ok).toBe(false);
    expect(leggiFileModelli(JSON.stringify({
      formato: "corioli-modelli-di-stampa", versione: 1, modelli: [{ documento: "boh" }],
    })).ok).toBe(false);
  });

  it("conta i modelli scartati", () => {
    const letto = leggiFileModelli(JSON.stringify({
      formato: "corioli-modelli-di-stampa",
      versione: 1,
      modelli: [{ documento: "ricetta" }, { documento: "boh" }],
    }));
    expect(letto.ok && letto.scartati).toBe(1);
  });

  it("il nome del file e' leggibile e senza caratteri strani", () => {
    const m = duplicaModello(modelloPredefinito("ricetta"), [], "Studio Città / Pisa");
    expect(nomeFileModelli([m])).toBe("studio-citta-pisa.corioli-modelli.json");
    expect(nomeFileModelli([m, m])).toBe("modelli-di-stampa.corioli-modelli.json");
  });
});

const stile = (id: string) => STILI_PRONTI.find((s) => s.id === id)!;

describe("modelli di stampa: aspetto e stili pronti", () => {
  it("il predefinito e' Corioli in bianco e nero", () => {
    expect(stileProntoDi(modelloPredefinito("referto"))).toMatchObject({ stile: { id: "corioli" }, variante: "biancoNero" });
    expect(stileProntoDi(modelloPredefinito("ricetta"))).toMatchObject({ stile: { id: "corioli" }, variante: "biancoNero" });
  });

  it("uno stile pronto cambia l'aspetto e lascia testi e sezioni", () => {
    const m = duplicaModello(modelloPredefinito("referto"), []);
    m.titolo.testo = "Visita di controllo";
    m.sezioni[0].visibile = false;
    applicaAspetto(m, stile("moderno").colore);
    expect(stileProntoDi(m)).toMatchObject({ stile: { id: "moderno" }, variante: "colore" });
    expect(m.pagina.carattere).toBe("lato");
    expect(m.pagina.colore).toBe("#1565c0");
    expect(m.titolo.testo).toBe("Visita di controllo");
    expect(m.sezioni[0].visibile).toBe(false);
    // Cambiato un colore non e' piu' lo stile pronto.
    m.pagina.colore = "#ff0000";
    expect(stileProntoDi(m)).toBeUndefined();
  });

  it("la versione in bianco e nero ha la stessa forma, senza colori", () => {
    for (const st of STILI_PRONTI) {
      expect(st.biancoNero.colore).toBe("nero");
      expect(st.biancoNero.accento).toBe("");
      const { colore: _c, accento: _a, ...formaColore } = st.colore;
      const { colore: _c2, accento: _a2, ...formaBN } = st.biancoNero;
      expect(formaBN).toEqual(formaColore);
      // A colori deve esserci davvero un colore.
      expect(st.colore.colore).not.toBe("nero");
    }
  });

  it("gli stili pronti sono diversi fra loro anche in bianco e nero", () => {
    const forme = new Set(STILI_PRONTI.map((st) => JSON.stringify(st.biancoNero)));
    expect(forme.size).toBe(STILI_PRONTI.length);
  });

  it("gli stili pronti sono modelli validi: la normalizzazione non li cambia", () => {
    for (const st of STILI_PRONTI) {
      for (const v of VARIANTI) {
        const m = duplicaModello(modelloPredefinito("referto"), []);
        applicaAspetto(m, st[v]);
        expect(aspettoDi(normalizzaModello(m)!)).toEqual(st[v]);
      }
    }
  });

  it("copia aspetto, intestazione e firma, e lascia del documento testi, paziente e formato", () => {
    const referto = duplicaModello(modelloPredefinito("referto"), []);
    applicaAspetto(referto, stile("grande").colore);
    referto.intestazione.logo = PNG;
    referto.intestazione.righeAggiuntive = "Iscr. Ordine n. 1";
    referto.firma.posizione = "sinistra";
    const ricetta = duplicaModello(modelloPredefinito("ricetta"), []);
    ricetta.pagina.formato = "A5";
    ricetta.testi.principale = "Rp/";
    copiaAspetto(referto, ricetta);
    expect(aspettoDi(ricetta)).toEqual(aspettoDi(referto));
    expect(ricetta.intestazione.logo).toBe(PNG);
    expect(ricetta.intestazione.righeAggiuntive).toBe("Iscr. Ordine n. 1");
    expect(ricetta.firma.posizione).toBe("sinistra");
    expect(ricetta.firma.luogoData).toBe(true);
    expect(ricetta.pagina.formato).toBe("A5");
    expect(ricetta.testi.principale).toBe("Rp/");
    expect(ricetta.titolo.testo).toBe("Ricetta medica");
    // Una copia vera: cambiare il referto dopo non tocca la ricetta.
    referto.intestazione.righeAggiuntive = "altro";
    expect(ricetta.intestazione.righeAggiuntive).toBe("Iscr. Ordine n. 1");
  });

  it("tiene le forme nuove di intestazione, titolo e sezioni", () => {
    const m = normalizzaModello({
      documento: "referto",
      intestazione: { disposizione: "banda" },
      titolo: { stile: "sinistra" },
      stileSezioni: "centrate",
    })!;
    expect(m.intestazione.disposizione).toBe("banda");
    expect(m.titolo.stile).toBe("sinistra");
    expect(m.stileSezioni).toBe("centrate");
    for (const st of ["punto", "piena"] as const) {
      expect(normalizzaModello({ documento: "ricetta", stileSezioni: st })!.stileSezioni).toBe(st);
    }
    expect(normalizzaModello({ documento: "ricetta", stileSezioni: "a-zigzag" })!.stileSezioni).toBe("fascia");
  });

  it("accetta colori liberi e scarta quelli scritti male", () => {
    const m = normalizzaModello({ documento: "referto", pagina: { colore: "#1565C0", accento: "#EF8A2B" } })!;
    expect(m.pagina.colore).toBe("#1565c0");
    expect(m.pagina.accento).toBe("#ef8a2b");
    const rotto = normalizzaModello({ documento: "referto", pagina: { colore: "#12", accento: "rosso" } })!;
    expect(rotto.pagina.colore).toBe("nero");
    expect(rotto.pagina.accento).toBe("");
    expect(normalizzaModello({ documento: "referto", pagina: { colore: "verde" } })!.pagina.colore).toBe("verde");
  });
});

describe("modelli di stampa: modelli pronti", () => {
  it("ogni stile ha un modello pronto per documento e versione, con un id fisso", () => {
    const ids = new Set<string>();
    for (const d of DOCUMENTI_STAMPA) {
      for (const st of STILI_PRONTI) {
        for (const v of VARIANTI) {
          const m = modelloPronto(st, v, d);
          expect(m.id).toBe(idModelloPronto(st.id, v, d));
          expect(m.documento).toBe(d);
          expect(aspettoDi(m)).toEqual(st[v]);
          expect(prontoDi(m)).toEqual({ stile: st, variante: v });
          expect(eModelloPronto(m)).toBe(true);
          ids.add(m.id);
        }
      }
    }
    expect(ids.size).toBe(DOCUMENTI_STAMPA.length * STILI_PRONTI.length * 2);
  });

  it("Corioli in bianco e nero e' il predefinito, identico", () => {
    expect(modelloPronto(stile("corioli"), "biancoNero", "referto")).toEqual(modelloPredefinito("referto"));
  });

  it("un modello pronto ha i testi del predefinito del suo documento", () => {
    const m = modelloPronto(stile("elegante"), "colore", "ricetta");
    const p = modelloPredefinito("ricetta");
    expect(m.titolo.testo).toBe(p.titolo.testo);
    expect(m.testi).toEqual(p.testi);
    expect(m.paziente.codiceFiscale).toBe(true);
    expect(m.nome).toBe("Elegante a colori");
  });

  it("un modello del medico non e' mai un modello pronto, nemmeno con lo stesso aspetto", () => {
    const mio = duplicaModello(modelloPronto(stile("moderno"), "colore", "referto"), []);
    expect(eModelloPronto(mio)).toBe(false);
    expect(mio.nome).toBe("Il mio modello");
    expect(stileProntoDi(mio)).toMatchObject({ stile: { id: "moderno" } });
  });

  it("si usa ovunque in un colpo: il predefinito toglie la scelta invece di scriverla", () => {
    const mio = duplicaModello(modelloPredefinito("ricetta"), []);
    let a = usaStileProntoOvunque({ modelli: [mio], inUso: { ricetta: mio.id } }, stile("essenziale"), "biancoNero");
    for (const d of DOCUMENTI_STAMPA) {
      expect(modelloInUso(a, d).id).toBe(idModelloPronto("essenziale", "biancoNero", d));
    }
    // Il modello del medico resta in archivio, solo non e' piu' in uso.
    expect(a.modelli).toEqual([mio]);
    a = usaStileProntoOvunque(a, stile("corioli"), "biancoNero");
    expect(a.inUso).toEqual({});
  });

  it("in uso si legge e si conserva: archivio, unione dei backup, tendina di stampa", () => {
    const id = idModelloPronto("moderno", "colore", "referto");
    const a = normalizzaArchivio({ modelli: [], inUso: { referto: id, ricetta: id, certificato: idPredefinito("certificato") } });
    // L'id del referto sulla ricetta non vale: e' di un altro documento.
    expect(a.inUso).toEqual({ referto: id });
    expect(modelloInUso(a, "referto").nome).toBe("Moderno a colori");
    expect(unisciArchivi({ modelli: [], inUso: {} }, a).inUso).toEqual({ referto: id });
    // Nella tendina di stampa c'e' anche la sua versione in bianco e nero, per
    // il giorno che la stampante a colori e' senza inchiostro.
    expect(modelliDelDocumento(a, "referto").map((m) => m.id)).toEqual([
      idPredefinito("referto"), id, idModelloPronto("moderno", "biancoNero", "referto"),
    ]);
    // Con un modello pronto in bianco e nero non si propone il colore.
    const bn = idModelloPronto("elegante", "biancoNero", "ricetta");
    expect(modelliDelDocumento({ modelli: [], inUso: { ricetta: bn } }, "ricetta").map((m) => m.id))
      .toEqual([idPredefinito("ricetta"), bn]);
    // Uno che si spaccia per un modello pronto non entra in archivio.
    expect(normalizzaArchivio({ modelli: [modelloPronto(stile("grande"), "colore", "referto")] }).modelli).toEqual([]);
  });

  it("eliminando il modello in uso si torna allo stile degli altri documenti, se e' uno solo", () => {
    const tutti = usaStileProntoOvunque({ modelli: [], inUso: {} }, stile("moderno"), "colore");
    expect(ripiegoDopoEliminazione(tutti, "referto").id).toBe(idModelloPronto("moderno", "colore", "referto"));
    const misti = { ...tutti, inUso: { ...tutti.inUso, ricetta: idModelloPronto("elegante", "colore", "ricetta") } };
    expect(ripiegoDopoEliminazione(misti, "referto").id).toBe(idPredefinito("referto"));
    expect(ripiegoDopoEliminazione({ modelli: [], inUso: {} }, "referto").id).toBe(idPredefinito("referto"));
  });

  it("il predefinito si chiama come lo stile che e'", () => {
    expect(modelloPredefinito("referto").nome).toBe("Corioli in bianco e nero");
  });
});
