export const MedicalTemplates = {
  visita: {
    prestazione: [
      {
        label: "Anamnesi cardiologica standard",
        text: "Nega precedenti eventi cardiovascolari maggiori.\nNega angina da sforzo, dispnea, cardiopalmo, sincopi o lipotimie.\nNega ipertensione arteriosa nota, diabete mellito, dislipidemia.\nNega familiarità per cardiopatia ischemica precoce.\nNega fumo e abuso alcolico. Attività fisica regolare.\nNon terapie in corso."
      },
      {
        label: "Paziente iperteso in terapia",
        text: "Ipertensione arteriosa nota da ___ anni, in trattamento con ___.\nAutomisurazioni domiciliari riferite: ___ mmHg.\nNega crisi ipertensive, cefalea, epistassi.\nUltimo controllo pressorio delle 24 ore in data ___: ___.\nNega altri fattori di rischio cardiovascolare oltre a ___."
      },
      {
        label: "Cardiopatia ischemica nota",
        text: "Cardiopatia ischemica nota: ___ (IMA / angina stabile) in data ___.\nSottoposto a ___ (coronarografia, PTCA con stent su ___, bypass) in data ___.\nTerapia in atto: antiaggregante ___, statina ___, betabloccante ___, ACE-inibitore/sartano ___.\nAttualmente asintomatico per angor, classe CCS ___.\nUltimo controllo strumentale: ___."
      },
      {
        label: "Fibrillazione atriale",
        text: "Fibrillazione atriale ___ (parossistica / persistente / permanente) nota dal ___.\nCHA2DS2-VASc ___, HAS-BLED ___.\nIn terapia anticoagulante con ___ dal ___.\nNega episodi emorragici. Nega cardiopalmo sintomatico nell'ultimo periodo.\nControllo della frequenza con ___."
      },
      {
        label: "Primo accesso — inquadramento del rischio",
        text: "Paziente al primo accesso, inviato dal Medico di Medicina Generale per ___.\nFattori di rischio cardiovascolare: fumo ___, ipertensione ___, dislipidemia ___, diabete ___, familiarità ___.\nSintomatologia insorta da ___, con andamento ___.\nPorta in visione: ___."
      }
    ],
    esameObiettivo: [
      {
        label: "Esame obiettivo cardiovascolare nella norma",
        text: "Paziente in condizioni generali buone, eupnoico a riposo.\nItto della punta in sede. Attività cardiaca ritmica, toni validi, pause libere; non soffi né sfregamenti.\nPolsi periferici presenti, simmetrici e sincroni ai quattro arti.\nNon turgore giugulare, non reflusso epatogiugulare.\nTorace: murmure vescicolare presente su tutto l'ambito, non rumori patologici aggiunti.\nAddome trattabile, fegato non debordante. Non edemi declivi.\nNon segni clinici di trombosi venosa profonda agli arti inferiori."
      },
      {
        label: "Soffio sistolico",
        text: "Attività cardiaca ritmica. Soffio sistolico ___/6 sul focolaio ___ (aortico / mitralico / polmonare / tricuspidale), irradiato ___.\nToni validi, non sfregamenti pericardici.\nPolsi periferici ___. Non turgore giugulare.\nSi programma approfondimento ecocardiografico."
      },
      {
        label: "Segni di scompenso",
        text: "Paziente dispnoico per sforzi ___ (lievi / moderati), classe NYHA ___.\nTurgore giugulare ___, reflusso epatogiugulare ___.\nAll'auscultazione toracica: rantoli crepitanti alle basi ___.\nEpatomegalia ___. Edemi declivi improntabili ___ fino a ___.\nPeso attuale ___ kg (variazione rispetto al precedente controllo: ___)."
      },
      {
        label: "Misurazione pressoria",
        text: "PA ___ mmHg al braccio ___, in posizione seduta dopo 5 minuti di riposo.\nControllo controlaterale: ___ mmHg. Differenza interbraccio ___ mmHg.\nFC ___ bpm, ritmica.\nMisurazione ripetuta dopo 2 minuti: ___ mmHg."
      }
    ],
    ecg: [
      {
        label: "ECG nella norma",
        text: "Ritmo sinusale regolare, frequenza ___ bpm.\nConduzione atrioventricolare e intraventricolare nei limiti.\nAsse elettrico del QRS normoposizionato.\nNon alterazioni della ripolarizzazione ventricolare.\nNon segni di ipertrofia ventricolare sinistra. Non onde Q patologiche."
      },
      {
        label: "Fibrillazione atriale",
        text: "Ritmo da fibrillazione atriale a risposta ventricolare ___ (media ___ bpm).\nAssenza di onde P, intervalli R-R irregolarmente irregolari.\nQRS stretto. Non alterazioni acute della ripolarizzazione.\nRispetto al tracciato precedente: ___."
      },
      {
        label: "Ipertrofia ventricolare sinistra",
        text: "Ritmo sinusale, frequenza ___ bpm.\nIndici di voltaggio positivi per ipertrofia ventricolare sinistra (Sokolow-Lyon ___ mm).\nAlterazioni secondarie della ripolarizzazione nelle derivazioni laterali.\nAsse ___. Conduzione AV nei limiti."
      },
      {
        label: "Blocco di branca sinistra",
        text: "Ritmo sinusale, frequenza ___ bpm.\nQRS di durata ___ ms con morfologia da blocco di branca sinistra.\nAlterazioni secondarie della ripolarizzazione.\nNon confrontabile per la ricerca di alterazioni ischemiche acute.\nRispetto al precedente tracciato: ___."
      },
      {
        label: "Alterazioni della ripolarizzazione",
        text: "Ritmo sinusale, frequenza ___ bpm.\nSottoslivellamento del tratto ST di ___ mm nelle derivazioni ___.\nOnde T ___ (negative / appiattite / bifasiche) in ___.\nSi consiglia confronto con tracciati precedenti e approfondimento clinico."
      }
    ],
    ecocardiogramma: [
      {
        label: "Ecocardiogramma normale (referto discorsivo)",
        text: "Ventricolo sinistro di normali dimensioni e volumi, con pareti di normale spessore. Funzione sistolica globale conservata, normale la cinesi distrettuale.\nAtrio sinistro e sezioni destre nei limiti.\nMitrale con lembi mobili, fibrotici; al color Doppler rigurgito di grado lieve.\nAorta tricuspide con lembi fibrotici; al color Doppler non gradienti né flussi patologici.\nPAPs derivata nei limiti, insufficienza tricuspidale di grado lieve.\nVena cava di normali dimensioni e collassabilità.\nNon versamento pericardico. Normale rilasciamento diastolico del ventricolo sinistro."
      },
      {
        label: "Ecocardiogramma nella norma",
        text: "Ventricolo sinistro di normali dimensioni e spessori parietali, con cinesi segmentaria e globale conservata. Frazione di eiezione ___% (Simpson biplano).\nFunzione diastolica nei limiti per l'età.\nAtrio sinistro di normali dimensioni.\nValvola mitrale e valvola aortica morfologicamente normali, normofunzionanti.\nSezioni destre nei limiti; TAPSE ___ mm. PAPs stimata ___ mmHg.\nRadice aortica e aorta ascendente di normali dimensioni.\nNon versamento pericardico."
      },
      {
        label: "Disfunzione sistolica",
        text: "Ventricolo sinistro dilatato (DTD ___ mm), con ipocinesia ___ (diffusa / dei segmenti ___).\nFrazione di eiezione ridotta, pari a ___% (Simpson biplano).\nPattern diastolico ___. Rapporto E/e' ___.\nAtrio sinistro ___ mm. Insufficienza mitralica ___.\nSezioni destre: TAPSE ___ mm, PAPs ___ mmHg.\nNon versamento pericardico."
      },
      {
        label: "Cardiopatia ipertensiva",
        text: "Ventricolo sinistro di normali dimensioni con ipertrofia concentrica (SIV ___ mm, PP ___ mm).\nCinesi globale e segmentaria conservata, frazione di eiezione ___%.\nAlterato rilasciamento diastolico. Rapporto E/A ___, E/e' ___.\nAtrio sinistro ___ mm.\nRadice aortica ___ mm, aorta ascendente ___ mm.\nNon versamento pericardico."
      },
      {
        label: "Valvulopatia aortica",
        text: "Valvola aortica ___ (tricuspide / bicuspide) con ___ (sclerosi / calcificazioni) dei lembi.\nGradiente medio transvalvolare ___ mmHg, gradiente massimo ___ mmHg, area valvolare stimata ___ cm².\nInsufficienza aortica di grado ___.\nVentricolo sinistro con spessori ___ e frazione di eiezione ___%.\nRadice aortica ___ mm, aorta ascendente ___ mm."
      }
    ],
    tcCoronarica: [
      {
        label: "TC coronarica negativa",
        text: "Esame eseguito presso ___ in data ___.\nCalcium score (Agatston) pari a ___.\nAlbero coronarico ad origine e decorso regolari, senza placche emodinamicamente significative.\nCAD-RADS ___.\nConclusioni del radiologo: ___."
      },
      {
        label: "TC coronarica con placche",
        text: "Esame eseguito presso ___ in data ___.\nCalcium score (Agatston) pari a ___.\nPlacca ___ (calcifica / mista / non calcifica) a carico di ___, con stenosi stimata del ___%.\nCAD-RADS ___.\nConclusioni del radiologo: ___.\nSi programma ___ (ottimizzazione terapia / test funzionale / coronarografia)."
      }
    ],
    testErgometrico: [
      {
        label: "Test massimale negativo",
        text: "Test ergometrico al ___ (cicloergometro / treadmill) secondo protocollo ___.\nInterrotto per esaurimento muscolare al carico di ___ (___ METs), dopo ___ minuti.\nFC massima raggiunta ___ bpm, pari al ___% della teorica per l'età.\nComportamento pressorio ___ (fisiologico / ipertensivo), PA massima ___ mmHg.\nNon sintomi durante lo sforzo e nel recupero.\nNon alterazioni significative del tratto ST né aritmie da sforzo.\nTest massimale, negativo per ischemia miocardica inducibile."
      },
      {
        label: "Test submassimale",
        text: "Test ergometrico al ___ secondo protocollo ___.\nInterrotto a ___ per ___ (affaticamento / dispnea / raggiungimento della FC target).\nFC massima raggiunta ___ bpm, pari al ___% della teorica: test submassimale.\nComportamento pressorio ___. Non sintomi anginosi.\nNon alterazioni diagnostiche del tratto ST.\nTest non diagnostico per ischemia inducibile per mancato raggiungimento dell'85% della FC teorica."
      },
      {
        label: "Test positivo per ischemia",
        text: "Test ergometrico al ___ secondo protocollo ___.\nInterrotto al carico di ___ dopo ___ minuti per ___ (comparsa di dolore toracico / sottoslivellamento del tratto ST).\nFC massima ___ bpm (___% della teorica). PA massima ___ mmHg.\nSottoslivellamento del tratto ST di ___ mm nelle derivazioni ___, regredito in ___ minuti di recupero.\nTest positivo per ischemia miocardica inducibile.\nSi programma approfondimento con ___."
      }
    ],
    holterEcg: [
      {
        label: "Holter nella norma",
        text: "Registrazione ECG dinamica della durata di ___ ore, di buona qualità tecnica.\nRitmo sinusale per tutta la durata della registrazione.\nFC media ___ bpm (minima ___ bpm alle ore ___, massima ___ bpm alle ore ___).\nRari battiti ectopici sopraventricolari (___ nelle 24 ore) e ventricolari (___ nelle 24 ore), isolati.\nNon pause significative. Non alterazioni della conduzione atrioventricolare.\nNon episodi sintomatici segnalati sul diario."
      },
      {
        label: "Extrasistolia ventricolare",
        text: "Registrazione ECG dinamica della durata di ___ ore.\nRitmo sinusale, FC media ___ bpm (___-___ bpm).\nBattiti ectopici ventricolari ___ nelle 24 ore (___% del totale), ___ (monomorfi / polimorfi), organizzati in ___ (coppie / triplette / brevi run di TVNS della durata massima di ___ battiti).\nBattiti ectopici sopraventricolari ___ nelle 24 ore.\nDistribuzione ___ (prevalentemente diurna / notturna / uniforme).\nSintomi riferiti sul diario: ___, con correlazione elettrocardiografica ___."
      },
      {
        label: "Fibrillazione atriale",
        text: "Registrazione ECG dinamica della durata di ___ ore.\nRitmo da fibrillazione atriale ___ (permanente / con episodi parossistici, il più lungo di ___).\nFC media ___ bpm (minima ___ bpm, massima ___ bpm).\nPausa massima di ___ secondi alle ore ___.\nControllo della frequenza ___ (adeguato / non adeguato) con la terapia in atto.\nSintomi riferiti sul diario: ___."
      }
    ],
    holterPressorio: [
      {
        label: "Profilo pressorio nei limiti",
        text: "Monitoraggio pressorio delle 24 ore, ___ misurazioni valide su ___ (___%).\nMedia delle 24 ore ___/___ mmHg, media diurna ___/___ mmHg, media notturna ___/___ mmHg.\nCalo pressorio notturno pari al ___%: profilo dipper.\nCarico pressorio sistolico ___%, diastolico ___%.\nNon episodi ipotensivi sintomatici.\nProfilo pressorio nei limiti di norma secondo le soglie per il monitoraggio ambulatoriale."
      },
      {
        label: "Ipertensione non controllata",
        text: "Monitoraggio pressorio delle 24 ore, ___ misurazioni valide.\nMedia delle 24 ore ___/___ mmHg, media diurna ___/___ mmHg, media notturna ___/___ mmHg.\nCalo pressorio notturno pari al ___%: profilo ___ (non-dipper / riverso).\nCarico pressorio sistolico ___%, diastolico ___%.\nValori medi superiori alle soglie di riferimento per il monitoraggio ambulatoriale: controllo pressorio non adeguato con la terapia in atto.\nSi modifica la terapia come da prescrizione; si programma nuovo controllo dopo ___."
      }
    ],
    dopplerTsa: [
      {
        label: "TSA nella norma",
        text: "EcoColorDoppler dei tronchi sovraaortici eseguito presso ___ in data ___.\nAssi carotidei pervi, a decorso regolare, con pareti di spessore ed ecostruttura conservati.\nSpessore medio-intimale massimo ___ mm.\nNon placche ateromasiche. Flussimetria nei limiti su tutti gli assi esplorati.\nArterie vertebrali pervie, con flusso anterogrado bilateralmente.\nConclusioni: quadro ecocolorDoppler dei vasi epiaortici nei limiti di norma."
      },
      {
        label: "Ispessimento e placche non stenosanti",
        text: "EcoColorDoppler dei tronchi sovraaortici eseguito presso ___ in data ___.\nSpessore medio-intimale aumentato, massimo ___ mm.\nPlacca ___ (fibrocalcifica / ipoecogena / disomogenea) a carico di ___, con stenosi stimata del ___%, emodinamicamente non significativa.\nNon accelerazioni di flusso significative sugli assi esplorati.\nArterie vertebrali pervie, con flusso anterogrado bilateralmente.\nConclusioni: aterosclerosi carotidea non stenosante. Il reperto documenta malattia aterosclerotica ed entra nella definizione della classe di rischio."
      },
      {
        label: "Stenosi carotidea significativa",
        text: "EcoColorDoppler dei tronchi sovraaortici eseguito presso ___ in data ___.\nPlacca ___ (fibrocalcifica / ipoecogena / con superficie irregolare) a carico di ___, con stenosi stimata del ___% secondo i criteri velocimetrici (PSV ___ cm/s, EDV ___ cm/s, rapporto carotideo ___).\nAsse controlaterale: ___.\nArterie vertebrali ___.\nConclusioni: stenosi carotidea ___ (moderata / severa). Si propone ___ (valutazione chirurgico-vascolare / controllo a ___ mesi) e ottimizzazione della terapia antiaggregante e ipolipemizzante."
      }
    ],
    conclusioni: [
      {
        label: "Quadro nella norma — controllo periodico",
        text: "Conclusioni: quadro cardiologico clinico e strumentale nei limiti di norma.\nSi consiglia controllo cardiologico a distanza di 12 mesi o prima in caso di comparsa di sintomi.\nSi raccomanda il mantenimento di uno stile di vita corretto: attività fisica aerobica regolare, dieta iposodica e mediterranea, astensione dal fumo, controllo del peso corporeo."
      },
      {
        label: "Prosecuzione della terapia in atto",
        text: "Conclusioni: quadro clinico stabile, in buon compenso con la terapia in atto.\nSi consiglia di proseguire la terapia domiciliare senza modifiche.\nControllo clinico ed ecocardiografico tra ___ mesi, con esami ematochimici (assetto lipidico, funzione renale ed elettroliti) da eseguire prima del controllo."
      },
      {
        label: "Ottimizzazione della terapia",
        text: "Conclusioni: ___.\nSi modifica la terapia come da prescrizione allegata.\nSi raccomanda automisurazione domiciliare di pressione arteriosa e frequenza cardiaca due volte al giorno, con annotazione dei valori su diario da portare al controllo.\nControllo di funzione renale ed elettroliti a 15 giorni dall'inizio della nuova terapia.\nRivalutazione clinica tra ___."
      },
      {
        label: "Approfondimento di secondo livello",
        text: "Conclusioni: il quadro clinico rende opportuno un approfondimento diagnostico.\nSi richiede ___ (test ergometrico / ECG dinamico secondo Holter / monitoraggio pressorio delle 24 ore / TC coronarica).\nSi rivaluterà il paziente alla luce dei referti; si raccomanda di riportare tutta la documentazione al controllo."
      },
      {
        label: "Stratificazione del rischio cardiovascolare",
        text: "Conclusioni: fattori di rischio cardiovascolare rilevati: ___.\nGli indici calcolati in cartella sono riportati a titolo di supporto e vanno letti nel contesto clinico complessivo.\nSi consiglia ___ (correzione dello stile di vita / terapia ipolipemizzante / rivalutazione a ___ mesi) secondo le raccomandazioni ESC vigenti."
      }
    ]
  },
  terapie: [
    // ── Schemi dietetico-nutrizionali ──────────────────────────────────────
    // Stanno fra i modelli di terapia e non in un documento a se' perche' e'
    // qui che il referto cardiologico mette i consigli sullo stile di vita:
    // il paziente se li porta a casa insieme al resto.
    // Sono indicazioni qualitative di impostazione alimentare, non piani
    // dietetici con grammature: quelli sono competenza del nutrizionista.
    {
      label: "Dieta mediterranea — impostazione generale",
      text: "IMPOSTAZIONE ALIMENTARE CONSIGLIATA\n\n- Verdura a ogni pasto principale e 2-3 porzioni di frutta al giorno.\n- Cereali preferibilmente integrali: pane, pasta, riso, orzo, farro.\n- Legumi almeno 3-4 volte a settimana, anche in sostituzione del secondo piatto.\n- Pesce 2-3 volte a settimana, privilegiando quello azzurro.\n- Carni bianche con moderazione; carni rosse non più di una volta a settimana e salumi solo occasionalmente.\n- Olio extravergine di oliva come condimento principale, a crudo.\n- Frutta secca non salata, una piccola porzione quasi tutti i giorni.\n- Formaggi con moderazione; latte e yogurt preferibilmente a ridotto contenuto di grassi.\n- Acqua come bevanda abituale; limitare bevande zuccherate e succhi di frutta.\n\nATTIVITÀ FISICA\nAlmeno 150 minuti a settimana di attività aerobica di intensità moderata (camminata veloce, bicicletta, nuoto), distribuiti su più giorni."
    },
    {
      label: "Dieta iposodica — ipertensione e scompenso",
      text: "RIDUZIONE DEL SALE\n\n- Non aggiungere sale a tavola e ridurlo progressivamente in cucina: il gusto si riadatta in poche settimane.\n- Insaporire con erbe aromatiche, spezie, aglio, cipolla, succo di limone e aceto.\n- Limitare gli alimenti conservati sotto sale: salumi, formaggi stagionati, cibi in scatola, dadi ed estratti per brodo, salse pronte, snack salati.\n- Leggere le etichette: il sodio è presente anche in prodotti che non sembrano salati, come pane, cereali da prima colazione e prodotti da forno.\n- Preferire pane senza sale dove disponibile.\n- Scolare e sciacquare i legumi in scatola prima dell'uso.\n\nNOTA\nGran parte del sale che assumiamo non viene dalla saliera ma dagli alimenti già pronti: è lì che si ottiene la riduzione maggiore."
    },
    {
      label: "Alimentazione per ipercolesterolemia",
      text: "INDICAZIONI ALIMENTARI\n\n- Ridurre i grassi saturi: burro, panna, lardo, strutto, carni grasse, salumi, formaggi stagionati, prodotti da forno industriali.\n- Evitare i grassi idrogenati e gli alimenti che riportano in etichetta grassi vegetali parzialmente idrogenati.\n- Preferire olio extravergine di oliva a crudo come condimento.\n- Aumentare le fibre solubili: avena, orzo, legumi, mele, agrumi, verdura.\n- Pesce 2-3 volte a settimana, soprattutto azzurro.\n- Frutta secca non salata in piccole porzioni quotidiane.\n- Limitare le uova secondo indicazione medica e preferire cotture senza grassi aggiunti.\n- Privilegiare cotture al vapore, al forno, alla griglia o in umido rispetto alla frittura.\n\nNOTA\nL'alimentazione da sola può non bastare a raggiungere l'obiettivo di colesterolo LDL indicato: va mantenuta anche quando è in corso una terapia farmacologica."
    },
    {
      label: "Alimentazione per ipertrigliceridemia",
      text: "INDICAZIONI ALIMENTARI\n\n- Ridurre gli zuccheri semplici: bevande zuccherate, succhi di frutta, dolci, miele, sciroppi, snack industriali.\n- Attenzione al fruttosio aggiunto e agli alimenti che lo contengono come dolcificante.\n- Limitare fortemente l'alcol: sui trigliceridi ha un effetto diretto e spesso è la causa principale del valore elevato.\n- Preferire cereali integrali a quelli raffinati.\n- Pesce azzurro 2-3 volte a settimana.\n- Ridurre le porzioni e la frequenza dei prodotti da forno dolci e salati.\n- Ridurre il peso corporeo dove indicato: anche un calo modesto abbassa i trigliceridi in modo apprezzabile.\n- Attività fisica aerobica regolare, almeno 150 minuti a settimana.\n\nNOTA\nI trigliceridi rispondono all'alimentazione più rapidamente del colesterolo: il controllo va ripetuto dopo un periodo adeguato di dieta."
    },
    {
      label: "Scompenso cardiaco — liquidi, sale e peso",
      text: "CONTROLLO DEL PESO\n- Pesarsi ogni mattina, dopo la minzione e prima di colazione, sempre con la stessa bilancia.\n- Annotare il peso e segnalare al medico un aumento di 2 kg o più in due-tre giorni: è un segno di ritenzione di liquidi.\n\nLIQUIDI\n- Attenersi alla quantità di liquidi indicata dal medico, contando anche brodo, minestre, tè, caffè, frutta molto acquosa e gelati.\n- In caso di sete intensa: sciacqui con acqua fredda, cubetti di ghiaccio, chewing gum senza zucchero.\n\nSALE\n- Seguire le indicazioni della dieta iposodica: è la misura alimentare che incide di più sulla congestione.\n\nSEGNALARE AL MEDICO\nAumento rapido del peso, gonfiore a caviglie o gambe, affanno che peggiora o compare da sdraiati, necessità di aggiungere cuscini per dormire."
    },
    {
      label: "Dieta chetogenica - informazioni e cautele",
      text: "SCHEMA CHETOGENICO - INFORMAZIONI E CAUTELE\n\nNon e' una prescrizione: e' la descrizione di uno schema, da valutare caso per caso e da seguire sotto controllo medico.\n\nCOME FUNZIONA\n- Riduzione forte dei carboidrati (indicativamente sotto i 50 g al giorno), quota proteica moderata, grassi come fonte energetica principale.\n- L'organismo passa a usare i corpi chetonici: da qui il nome.\n- Nelle prime settimane il calo di peso e' in buona parte acqua, e la pressione arteriosa può abbassarsi.\n\nCOSA SI RIDUCE\n- Pane, pasta, riso, patate, cereali, prodotti da forno, dolci, zucchero, bevande zuccherate.\n- Frutta più ricca di zuccheri; legumi in quantità limitata.\n\nCOSA RESTA\n- Verdura non amidacea in abbondanza, pesce, uova, carne, formaggi secondo indicazione, olio extravergine di oliva, frutta secca.\n\nQUANDO NON VA INIZIATA SENZA VALUTAZIONE\n- Insufficienza renale o epatica, diabete in terapia con insulina o sulfaniluree (rischio di ipoglicemia), gravidanza e allattamento, disturbi del comportamento alimentare.\n- In terapia con SGLT2-inibitori: rischio di chetoacidosi euglicemica.\n- In terapia antipertensiva o diuretica le dosi possono dover essere riviste: va concordato prima di iniziare.\n\nDA SEGNALARE AL MEDICO\nStanchezza marcata, capogiri, crampi, stitichezza ostinata, cardiopalmo.\n\nNOTA\nE' uno schema pensato per un periodo definito e con un obiettivo preciso, non per un uso indefinito. L'effetto sul colesterolo LDL non e' prevedibile a priori e va ricontrollato.",
    },
    {
      label: "Digiuno intermittente - informazioni e cautele",
      text: "DIGIUNO INTERMITTENTE - INFORMAZIONI E CAUTELE\n\nNon e' una prescrizione: e' la descrizione di uno schema, da valutare caso per caso e da seguire sotto controllo medico.\n\nCOME FUNZIONA\n- L'alimentazione si concentra in una finestra oraria: le formule più usate sono 16 ore di digiuno e 8 di alimentazione, oppure 14 e 10.\n- Non riguarda che cosa si mangia ma quando: la qualità del cibo resta quella dell'impostazione mediterranea.\n- Acqua, tè e caffè non zuccherati sono ammessi nelle ore di digiuno.\n\nCOME SI IMPOSTA\n- Meglio partire da una finestra ampia e restringerla gradualmente.\n- Spostare o saltare la cena e' in genere più sostenibile che saltare la colazione, ma conta soprattutto la regolarità.\n- Nella finestra di alimentazione non si recupera: le porzioni restano quelle abituali.\n\nQUANDO NON VA INIZIATO SENZA VALUTAZIONE\n- Diabete in terapia con insulina o sulfaniluree (rischio di ipoglicemia), gravidanza e allattamento, disturbi del comportamento alimentare, età avanzata con calo ponderale in atto.\n- Con terapie da assumere a orari fissi o a stomaco pieno gli orari vanno rivisti insieme al medico.\n\nDA SEGNALARE AL MEDICO\nCapogiri, sudorazione fredda, tremori o confusione sono i sintomi dell'ipoglicemia: impongono di interrompere il digiuno e di avvisare il medico.",
    },
    {
      label: "Grassi saturi per porzione - tabella di riferimento",
      text: "GRASSI SATURI: QUANTO CE N'E' IN UNA PORZIONE\n\nValori indicativi per porzione abituale, arrotondati. Servono a dare la misura, non a fare un calcolo.\n\nMOLTO ALTO - oltre 8 g per porzione\n- Burro, 20 g (una noce): circa 10 g\n- Panna da cucina, 100 ml: circa 13 g\n- Formaggio stagionato (grana, pecorino), 50 g: circa 10 g\n\nALTO - da 4 a 8 g per porzione\n- Mozzarella, 100 g: circa 7 g\n- Salame, 50 g: circa 6 g\n- Croissant o brioche industriale, 1 pezzo: circa 6 g\n- Carne rossa grassa, 100 g: circa 5 g\n\nMEDIO - da 1 a 4 g per porzione\n- Latte intero, 200 ml: circa 4 g\n- Prosciutto crudo sgrassato, 50 g: circa 2 g\n- Yogurt intero, 125 g: circa 2 g\n- Uovo, 1 medio: circa 2 g\n- Olio extravergine di oliva, 10 g (un cucchiaio): circa 1,5 g\n\nBASSO - sotto 1 g per porzione\n- Pesce azzurro, 100 g: circa 1 g\n- Petto di pollo o tacchino, 100 g: circa 0,5 g\n- Legumi cotti, 150 g: meno di 0,5 g\n- Verdura, frutta, pane e pasta: quantità trascurabili\n\nCOME SI LEGGE\nL'indicazione corrente e' di tenere i grassi saturi sotto il 10% delle calorie della giornata, e sotto il 7% quando il colesterolo LDL e' alto: per 2000 kcal sono rispettivamente 22 g e 15 g al giorno. La tabella serve a vedere dove finisce il grosso della quota, non a eliminare qualcosa.",
    },
    {
      label: "Controllo periodico",
      text: "Si consiglia di proseguire i controlli cardiologici periodici e di mantenere uno stile di vita sano: attività fisica aerobica di intensità moderata almeno 150 minuti a settimana, dieta iposodica e mediterranea, astensione dal fumo, consumo di alcol entro i limiti raccomandati."
    },
    {
      label: "Automonitoraggio pressorio",
      text: "Si consiglia automisurazione domiciliare della pressione arteriosa e della frequenza cardiaca due volte al giorno (mattino e sera), a riposo da almeno 5 minuti e in posizione seduta, annotando i valori su un diario da portare al prossimo controllo."
    },
    {
      label: "Rivalutazione dopo modifica terapeutica",
      text: "Si imposta la terapia indicata e si programma una rivalutazione clinica al termine del periodo di titolazione. Si raccomanda controllo di funzione renale ed elettroliti a 15 giorni. Tornare a controllo in caso di comparsa di effetti indesiderati."
    },
    {
      label: "Correzione dei fattori di rischio",
      text: "Si raccomandano: riduzione dell'apporto di sodio, calo ponderale fino a un BMI inferiore a 25, attività fisica aerobica regolare, astensione completa dal fumo e correzione dell'assetto lipidico secondo il profilo di rischio complessivo."
    },
    {
      label: "Quando rivolgersi al Pronto Soccorso",
      text: "Si raccomanda di rivolgersi al Pronto Soccorso in caso di dolore toracico prolungato, dispnea a riposo di nuova insorgenza, sincope, cardiopalmo persistente o comparsa di edemi rapidamente ingravescenti."
    }
  ],
  ricette: [
    {
      label: "Terapia antipertensiva",
      text: [
        "___ (principio attivo) ___ mg: 1 cpr al mattino",
        "",
        "Controllo pressorio domiciliare quotidiano nelle prime due settimane.",
        "Controllo di funzione renale ed elettroliti dopo 15 giorni dall'inizio della terapia.",
      ].join("\n"),
    },
    {
      label: "Terapia ipolipemizzante",
      text: [
        "___ (statina) ___ mg: 1 cpr la sera",
        "",
        "Controllo di assetto lipidico e transaminasi dopo 6-8 settimane.",
        "Segnalare eventuali mialgie.",
      ].join("\n"),
    },
    {
      label: "Statine - elenco e dosaggi",
      text: "STATINE DISPONIBILI E DOSAGGI\n\nElenco di consultazione: la scelta della molecola e della dose resta clinica.\n\nALTA INTENSITÀ - riduzione attesa del colesterolo LDL oltre il 50%\n- Atorvastatina 40 mg o 80 mg\n- Rosuvastatina 20 mg o 40 mg\n\nINTENSITÀ MODERATA - riduzione attesa fra il 30% e il 50%\n- Atorvastatina 10 mg o 20 mg\n- Rosuvastatina 5 mg o 10 mg\n- Simvastatina 20 mg o 40 mg\n- Pravastatina 40 mg\n- Fluvastatina 80 mg a rilascio prolungato\n- Pitavastatina 2 mg o 4 mg\n\nINTENSITÀ BASSA - riduzione attesa sotto il 30%\n- Simvastatina 10 mg\n- Pravastatina 10 mg o 20 mg\n- Fluvastatina 20 mg o 40 mg\n- Pitavastatina 1 mg\n\nSE IL BERSAGLIO NON SI RAGGIUNGE\n- Ezetimibe 10 mg in associazione: aggiunge circa il 20% di riduzione.\n- Acido bempedoico dove indicato.\n- Inibitori di PCSK9 secondo i criteri di rimborsabilità.\n\nNOTE PRATICHE\n- Simvastatina: dose massima 20 mg con amlodipina o ranolazina, e 10 mg con verapamil o diltiazem; gli 80 mg non sono più raccomandati.\n- Atorvastatina e rosuvastatina si possono assumere a qualunque ora della giornata; le altre la sera.\n- Controllo di assetto lipidico e transaminasi dopo 6-8 settimane. Segnalare le mialgie.\n- Nell'insufficienza renale avanzata la dose va rivista secondo la scheda tecnica della singola molecola.",
    },
    {
      label: "Terapia antiaggregante",
      text: [
        "Acido acetilsalicilico 100 mg: 1 cpr al giorno dopo pranzo",
        "",
        "Assumere a stomaco pieno. Segnalare eventuali episodi emorragici.",
      ].join("\n"),
    },
    {
      label: "Terapia anticoagulante orale",
      text: [
        "___ (anticoagulante orale diretto) ___ mg: 1 cpr ogni ___ ore",
        "",
        "Non sospendere autonomamente la terapia.",
        "Controllo di emocromo e funzione renale ogni ___ mesi.",
        "Segnalare al medico ogni sanguinamento e ogni nuova terapia concomitante.",
      ].join("\n"),
    },
    {
      label: "Anticoagulanti orali - dosi e criteri di riduzione",
      text: "ANTICOAGULANTI ORALI DIRETTI - DOSI E CRITERI DI RIDUZIONE\n\nElenco di consultazione nella fibrillazione atriale non valvolare. La scelta\ndella molecola e della dose resta clinica.\n\nI criteri delle schede tecniche usano la clearance della creatinina secondo\nCockcroft-Gault, non l'eGFR: il referto della visita riporta entrambi, e nel\npaziente anziano o di basso peso i due numeri divergono proprio dove la\nriduzione di dose si decide.\n\nAPIXABAN\n- 5 mg due volte al giorno.\n- 2,5 mg due volte al giorno se ricorrono almeno due fra: età >= 80 anni,\n  peso <= 60 kg, creatininemia >= 1,5 mg/dL.\n- 2,5 mg due volte al giorno anche con ClCr fra 15 e 29 mL/min.\n- Non raccomandato con ClCr < 15 mL/min o in dialisi.\n\nRIVAROXABAN\n- 20 mg una volta al giorno, con il pasto.\n- 15 mg una volta al giorno con ClCr fra 15 e 49 mL/min.\n- Non raccomandato con ClCr < 15 mL/min.\n\nEDOXABAN\n- 60 mg una volta al giorno.\n- 30 mg una volta al giorno se: ClCr fra 15 e 50 mL/min, oppure peso <= 60 kg,\n  oppure terapia con ciclosporina, dronedarone, eritromicina o ketoconazolo.\n- Non raccomandato con ClCr < 15 mL/min.\n- Da evitare con ClCr > 95 mL/min: nello studio registrativo l'efficacia\n  risultava inferiore al warfarin in questa fascia.\n\nDABIGATRAN\n- 150 mg due volte al giorno.\n- 110 mg due volte al giorno se età >= 80 anni o in terapia con verapamil.\n- 110 mg due volte al giorno da considerare fra 75 e 80 anni, con ClCr fra 30\n  e 50 mL/min, con gastrite o reflusso, o comunque a rischio emorragico\n  aumentato.\n- Controindicato con ClCr < 30 mL/min.\n\nCONTROLLI\n- Funzione renale almeno una volta l'anno; con ClCr <= 60 mL/min più spesso.\n  Regola pratica: mesi di intervallo pari a ClCr diviso 10.\n- Emocromo e funzione epatica secondo il quadro clinico.\n- Rivalutare la dose a ogni variazione di peso, funzione renale o terapia\n  concomitante.\n\nDA NON DIMENTICARE\n- I DOAC sono controindicati nella protesi valvolare meccanica e nella\n  stenosi mitralica moderata-severa: lì resta il warfarin.\n- Non sospendere autonomamente. Segnalare ogni sanguinamento e ogni nuovo\n  farmaco assunto.",
    },
    {
      label: "Gastroprotezione",
      text: [
        "Pantoprazolo 20 mg: 1 cpr al mattino a digiuno",
        "",
        "Da assumere 30 minuti prima della colazione.",
      ].join("\n"),
    },
  ] as { label: string; text: string; note?: string }[],
  esami_complementari: [
    { label: "Elettrocardiogramma", text: "Elettrocardiogramma a 12 derivazioni", note: "A riposo, con refertazione." },
    { label: "Ecocardiogramma", text: "Ecocardiogramma color-Doppler transtoracico", note: "Valutazione morfo-funzionale delle camere cardiache e degli apparati valvolari." },
    { label: "Holter ECG 24 ore", text: "Monitoraggio ECG dinamico secondo Holter (24 ore)", note: "Per documentazione di aritmie o correlazione sintomo-evento." },
    { label: "Holter pressorio 24 ore", text: "Monitoraggio pressorio delle 24 ore (ABPM)", note: "Per conferma diagnostica di ipertensione arteriosa e valutazione del profilo notturno." },
    { label: "Test ergometrico", text: "Test ergometrico al cicloergometro o treadmill", note: "Secondo protocollo, con monitoraggio ECG e pressorio." },
    { label: "TC coronarica", text: "Angio-TC delle arterie coronarie con calcium score", note: "Valutazione anatomica diretta dell'albero coronarico. Indicare la funzione renale recente." },
    { label: "Ecocolordoppler tronchi sovraortici", text: "Ecocolordoppler dei tronchi sovraortici", note: "Valutazione morfologica ed emodinamica degli assi carotidei e vertebrali." },
    { label: "Ecocolordoppler arti inferiori", text: "Ecocolordoppler venoso o arterioso degli arti inferiori", note: "Specificare il distretto e il quesito clinico." },
    { label: "Assetto lipidico", text: "Assetto lipidico completo", note: "Colesterolo totale, HDL, LDL diretto, trigliceridi, lipoproteina(a)." },
    { label: "Esami ematochimici cardiologici", text: "Esami ematochimici per inquadramento cardiologico", note: "Emocromo, glicemia, HbA1c, creatinina ed eGFR, elettroliti, assetto lipidico, TSH, NT-proBNP se indicato." },
    { label: "Funzione renale e albuminuria", text: "Creatinina con eGFR e rapporto albumina/creatinina urinaria", note: "Parte della stratificazione del rischio cardiovascolare." },
    { label: "Radiografia del torace", text: "Radiografia del torace in due proiezioni", note: "Proiezione postero-anteriore e laterale." },
    { label: "Visita specialistica", text: "Visita specialistica ___", note: "Indicare la branca e il quesito clinico." },
  ],
  certificati: [
    {
      label: "Idoneità all'attività ludico-motoria",
      note: "Attività non agonistica e non tesserata: è la formula che tiene il certificato fuori dal campo di applicazione del D.M. 8 agosto 2014.",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___, CF ___), sottoposto/a in data odierna a visita medica ed esame obiettivo cardiovascolare, non presenta controindicazioni in atto alla pratica di attività ludico-motoria.\n\nPer attività ludico-motoria si intende, ai sensi del D.M. 24 aprile 2013 e del D.M. 8 agosto 2014, quella praticata da soggetti non tesserati a federazioni sportive nazionali, discipline associate o enti di promozione sportiva, in forma individuale o collettiva, a scopo ricreativo o di mantenimento delle condizioni di salute.\n\nIl presente certificato non e' obbligatorio per legge per l'attività ludico-motoria e viene rilasciato su richiesta dell'interessato.",
    },
    {
      label: "Idoneità all'attività sportiva non agonistica",
      note: "Per legge il certificato per l'attività sportiva non agonistica spetta al medico di medicina generale, al pediatra di libera scelta e al medico dello sport (D.M. 8 agosto 2014).",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___, CF ___), sottoposto/a in data odierna a visita medica, esame obiettivo cardiovascolare ed elettrocardiogramma a riposo, non presenta controindicazioni in atto alla pratica di attività sportiva non agonistica.\n\nIl presente certificato ha validità annuale a partire dalla data di rilascio, ai sensi del D.M. 24 aprile 2013 e del D.M. 8 agosto 2014, recante le linee guida di indirizzo in materia di certificati medici per l'attività sportiva non agonistica, pubblicato nella Gazzetta Ufficiale n. 243 del 18 ottobre 2014."
    },
    {
      label: "Assenza dal lavoro — visita specialistica",
      note: "Attestato di presenza per visita o procedura ambulatoriale.",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___, CF ___) è stato/a visitato/a in data odierna presso questo ambulatorio ed ha eseguito ___ (visita cardiologica / elettrocardiogramma / ecocardiogramma). Per tale motivo il/la paziente si è assentato/a dal lavoro in data odierna.\n\nSi rilascia il presente certificato per gli usi consentiti dalla legge."
    },
    {
      label: "Attestato di presenza alla visita",
      note: "Generico attestato di presenza.",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___) si è presentato/a in data odierna presso questo ambulatorio per visita cardiologica.\n\nSi rilascia il presente attestato per gli usi consentiti dalla legge."
    },
    {
      label: "Idoneità alla mansione lavorativa",
      note: "Attestazione di idoneità o di limitazione alla mansione.",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___, CF ___) è stato/a visitato/a in data odierna. In base al quadro cardiologico rilevato, il/la paziente risulta idoneo/a allo svolgimento della propria attività lavorativa / risulta temporaneamente non idoneo/a alle seguenti mansioni: ___ (barrare il non necessario).\n\nSi rilascia il presente certificato per gli usi consentiti dalla legge."
    },
    {
      label: "Convalescenza post-procedura",
      note: "Dopo una procedura cardiologica, con periodo di riposo.",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___) è stato/a sottoposto/a a ___ in data ___. Il/La paziente è in periodo di convalescenza e necessita di astensione dall'attività lavorativa per ___ giorni, dal ___ al ___.\n\nSi rilascia il presente certificato per gli usi consentiti dalla legge."
    },
    {
      label: "Portatore di dispositivo cardiaco impiantabile",
      note: "Per viaggi, controlli aeroportuali e pratiche amministrative.",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___, CF ___) è portatore/portatrice di ___ (pacemaker / defibrillatore impiantabile) modello ___, impiantato in data ___ presso ___.\n\nSi rilascia il presente certificato per gli usi consentiti dalla legge, ivi compresi i controlli di sicurezza aeroportuali."
    },
    {
      label: "Patologia cronica in atto — uso amministrativo",
      note: "Attestazione della patologia per pratiche amministrative o assicurative.",
      text: "Il/La sottoscritto/a Dott. ___ attesta che il/la paziente ___ (nato/a il ___, CF ___) è affetto/a da ___, patologia in atto documentata e attualmente in trattamento con ___.\n\nSi rilascia il presente certificato per le pratiche amministrative richieste dall'interessato."
    },
    {
      label: "Lettera per il Medico di Medicina Generale",
      note: "Comunicazione dell'esito della valutazione al MMG.",
      text: "Lettera di comunicazione per il Medico di Medicina Generale.\n\nPaziente: ___ (nato/a il ___).\n\nIn data odierna il/la paziente è stato/a valutato/a presso questo ambulatorio per ___. Quadro clinico rilevato: ___. Esami strumentali eseguiti: ___. Terapia consigliata: ___. Controllo programmato: ___.\n\nSi invia comunicazione per continuità assistenziale, restando a disposizione per ogni chiarimento.\n\nDistinti saluti."
    }
  ]
};
