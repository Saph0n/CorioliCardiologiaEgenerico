/**
 * Modelli predefiniti della visita riscritti dopo essere stati seminati.
 *
 * Il seme dei predefiniti (`StorageServiceFallback.getTemplates`) aggiunge i
 * modelli nuovi ma non tocca quelli gia' in archivio: un testo corretto in
 * `medicalTemplates.ts` non arriverebbe a chi ha l'app installata. Con questo
 * elenco arriva, ma **solo a chi non ha toccato il modello**: il testo salvato
 * deve essere ancora quello di prima (anche con gli accenti gia' corretti).
 * Se il medico l'ha riscritto a modo suo, resta il suo.
 *
 * Revisione del 28 settembre 2026:
 * - le conclusioni non cominciano piu' con "Conclusioni:": il referto stampa
 *   gia' il titolo "Conclusioni e terapia", e usciva due volte;
 * - l'anamnesi non ripete la terapia, che dal 22 settembre ha la sua sezione
 *   ("Terapia in atto", riportata dall'ultima visita) e usciva due volte;
 * - i modelli della TC coronarica tornano nella visita (tolti l'8 settembre
 *   su richiesta del cardiologo, rimessi su richiesta di Pablo) ma senza
 *   calcium score e CAD-RADS, che il referto stampa gia' dai campi, e senza
 *   data e struttura dell'esame, che il cardiologo ha tolto dal referto.
 */

export interface ModelloPrecedente {
  section: string;
  label: string;
  /** Il testo com'era stato seminato. */
  vecchio: string;
}

/** Predefiniti con un testo nuovo in `medicalTemplates.ts` (stessa etichetta). */
export const MODELLI_RISCRITTI: readonly ModelloPrecedente[] = [
  {
    section: "prestazione",
    label: "Anamnesi cardiologica standard",
    vecchio:
      "Nega precedenti eventi cardiovascolari maggiori.\nNega angina da sforzo, dispnea, cardiopalmo, sincopi o lipotimie.\nNega ipertensione arteriosa nota, diabete mellito, dislipidemia.\nNega familiarità per cardiopatia ischemica precoce.\nNega fumo e abuso alcolico. Attività fisica regolare.\nNon terapie in corso.",
  },
  {
    section: "prestazione",
    label: "Cardiopatia ischemica nota",
    vecchio:
      "Cardiopatia ischemica nota: ___ (IMA / angina stabile) in data ___.\nSottoposto a ___ (coronarografia, PTCA con stent su ___, bypass) in data ___.\nTerapia in atto: antiaggregante ___, statina ___, betabloccante ___, ACE-inibitore/sartano ___.\nAttualmente asintomatico per angor, classe CCS ___.\nUltimo controllo strumentale: ___.",
  },
  {
    section: "conclusioni",
    label: "Quadro nella norma — controllo periodico",
    vecchio:
      "Conclusioni: quadro cardiologico clinico e strumentale nei limiti di norma.\nSi consiglia controllo cardiologico a distanza di 12 mesi o prima in caso di comparsa di sintomi.\nSi raccomanda il mantenimento di uno stile di vita corretto: attività fisica aerobica regolare, dieta iposodica e mediterranea, astensione dal fumo, controllo del peso corporeo.",
  },
  {
    section: "conclusioni",
    label: "Prosecuzione della terapia in atto",
    vecchio:
      "Conclusioni: quadro clinico stabile, in buon compenso con la terapia in atto.\nSi consiglia di proseguire la terapia domiciliare senza modifiche.\nControllo clinico ed ecocardiografico tra ___ mesi, con esami ematochimici (assetto lipidico, funzione renale ed elettroliti) da eseguire prima del controllo.",
  },
  {
    section: "conclusioni",
    label: "Ottimizzazione della terapia",
    vecchio:
      "Conclusioni: ___.\nSi modifica la terapia come da prescrizione allegata.\nSi raccomanda automisurazione domiciliare di pressione arteriosa e frequenza cardiaca due volte al giorno, con annotazione dei valori su diario da portare al controllo.\nControllo di funzione renale ed elettroliti a 15 giorni dall'inizio della nuova terapia.\nRivalutazione clinica tra ___.",
  },
  {
    section: "conclusioni",
    label: "Approfondimento di secondo livello",
    vecchio:
      "Conclusioni: il quadro clinico rende opportuno un approfondimento diagnostico.\nSi richiede ___ (test ergometrico / ECG dinamico secondo Holter / monitoraggio pressorio delle 24 ore / TC coronarica).\nSi rivaluterà il paziente alla luce dei referti; si raccomanda di riportare tutta la documentazione al controllo.",
  },
  {
    section: "conclusioni",
    label: "Stratificazione del rischio cardiovascolare",
    vecchio:
      "Conclusioni: fattori di rischio cardiovascolare rilevati: ___.\nGli indici calcolati in cartella sono riportati a titolo di supporto e vanno letti nel contesto clinico complessivo.\nSi consiglia ___ (correzione dello stile di vita / terapia ipolipemizzante / rivalutazione a ___ mesi) secondo le raccomandazioni ESC vigenti.",
  },
  {
    section: "tcCoronarica",
    label: "TC coronarica negativa",
    vecchio:
      "Esame eseguito presso ___ in data ___.\nCalcium score (Agatston) pari a ___.\nAlbero coronarico ad origine e decorso regolari, senza placche emodinamicamente significative.\nCAD-RADS ___.\nConclusioni del radiologo: ___.",
  },
  {
    section: "tcCoronarica",
    label: "TC coronarica con placche",
    vecchio:
      "Esame eseguito presso ___ in data ___.\nCalcium score (Agatston) pari a ___.\nPlacca ___ (calcifica / mista / non calcifica) a carico di ___, con stenosi stimata del ___%.\nCAD-RADS ___.\nConclusioni del radiologo: ___.\nSi programma ___ (ottimizzazione terapia / test funzionale / coronarografia).",
  },
];
