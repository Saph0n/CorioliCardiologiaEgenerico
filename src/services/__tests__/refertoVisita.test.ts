import { describe, expect, it, vi } from "vitest";
import type { Patient, Visit } from "../../types/Storage";

/**
 * Il referto e' il documento che esce dallo studio: finisce dal medico curante
 * e dai colleghi, e le sue regole di composizione arrivano dal cardiologo che
 * lo firma. Sono scelte che si perdono facilmente in un refactor del layout,
 * per questo stanno qui come test e non solo come commento nel codice.
 *
 * Il PDF viene prodotto senza compressione, quindi i testi disegnati si
 * ritrovano in chiaro nel flusso del documento.
 */

vi.mock("../OfflineServices", () => ({
  DoctorService: {
    getDoctor: async () => ({
      nome: "Vincenzo",
      cognome: "Trani",
      specializzazione: "Cardiologia",
      ambulatori: [{ isPrimario: true, nome: "Studio", indirizzo: "Via Garibaldi 14", citta: "Bergamo" }],
    }),
  },
  PreferenceService: { getPreferences: async () => ({}) },
  VisitService: { getVisitsByPatientId: async () => [] },
}));

const { PdfService } = await import("../PdfService");

const paziente: Patient = {
  id: "p1",
  nome: "Mario",
  cognome: "Prova",
  dataNascita: "1950-04-12",
  luogoNascita: "Bergamo",
  sesso: "M",
  altezza: 175,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function visita(contenuto: Partial<NonNullable<Visit["visita"]>>): Visit {
  return {
    id: "v1",
    patientId: "p1",
    dataVisita: "2026-09-07",
    descrizioneClinica: "",
    anamnesi: "",
    esamiObiettivo: "",
    conclusioniDiagnostiche: "",
    terapie: "",
    createdAt: "2026-09-07",
    updatedAt: "2026-09-07",
    visita: {
      problemaClinico: "Cardiopalmo",
      prestazione: "",
      esameObiettivo: "Nei limiti",
      accertamenti: "",
      terapiaSpecifica: "",
      ...contenuto,
    },
  };
}

async function testoDelPdf(v: Visit): Promise<string> {
  const blob = await PdfService.generateVisitPDF(paziente, v);
  expect(blob).toBeDefined();
  return await blob!.text();
}

/**
 * Il referto dal titolo indicato in avanti.
 *
 * Serve quando la stessa parola compare in due punti del foglio per due
 * ragioni diverse: "Ipertensione arteriosa" e' un fattore di rischio fra le
 * variabili cliniche ed e' anche una voce del CHA2DS2-VASc, e solo la seconda
 * il cardiologo non vuole vedere stampata. Nel flusso del PDF il testo sta
 * nell'ordine in cui e' stato disegnato, quindi tagliare al titolo isola la
 * sezione.
 */
function dalTitolo(testo: string, titolo: string): string {
  const i = testo.indexOf(titolo);
  expect(i, `"${titolo}" non compare nel referto`).toBeGreaterThan(-1);
  return testo.slice(i);
}

describe("referto di visita: esami strumentali", () => {
  // I titoli su fascia si scrivono in maiuscolo, ed e' cosi' che si ritrovano
  // nel flusso del PDF: cercarli in minuscolo farebbe passare per vuoto anche
  // un "non contiene".

  it("da' a ogni esame la sua fascia, senza un titolo di gruppo sopra", async () => {
    // Il cardiologo, 11 settembre 2026: via la voce "Esami strumentali", in
    // grigio le singole voci come gia' anamnesi ed esame obiettivo.
    const testo = await testoDelPdf(
      visita({
        ecg: { pr: 180, referto: "Nei limiti" },
        ecocardiogramma: { fe: 60 },
      }),
    );
    expect(testo).not.toContain("ESAMI STRUMENTALI");
    expect(testo).toContain("ELETTROCARDIOGRAMMA");
    expect(testo).toContain("ECOCARDIOGRAMMA");
  });

  it("non stampa la fascia di un esame vuoto", async () => {
    const testo = await testoDelPdf(visita({ holterEcg: { fcMedia: 68 } }));
    expect(testo).toContain("HOLTER");
    expect(testo).not.toContain("ELETTROCARDIOGRAMMA");
  });
});

describe("referto di visita: fibrillazione atriale", () => {
  const conFa = visita({
    pesoCorporeo: 78,
    laboratorio: { creatinina: 1.1 },
    fattoriRischio: { ipertensione: true },
    fibrillazioneAtriale: {
      attivo: true,
      cvScompenso: true,
      referto: "FA permanente, frequenza ben controllata.",
    },
  });

  it("stampa il totale del punteggio", async () => {
    const testo = await testoDelPdf(conFa);
    // Sta sotto "Inquadramento clinico" con lo scompenso e il rischio: li' il
    // cardiologo non ha voluto la fascia per voce ("lascia così", call
    // dell'11 settembre 2026).
    expect(testo).toContain("INQUADRAMENTO CLINICO");
    expect(testo).toContain("Fibrillazione atriale");
    expect(testo).toContain("CHA2DS2-VASc");
    // Eta' 76 (2) + ipertensione (1) + scompenso (1) = 4 su 9.
    expect(testo).toContain("4 / 9");
  });

  it("non stampa le voci che compongono il punteggio", async () => {
    // Le voci sono gia' nella prosa dell'anamnesi: nel referto sono rumore
    // fra il cardiologo e il numero che gli serve.
    //
    // Si guarda dal titolo del modulo in avanti e non tutto il referto:
    // "Ipertensione arteriosa" compare anche fra i fattori di rischio delle
    // variabili cliniche, dove risponde a un'altra domanda — su che base il
    // paziente e' in quella classe di rischio — e dove il cardiologo la
    // vuole. Quello che non deve tornare e' la scomposizione del punteggio.
    const sezione = dalTitolo(await testoDelPdf(conFa), "Fibrillazione atriale");
    expect(sezione).not.toContain("Scompenso cardiaco o disfunzione");
    expect(sezione).not.toContain("Ipertensione arteriosa");
    expect(sezione).not.toContain("Le linee guida legano a questo punteggio");
  });

  it("non stampa forma clinica e terapia anticoagulante", async () => {
    // Sono diagnosi e decisioni: le formula il cardiologo nel testo del modulo.
    const testo = await testoDelPdf(conFa);
    expect(testo).not.toContain("FORMA CLINICA");
    expect(testo).not.toContain("ANTICOAGULAZIONE");
  });

  it("porta accanto al punteggio i dati che decidono la dose del DOAC", async () => {
    const testo = await testoDelPdf(conFa);
    expect(testo).toContain("78 kg");
    expect(testo).toContain("1,1 mg/dL");
    expect(testo).toContain("76 anni");
    expect(testo).toContain("eGFR");
  });

  it("resta fuori dal referto finche' l'interruttore e' spento", async () => {
    // Il caso che il cardiologo ha segnalato: cominciare a compilare il modulo
    // non deve bastare a infilarlo nel referto.
    const testo = await testoDelPdf(
      visita({
        pesoCorporeo: 78,
        laboratorio: { creatinina: 1.1 },
        fibrillazioneAtriale: { cvScompenso: true, hbAlcol: true },
      }),
    );
    // Niente modulo e nient'altro da inquadrare: non si apre neanche il gruppo.
    expect(testo).not.toContain("Fibrillazione atriale");
    expect(testo).not.toContain("INQUADRAMENTO CLINICO");
  });

  it("ristampa le visite salvate prima dell'interruttore", async () => {
    // Senza il campo `attivo` vale il vecchio criterio, altrimenti ristampando
    // un referto d'archivio la sezione sparirebbe.
    const testo = await testoDelPdf(
      visita({ fibrillazioneAtriale: { tipo: "permanente", cvIctus: true } }),
    );
    expect(testo).toContain("Fibrillazione atriale");
  });
});

describe("referto di visita: intestazione", () => {
  /**
   * Il titolo del documento e' centrato sulla fascia grigia.
   *
   * Si misura sul PDF prodotto e non sulla chiamata a `doc.text`, perche' il
   * difetto stava proprio nella differenza fra le due: jsPDF centra usando una
   * larghezza che **non** comprende la spaziatura fra le lettere, quindi
   * "VISITA CARDIOLOGICA" (19 caratteri a 0,7 mm) usciva 6 mm a destra del
   * centro — 65 mm di margine a sinistra contro 52 a destra — mentre chi
   * guardava il codice leggeva `align: "center"` ed era convinto del
   * contrario.
   */
  it("centra il titolo sulla fascia, spaziatura fra le lettere compresa", async () => {
    const PUNTI_PER_MM = 72 / 25.4;
    const TITOLO = "VISITA CARDIOLOGICA";

    const testo = await testoDelPdf(visita({}));
    const i = testo.indexOf(`(${TITOLO}) Tj`);
    expect(i, "il titolo non compare nel flusso del PDF").toBeGreaterThan(-1);

    const prima = testo.slice(0, i);
    const td = [...prima.matchAll(/([\d.]+) ([\d.]+) Td/g)].pop();
    const tc = [...prima.matchAll(/([\d.]+) Tc/g)].pop();
    expect(td, "posizione del titolo non trovata").toBeDefined();
    expect(tc, "spaziatura del titolo non trovata").toBeDefined();

    // La larghezza si rimisura con le metriche del carattere, come fa il PDF:
    // cosi' il test non ripete il calcolo del codice che controlla.
    const { jsPDF } = await import("jspdf");
    const metro = new jsPDF({ unit: "mm", format: "a4" });
    metro.setFont("helvetica", "bold");
    metro.setFontSize(11);

    const spaziatura = Number(tc![1]) / PUNTI_PER_MM;
    const larghezza =
      metro.getTextWidth(TITOLO) + spaziatura * (TITOLO.length - 1);
    const sinistra = Number(td![1]) / PUNTI_PER_MM;
    const destra = sinistra + larghezza;

    // Margini di 18 mm su A4: la fascia va da 18 a 192, centro a 105.
    expect((sinistra + destra) / 2).toBeCloseTo(105, 1);
    expect(sinistra - 18).toBeCloseTo(192 - destra, 1);
  });
});

describe("referto di visita: Doppler TSA", () => {
  it("esce con la sua fascia, come gli altri esami", async () => {
    // Lo referta il chirurgo vascolare, ma il cardiologo lo legge e lo usa:
    // la placca carotidea e' aterosclerosi documentata.
    const testo = await testoDelPdf(
      visita({
        dopplerTsa: {
          imtMax: 1.1,
          stenosiCarotidea: 45,
          sedeStenosi: "bulbo carotideo destro",
          referto: "Placca fibrocalcifica al bulbo destro.",
        },
      }),
    );
    expect(testo).toContain("ECOCOLORDOPPLER DEI TRONCHI SOVRAAORTICI");
    expect(testo).toContain("1,1 mm");
    // La stenosi porta con se' la sede: un 45% senza vaso non e' refertabile.
    // Le parentesi tonde nel flusso del PDF sono protette da una barra
    // rovesciata, quindi si cercano i due pezzi.
    expect(testo).toContain("45%");
    expect(testo).toContain("bulbo carotideo destro");
  });

  it("resta fuori dal referto se il modulo non e' compilato", async () => {
    const testo = await testoDelPdf(visita({ ecg: { pr: 160 } }));
    expect(testo).not.toContain("SOVRAAORTICI");
  });

  it("esce anche con la sola ATS carotidea delle variabili cliniche", async () => {
    // Nella maschera la stenosi si scrive anche dalla colonna del burden
    // aterogeno, dove si chiama "ATS carotidea": e' lo stesso campo, e da solo
    // basta a far comparire il modulo.
    const testo = await testoDelPdf(visita({ dopplerTsa: { stenosiCarotidea: 60 } }));
    expect(testo).toContain("SOVRAAORTICI");
    expect(testo).toContain("60%");
  });
});

describe("referto di visita: misure nuove e tolte", () => {
  it("non stampa piu' la riga del ritmo ECG", async () => {
    const testo = await testoDelPdf(
      visita({ ecg: { ritmo: "Sinusale", pr: 180, referto: "Nei limiti." } }),
    );
    expect(testo).toContain("ELETTROCARDIOGRAMMA");
    expect(testo).toContain("180 ms");
    expect(testo).not.toContain("RITMO");
  });

  it("non stampa piu' l'E/e'", async () => {
    // Il cardiologo lo vuole descritto nel referto testuale: fra le misure
    // restano le sedici da leggere a colpo d'occhio.
    const testo = await testoDelPdf(
      visita({ ecocardiogramma: { rapportoEA: 0.8, rapportoEe: 15 } }),
    );
    expect(testo).toContain("E/A");
    expect(testo).not.toContain("E/e'");
  });

  it("stampa i gradienti transvalvolari aortici", async () => {
    const testo = await testoDelPdf(
      visita({
        ecocardiogramma: {
          fe: 60,
          gradienteAorticoMedio: 42,
          gradienteAorticoMassimo: 68,
        },
      }),
    );
    expect(testo).toContain("42 mmHg");
    expect(testo).toContain("68 mmHg");
    // Senza valori mitralici le due celle non occupano posto.
    expect(testo).not.toContain("Grad. Mitr.");
  });

  it("stampa l'area valvolare aortica", async () => {
    const testo = await testoDelPdf(
      visita({ ecocardiogramma: { areaValvolareAortica: 0.9 } }),
    );
    expect(testo).toContain("AVA");
    // Il "²" nel flusso del PDF e' un byte WinAnsi, non UTF-8: letto come
    // testo non si riconosce, e il controllo si ferma prima.
    expect(testo).toContain("0,9 cm");
  });

  it("stampa i gradienti transvalvolari mitralici", async () => {
    const testo = await testoDelPdf(
      visita({
        ecocardiogramma: {
          gradienteMitralicoMedio: 7,
          gradienteMitralicoMassimo: 15,
        },
      }),
    );
    expect(testo).toContain("Grad. Mitr. medio");
    expect(testo).toContain("7 mmHg");
    expect(testo).toContain("15 mmHg");
  });

  it("stampa fibrinogeno e HOMA-IR", async () => {
    // Il profilo infiammatorio si e' allargato al fibrinogeno, e l'HOMA era
    // calcolato nella maschera ma non usciva nel referto.
    const testo = await testoDelPdf(
      visita({ laboratorio: { fibrinogeno: 380, glicemia: 102, insulina: 12 } }),
    );
    expect(testo).toContain("Fibrinogeno");
    expect(testo).toContain("380 mg/dL");
    expect(testo).toContain("HOMA-IR");
    // 102 x 12 / 405 = 3,02: il numero e basta, la fascia la legge il medico.
    // Con la virgola, come lo formatta `cardioCalcs`: cercando "3.02" il test
    // passava per caso, trovandolo dentro una coordinata del flusso del PDF.
    expect(testo).toContain("3,02");
    expect(testo).not.toContain("insulino-resistenza");
  });

  it("stampa hs-PCR e LDL ossidate", async () => {
    const testo = await testoDelPdf(
      visita({ laboratorio: { hsPcr: 2.4, oxLdl: 78 } }),
    );
    expect(testo).toContain("2,4 mg/L");
    expect(testo).toContain("78 U/L");
  });

  it("della TC stampa solo calcium score, CAD-RADS e burden", async () => {
    // Tre numeri e nient'altro: il resto del modulo serve agli studi e resta
    // nella maschera anche quando e' compilato.
    const testo = await testoDelPdf(
      visita({
        tcCoronarica: {
          dataEsame: "2026-05-04",
          struttura: "Radiodiagnostica",
          metodica: "TC 128 strati",
          cacScore: 460,
          cadRads: "3",
          cadRadsModificatori: ["HRP"],
          burdenPlacca: "P3",
          componenteCalcifica: 70,
          componenteNonCalcifica: 30,
          stenosiMassima: 55,
          stenosiMassimaSegmento: 7,
          segmenti: [1, 2, 7],
          ffrCt: 0.78,
        },
      }),
    );
    // Fra parentesi, cioe' come stringa di testo del PDF: un "460" nudo si
    // trova anche fra le coordinate del flusso.
    expect(testo).toContain("Calcium score");
    expect(testo).toContain("(460)");
    expect(testo).toContain("(CAD-RADS 3 / HRP)");
    expect(testo).toContain("(P3)");
    for (const assente of [
      "Data esame", "Struttura", "Metodica", "Radiodiagnostica",
      "fibrolipidica", "Stenosi massima", "Segmenti con placca", "FFR-TC",
    ]) {
      expect(testo).not.toContain(assente);
    }
  });
});

describe("referto di visita: impaginazione da referto ospedaliero", () => {
  // Un referto lungo abbastanza da andare a capo pagina: serve per verificare
  // numerazione e riga di identificazione, che su una pagina sola non si
  // vedrebbero mai.
  const lungo = visita({
    esameObiettivo: "Nei limiti. ".repeat(700),
    terapiaSpecifica: "Si conferma la terapia in atto.",
    ecg: { pr: 180, referto: "ECG nei limiti." },
  });

  it("numera le pagine con il totale", async () => {
    // Il totale non e' fissato nel test: dipende da quanto testo entra in una
    // pagina e cambia a ogni ritocco dell'interlinea. Quello che deve reggere
    // e' che la numerazione ci sia su tutte le pagine, che il totale sia lo
    // stesso ovunque e che i numeri vadano in ordine.
    const testo = await testoDelPdf(lungo);
    const numeri = [...testo.matchAll(/Pagina (\d+) di (\d+)/g)];
    expect(numeri.length).toBeGreaterThan(1);
    const totale = numeri[0][2];
    expect(numeri.map((m) => m[2])).toEqual(numeri.map(() => totale));
    expect(numeri.map((m) => m[1])).toEqual(numeri.map((_, i) => String(i + 1)));
    expect(numeri.length).toBe(Number(totale));
  });

  it("ripete l'identita' del paziente dalla seconda pagina", async () => {
    // Un foglio che si stacca dalla graffetta deve restare attribuibile.
    const testo = await testoDelPdf(lungo);
    expect(testo).toContain("nato il 12/04/1950");
    expect(testo).toContain("visita del");
  });

  it("non chiude con il blocco firma", async () => {
    // Tolto su richiesta del cardiologo: il referto finisce sulle conclusioni.
    // Luogo e data in calce sono l'unica stringa che appartiene solo a quel
    // blocco — il nome del medico compare anche nell'intestazione.
    const testo = await testoDelPdf(lungo);
    expect(testo).not.toContain("Bergamo, 07/09/2026");
  });

  it("porta la firma dell'applicazione nel piede", async () => {
    const testo = await testoDelPdf(lungo);
    expect(testo).toContain("Creato con Corioli");
  });

  it("numera anche il referto di una pagina sola", async () => {
    // "Pagina 1 di 1" e' il modo in cui un foglio dichiara di essere intero:
    // senza, chi lo riceve non sa se ne manca un altro.
    const testo = await testoDelPdf(visita({}));
    expect(testo).toContain("Pagina 1 di 1");
  });

  it("porta l'autore del referto sulle pagine dopo la prima", async () => {
    // La carta intestata sta sulla prima pagina soltanto: un foglio che si
    // stacca era attribuibile al paziente ma non a chi lo ha scritto.
    const testo = await testoDelPdf(lungo);
    const occorrenze = testo.split("Dott. Vincenzo Trani").length - 1;
    expect(occorrenze).toBeGreaterThan(1);
  });

  it("dice quando e' stata stampata questa copia", async () => {
    // La visita si puo' correggere e il referto ristampare: due copie della
    // stessa visita sono due fogli diversi, e devono poterlo dire.
    const testo = await testoDelPdf(visita({}));
    expect(testo).toContain("Emesso il");
    expect(testo).toContain("rif. v1");
  });

  it("si presenta con un titolo nelle proprieta' del file", async () => {
    // Il referto finisce in archivi e allegati di posta: senza proprieta' e'
    // un documento senza titolo che nessuna ricerca trova.
    const testo = await testoDelPdf(visita({}));
    expect(testo).toContain("Referto di visita cardiologica");
    expect(testo).toContain("PROVA Mario");
  });
});

describe("referto di visita: inquadramento clinico", () => {
  it("raccoglie i tre inquadramenti sotto un titolo solo", async () => {
    // Scompenso, fibrillazione e rischio non sono esami: sono le conclusioni
    // che il cardiologo trae dopo averli letti. Gli esami hanno perso il loro
    // gruppo l'11 settembre 2026, questi no: "lascia così".
    const testo = await testoDelPdf(
      visita({
        scompenso: { nyha: "II" },
        categoriaRischioCv: "alto",
        laboratorio: { colesteroloTotale: 240, hdl: 40, trigliceridi: 150 },
      }),
    );
    expect(testo.split("INQUADRAMENTO CLINICO").length - 1).toBe(1);
    expect(testo).toContain("Scompenso cardiaco");
    expect(testo).toContain("Rischio cardiovascolare");
  });

  it("non apre il gruppo quando non c'e' niente da inquadrare", async () => {
    const testo = await testoDelPdf(visita({ ecg: { pr: 160 } }));
    expect(testo).not.toContain("INQUADRAMENTO CLINICO");
  });
});

describe("referto di visita: fattori di rischio dichiarati", () => {
  it("stampa le premesse da cui discende la classe di rischio", async () => {
    // La classe non si calcola: la attribuisce il medico guardando queste
    // caselle. Stampare "Rischio molto alto" senza di loro chiede al curante
    // di crederci sulla parola.
    const testo = await testoDelPdf(
      visita({
        categoriaRischioCv: "molto-alto",
        fattoriRischio: {
          ipertensione: true,
          dislipidemia: true,
          eventoCvPregresso: true,
        },
      }),
    );
    expect(testo).toContain("FATTORI DI RISCHIO");
    expect(testo).toContain("Ipertensione arteriosa");
    expect(testo).toContain("Dislipidemia");
    expect(testo).toContain("Pregresso evento cardiovascolare");
    // Le caselle non spuntate restano fuori: il referto dice quello che c'e'.
    expect(testo).not.toContain("Sedentarieta'");
  });

  it("tiene il fumo fra i fattori e non fra i parametri vitali", async () => {
    // Il fumo non e' mai stato un segno vitale, ed era anche l'unico fattore
    // di rischio che usciva nel referto mentre gli altri sette restavano
    // nella maschera.
    // Con la frequenza, perche' la colonna dei parametri vitali ci sia: vuota
    // non si stampa.
    const testo = await testoDelPdf(
      visita({ fumatore: "no", frequenzaCardiaca: "72" }),
    );
    const vitali = testo.slice(
      testo.indexOf("PARAMETRI VITALI"), testo.indexOf("FATTORI DI RISCHIO"),
    );
    expect(vitali).not.toContain("Fumo");
    expect(dalTitolo(testo, "FATTORI DI RISCHIO")).toContain("Fumo");
  });
});

describe("referto di visita: immagini allegate", () => {
  it("le stampa dopo le conclusioni", async () => {
    // Stavano prima, e con quattro allegati la sezione che il curante cerca
    // per prima finiva dietro una galleria.
    const blob = await PdfService.generateVisitPDF(
      paziente,
      visita({
        terapiaSpecifica: "Si conferma la terapia in atto.",
        immagini: ["data:image/png;base64,iVBORw0KGgo="],
      }),
      { includeImages: true },
    );
    const testo = await blob!.text();
    expect(testo).toContain("IMMAGINI ALLEGATE");
    expect(testo.indexOf("IMMAGINI ALLEGATE")).toBeGreaterThan(
      testo.indexOf("CONCLUSIONI E TERAPIA"),
    );
  });

  it("numera le figure per poterle citare", async () => {
    const blob = await PdfService.generateVisitPDF(
      paziente,
      visita({ immagini: ["data:image/png;base64,iVBORw0KGgo="] }),
      { includeImages: true },
    );
    expect(await blob!.text()).toContain("Fig. 1");
  });
});

describe("referto di visita: caratteri stampabili", () => {
  it("non lascia passare il maggiore-uguale nel referto", async () => {
    // Il caso segnalato dal cardiologo: un carattere fuori dalla codifica del
    // font faceva ripiegare jsPDF su UTF-16, il testo usciva illeggibile e la
    // riga sconfinava oltre il margine. Il maggiore-uguale e' dappertutto
    // nelle soglie, dalle fasce Agatston ai fenotipi dello scompenso.
    const testo = await testoDelPdf(
      visita({
        tcCoronarica: { cacScore: 460 },
        ecocardiogramma: { fe: 55 },
        scompenso: { nyha: "II", ntProBnp: 450, contestoBnp: "ambulatoriale" },
      }),
    );
    expect(testo).not.toContain("\u2265");
    expect(testo).not.toContain("\u2264");
  });

  it("non produce stringhe a due byte", async () => {
    // Il segnale della ricaduta su UTF-16: la stringa di testo del PDF si apre
    // con un byte nullo. E' quello che rompeva anche l'andata a capo.
    const blob = await PdfService.generateVisitPDF(
      paziente,
      visita({
        tcCoronarica: { cacScore: 460, cadRads: "4B" },
        scompenso: { nyha: "II", ntProBnp: 450 },
      }),
    );
    const grezzo = new Uint8Array(await blob!.arrayBuffer());
    for (let i = 1; i < grezzo.length; i++) {
      if (grezzo[i - 1] === 0x28 && grezzo[i] === 0x00) {
        throw new Error(`stringa UTF-16 nel PDF alla posizione ${i}`);
      }
    }
  });
});

describe("referto di visita: rischio cardiovascolare", () => {
  it("stampa la classe dichiarata e l obiettivo che ne discende", async () => {
    const testo = await testoDelPdf(
      visita({
        categoriaRischioCv: "molto-alto",
        laboratorio: { colesteroloTotale: 280, hdl: 38, trigliceridi: 260, apoB: 140 },
      }),
    );
    expect(testo).toContain("INQUADRAMENTO CLINICO");
    expect(testo).toContain("Rischio cardiovascolare");
    expect(testo).toContain("Rischio molto alto");
    // L'obiettivo della classe e il valore del paziente, entrambi stampati.
    expect(testo).toContain("55 mg/dL");
    expect(testo).toContain("190 mg/dL");
    // La distanza fra i due non si scrive piu'. C'era, ed era stata chiesta dal
    // cardiologo; e' uscita con tutte le altre letture che l'app aggiungeva ai
    // valori, perche' il referto lo legge un medico che ha davanti i due numeri
    // e il grassetto che dice se il paziente e' fuori.
    expect(testo).not.toContain("sopra l'obiettivo");
  });

  it("senza classe dichiarata non inventa un obiettivo", async () => {
    // La classe la attribuisce il medico: un obiettivo lipidico senza la classe
    // da cui deriva sarebbe un numero senza motivo.
    const testo = await testoDelPdf(
      visita({ laboratorio: { colesteroloTotale: 280, hdl: 38 } }),
    );
    expect(testo).not.toContain("OBIETTIVO LDL");
  });

  it("conserva la sintesi del medico anche senza classe", async () => {
    const testo = await testoDelPdf(
      visita({ sintesiRischio: "Prevenzione secondaria." }),
    );
    expect(testo).toContain("Prevenzione secondaria.");
  });
});

/**
 * Con che carattere e' scritta una stringa nel PDF.
 *
 * Il grassetto nel referto non e' decorazione: dice "questo valore e' fuori dai
 * limiti". Serve poterlo verificare, perche' e' esattamente il tipo di regola
 * che un refactor del layout riporta a "tutto in grassetto" senza che nessun
 * test se ne accorga.
 *
 * Nel flusso del PDF il carattere si sceglie con `/F<n>`, e la corrispondenza
 * fra quel nome e il font vero sta nel dizionario dei font del documento.
 */
async function carattereDi(v: Visit, testo: string): Promise<string> {
  const blob = await PdfService.generateVisitPDF(paziente, v);
  const pdf = await blob!.text();

  // /F2 rimanda a un oggetto, e l'oggetto dice qual e' il font vero.
  const oggetti = new Map<string, string>();
  for (const m of pdf.matchAll(
    /(\d+)\s+0\s+obj\s*<<\s*\/Type\s*\/Font\s*\/BaseFont\s*\/([\w-]+)/g,
  )) {
    oggetti.set(m[1], m[2]);
  }
  const fonti = new Map<string, string>();
  for (const m of pdf.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
    fonti.set(m[1], oggetti.get(m[2]) ?? "");
  }

  const posizione = pdf.indexOf(`(${testo})`);
  expect(posizione, `"${testo}" non compare nel referto`).toBeGreaterThan(-1);

  const prima = pdf.slice(0, posizione);
  const scelte = [...prima.matchAll(/\/(F\d+)\s+[\d.]+\s+Tf/g)];
  const ultima = scelte[scelte.length - 1]?.[1] ?? "";
  return fonti.get(ultima) ?? ultima;
}

describe("referto di visita: il grassetto segnala i valori fuori norma", () => {
  it("mette in grassetto una pressione da ipertensione", async () => {
    const carattere = await carattereDi(
      visita({ pressioneArteriosa: "150/85" }),
      "150/85 mmHg",
    );
    expect(carattere).toContain("Bold");
  });

  it("lascia in tondo una pressione normale", async () => {
    const carattere = await carattereDi(
      visita({ pressioneArteriosa: "120/80" }),
      "120/80 mmHg",
    );
    expect(carattere).not.toContain("Bold");
  });

  it("distingue i valori nello stesso referto", async () => {
    // Glicemia alterata e TSH nella norma, fianco a fianco nella stessa
    // tabella: se il grassetto tornasse a essere lo stile di tutti i valori,
    // questo test cadrebbe.
    const v = visita({ laboratorio: { glicemia: 140, tsh: 2.1 } });
    expect(await carattereDi(v, "140 mg/dL")).toContain("Bold");
    expect(await carattereDi(v, "2,1 mU/L")).not.toContain("Bold");
  });
});

describe("referto di visita: nessun giudizio accanto al valore", () => {
  it("stampa l'NT-proBNP senza la lettura della soglia", async () => {
    // Il grassetto e' l'unico segnale: "210 pg/mL (Sopra la soglia di
    // esclusione)" diceva a parole quello che il grassetto dice da solo, e la
    // soglia la legge il cardiologo nel testo del modulo. Stessa regola della
    // pressione, che non porta scritto "iperteso", e del calcium score, che
    // non porta la sua fascia.
    const testo = await testoDelPdf(
      visita({ scompenso: { ntProBnp: 210, contestoBnp: "ambulatoriale" } }),
    );
    expect(testo).toContain("210 pg/mL");
    expect(testo).not.toContain("Sopra la soglia di esclusione");
  });

  it("non spiega le soglie e non indica il passo successivo", async () => {
    // Le note che l'app scriveva sotto la tabella dello scompenso uscivano
    // nello stesso carattere della prosa del cardiologo, e niente diceva che
    // non le aveva scritte lui. Il referto lo legge un medico.
    const testo = await testoDelPdf(
      visita({
        ecocardiogramma: { fe: 45 },
        scompenso: { ntProBnp: 210, contestoBnp: "ambulatoriale" },
      }),
    );
    expect(testo).toContain("Scompenso cardiaco");
    expect(testo).not.toContain("prosegue con l'ecocardiogramma");
    expect(testo).not.toContain("ESC 2021");
    expect(testo).not.toContain("non va sospesa in automatico");
    expect(testo).not.toContain("il fenotipo richiede un ecocardiogramma");
  });

  it("stampa l'eGFR senza lo stadio KDIGO", async () => {
    const testo = await testoDelPdf(visita({ laboratorio: { creatinina: 1.2 } }));
    // Nel flusso del PDF le parentesi dell'etichetta sono protette da una
    // barra rovesciata, quindi si cerca la sola sigla.
    expect(testo).toContain("eGFR");
    // Nel flusso del PDF le parentesi dentro una stringa disegnata sono
    // protette da una barra rovesciata: se lo stadio tornasse accanto al
    // valore, il documento conterrebbe `\(G`. Si controlla quello e non il
    // numero, che dipende dall'eta' del paziente e cambia con gli anni.
    expect(testo).not.toContain("\\(G");
  });
});

describe("referto di visita: cognome e nome", () => {
  it("scrive il cognome in maiuscolo per distinguerlo dal nome", async () => {
    // Scritti allo stesso modo non si capisce quale sia quale, e su un referto
    // che arriva sulla scrivania di qualcun altro e la prima cosa che si legge.
    const testo = await testoDelPdf(visita({}));
    expect(testo).toContain("PROVA Mario");
    expect(testo).not.toContain("Prova Mario");
  });
});

describe("referto di visita: nomi lunghi", () => {
  it("non tronca un cognome lungo", async () => {
    // La cella dell anagrafica e larga una colonna su quattro: un cognome
    // lungo ci finiva dentro tagliato, senza che niente lo segnalasse.
    const lungo = {
      ...paziente,
      cognome: "Vandenbroucke Della Rovere",
      nome: "Massimiliano Alessandro",
    };
    const blob = await PdfService.generateVisitPDF(lungo, visita({}));
    const testo = await blob!.text();
    // Il PDF spezza le righe: si controlla che ci sia ogni pezzo del nome.
    for (const pezzo of ["VANDENBROUCKE", "ROVERE", "Massimiliano", "Alessandro"]) {
      expect(testo, pezzo + " manca dal referto").toContain(pezzo);
    }
  });

  it("manda a capo il campo accanto invece di stringere il nome", async () => {
    // Con il nome che occupa due colonne, la data della visita scende: deve
    // esserci comunque.
    const lungo = {
      ...paziente,
      cognome: "Vandenbroucke Della Rovere",
      codiceFiscale: "VNDMSS50D12A794K",
    };
    const blob = await PdfService.generateVisitPDF(lungo, visita({}));
    const testo = await blob!.text();
    expect(testo).toContain("Data visita");
    expect(testo).toContain("Codice fiscale");
  });
});

describe("referto di visita: pressione arteriosa", () => {
  it("ha la sua fascia prima dell'elettrocardiogramma", async () => {
    // Call dell'11 settembre 2026: "fammi una voce pressione come
    // elettrocardiogramma", al posto della riga fra i parametri vitali.
    const testo = await testoDelPdf(
      visita({ pressioneArteriosa: "135/85", ecg: { pr: 160 } }),
    );
    expect(testo).toContain("PRESSIONE ARTERIOSA");
    expect(testo.indexOf("PRESSIONE ARTERIOSA")).toBeLessThan(
      testo.indexOf("ELETTROCARDIOGRAMMA"),
    );
    expect(testo).toContain("(135/85 mmHg)");
  });

  it("non la ripete fra i parametri vitali", async () => {
    const testo = await testoDelPdf(
      visita({ pressioneArteriosa: "135/85", frequenzaCardiaca: "72" }),
    );
    expect(testo).toContain("PARAMETRI VITALI");
    expect(testo).not.toContain("P.A.:");
  });

  it("dice la posizione di ogni misurazione", async () => {
    const testo = await testoDelPdf(
      visita({
        pressioneArteriosa: "130/80",
        pressioneArteriosa2: "105/65",
        posizionePa2: "orto",
      }),
    );
    expect(testo).toContain("Clinostatismo");
    expect(testo).toContain("Ortostatismo");
    expect(testo).toContain("(105/65 mmHg)");
  });

  it("senza posizione dichiarata la prima e' in clinostatismo", async () => {
    // Come la maschera la presenta: tutte le visite misurano in clinostatismo,
    // l'ortostatismo e' la seconda misurazione, quando serve.
    const testo = await testoDelPdf(visita({ pressioneArteriosa: "130/80" }));
    expect(testo).toContain("Clinostatismo");
    expect(testo).not.toContain("Ortostatismo");
  });

  it("senza pressione la sezione non c'e'", async () => {
    const testo = await testoDelPdf(visita({ ecg: { pr: 160 } }));
    expect(testo).not.toContain("PRESSIONE ARTERIOSA");
  });
});

describe("referto di visita: intestazione", () => {
  it("porta la specializzazione sotto il nome del medico", async () => {
    // Tolta perche' ripeteva il titolo, rimessa su richiesta del cardiologo:
    // con due specialita' dice qualcosa che il titolo non dice.
    const testo = await testoDelPdf(visita({}));
    expect(testo).toContain("(Cardiologia)");
  });
});

describe("referto di visita: variabili cliniche", () => {
  it("non stampa l'intestazione di una colonna vuota", async () => {
    // Con la pressione nella sua sezione, una visita senza frequenza lasciava
    // "PARAMETRI VITALI" sopra il nulla.
    const testo = await testoDelPdf(visita({ fumatore: "no" }));
    expect(testo).toContain("FATTORI DI RISCHIO");
    expect(testo).not.toContain("PARAMETRI VITALI");
  });
});

describe("referto di visita: azotemia", () => {
  it("la stampa con gli ematochimici", async () => {
    const testo = await testoDelPdf(
      visita({ laboratorio: { uricemia: 6.1, azotemia: 42 } }),
    );
    expect(testo).toContain("Azotemia");
    expect(testo).toContain("42 mg/dL");
  });
});

describe("referto di visita: ordine delle sezioni", () => {
  // Chiesto dal cardiologo il 22 settembre 2026, sulle visite d'esempio che
  // aveva mandato: ematochimici dopo l'anamnesi e prima della terapia in
  // atto, esame obiettivo dopo pressione ed ECG.
  it("segue l'ordine delle visite d'esempio del cardiologo", async () => {
    const testo = await testoDelPdf(
      visita({
        prestazione: "Ipertensione arteriosa nota da anni.",
        laboratorio: { colesteroloTotale: 210 },
        terapiaInAtto: "Ramipril 5 mg una compressa al mattino.",
        pressioneArteriosa: "135/85",
        ecg: { pr: 160 },
        ecocardiogramma: { fe: 60 },
      }),
    );
    const ordine = [
      "ANAMNESI",
      "MOTIVO DELLA VISITA",
      "ESAMI EMATOCHIMICI",
      "TERAPIA IN ATTO",
      "PRESSIONE ARTERIOSA",
      "ELETTROCARDIOGRAMMA",
      "ESAME OBIETTIVO",
      "ECOCARDIOGRAMMA",
    ].map((titolo) => {
      const i = testo.indexOf(titolo);
      expect(i, `"${titolo}" non compare nel referto`).toBeGreaterThan(-1);
      return i;
    });
    expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
  });

  it("stampa la terapia in atto", async () => {
    const testo = await testoDelPdf(
      visita({ terapiaInAtto: "Bisoprololo 2,5 mg" }),
    );
    expect(dalTitolo(testo, "TERAPIA IN ATTO")).toContain("Bisoprololo 2,5 mg");
  });

  it("senza terapia in atto la sezione non c'e'", async () => {
    const testo = await testoDelPdf(visita({}));
    expect(testo).not.toContain("TERAPIA IN ATTO");
  });
});

describe("referto di visita: sesso non indicato", () => {
  // Fino al 22 settembre 2026 un paziente senza scelta veniva salvato come
  // maschio: il referto stampava "Maschile" come se fosse stato raccolto.
  const senzaSesso: Patient = { ...paziente, sesso: undefined };

  it("non stampa la voce sesso quando non e' indicato", async () => {
    const blob = await PdfService.generateVisitPDF(senzaSesso, visita({}));
    const testo = await blob!.text();
    expect(testo).not.toContain("Maschile");
    expect(testo).not.toContain("Femminile");
  });

  it("nella riga di identita' non sceglie nato o nata", async () => {
    // La riga di identificazione compare dalla seconda pagina: serve un
    // referto che vada a capo pagina, se no non si vedrebbe mai.
    const blob = await PdfService.generateVisitPDF(
      senzaSesso,
      visita({ esameObiettivo: "Nei limiti. ".repeat(700) }),
    );
    const testo = await blob!.text();
    expect(testo).toContain("nato/a il 12/04/1950");
  });

  it("con il sesso indicato la voce c'e'", async () => {
    const testo = await testoDelPdf(visita({}));
    expect(testo).toContain("Maschile");
  });
});

describe("referto di visita: grassetto scritto dal medico", () => {
  // Chiesto il 22 settembre 2026: poter far risaltare qualcosa mentre si
  // scrive. I campi restano testo semplice e il risalto si segna con `**`,
  // come nei messaggi; sul foglio diventa grassetto.
  it("stampa in grassetto il tratto fra i marcatori", async () => {
    const v = visita({ esameObiettivo: "Soffio **sistolico 3/6** sul focolaio" });
    expect(await carattereDi(v, "sistolico")).toContain("Bold");
  });

  it("lascia in tondo il resto della frase", async () => {
    const v = visita({ esameObiettivo: "Soffio **sistolico 3/6** sul focolaio" });
    expect(await carattereDi(v, "focolaio")).not.toContain("Bold");
  });

  it("non stampa i marcatori", async () => {
    const testo = await testoDelPdf(
      visita({ esameObiettivo: "Soffio **sistolico** sul focolaio" }),
    );
    expect(dalTitolo(testo, "ESAME OBIETTIVO")).not.toContain("**");
  });

  it("un marcatore spaiato resta testo", async () => {
    // Chi scrive "vedi ** nota" non stava chiedendo il grassetto.
    const testo = await testoDelPdf(visita({ esameObiettivo: "vedi ** nota" }));
    expect(dalTitolo(testo, "ESAME OBIETTIVO")).toContain("**");
  });
});

describe("referto di visita: separatore decimale", () => {
  it("stampa i valori scritti dal medico con la virgola, come a schermo", async () => {
    // Prima uscivano col punto ("1.2 mg/dL") accanto ai valori calcolati con
    // la virgola ("CT / HDL 5,0"), nella stessa tabella.
    const testo = await testoDelPdf(
      visita({ laboratorio: { creatinina: 1.2, emoglobina: 14.2, colesteroloTotale: 210, hdl: 42 } }),
    );
    expect(testo).toContain("1,2 mg/dL");
    expect(testo).toContain("14,2 g/dL");
    expect(testo).not.toContain("1.2 mg/dL");
    expect(testo).not.toContain("14.2 g/dL");
  });

  it("lascia com'e' la prosa scritta dal medico", async () => {
    const testo = await testoDelPdf(visita({ esameObiettivo: "Versione 1.2 del protocollo" }));
    expect(testo).toContain("Versione 1.2 del protocollo");
  });
});

describe("referto di visita: salti pagina", () => {
  it("il controllo degli orfani non allunga il referto di prova", async () => {
    // Il cardiologo aveva chiesto meno pagine ("se no ci fa 3 pagine"): tenere
    // insieme le righe delle tabelle non deve costare un foglio. Il referto di
    // prova sta in quattro pagine, e ci resta.
    const { pazienteDiProva, visitaDiProva } = await import("./refertoDiProva");
    const blob = await PdfService.generateVisitPDF(pazienteDiProva, visitaDiProva);
    const testo = await blob!.text();
    const pagine = testo.match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;
    expect(pagine).toBe(4);
  });
});
