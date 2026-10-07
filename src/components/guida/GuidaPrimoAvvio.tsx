import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Input, Switch } from "@nextui-org/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleDashed,
  MousePointerClick,
  Stethoscope,
} from "lucide-react";
import DoctorMascot from "../app-lock/DoctorMascot";
import { CLASSE_PILLOLA } from "../app-lock/AppLockShell";
import {
  DoctorService,
  PatientService,
  PreferenceService,
} from "../../services/OfflineServices";
import type { Ambulatorio, Doctor, Patient, TitoloMedico } from "../../types/Storage";
import { formatPatientDisplayName } from "../../utils/patientDisplay";
import { cancellaBozzaVisita, chiaveBozzaVisita } from "../../utils/bozzaVisita";
import { TITOLI_MEDICO, titoloMedico } from "../../utils/doctorProfile";
import {
  GRUPPI_MODULI,
  MODULI_OPZIONALI,
  MODULI_VISITA_SPENTI,
  leggiModuliVisita,
  moduliDelGruppo,
  type ChiaveModuloOpzionale,
  type ModuliVisitaAttivi,
} from "../../utils/moduliVisita";
import {
  EVENTO_PAZIENTI_CAMBIATI,
  VOCI_FISSE_VISITA,
  conPazienteProva,
  conStatoGuida,
  deveAprirsiDaSola,
  leggiPazienteProva,
  leggiStatoGuida,
  type EsitoGuida,
} from "../../utils/guidaPrimoAvvio";
import { ATTRIBUTI_LIVELLO_GUIDA } from "./livelloGuida";
import ProvaGuidata from "./ProvaGuidata";
import { Battuta, Nuvoletta } from "./Narratore";

const SU_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const TASTO_MOD = SU_MAC ? "Cmd" : "Ctrl";

type Fase = "benvenuto" | "studio" | "moduli" | "prova" | "fine";

/** Le fasi con la barra di avanzamento: benvenuto e chiusura non contano. */
const FASI_NUMERATE: Fase[] = ["studio", "moduli", "prova"];

/**
 * Come si arriva alla chiusura: dalla fine della prova, oppure per il paziente
 * di prova che le versioni fino al 28 settembre 2026 registravano
 * nell'archivio vero, rimasto li' da una prova interrotta. Ora la prova gira
 * su un archivio in memoria e non lascia niente, ma chi aveva quella versione
 * puo' avere ancora il paziente da cancellare.
 */
type VarianteFine = "completata" | "interrotta";


type DatiStudio = Pick<Ambulatorio, "nome" | "indirizzo" | "cap" | "citta">;

const STUDIO_VUOTO: DatiStudio = { nome: "", indirizzo: "", cap: "", citta: "" };

function studioPrimario(doctor: Doctor | null): Ambulatorio | null {
  return doctor?.ambulatori?.find((a) => a.isPrimario) ?? doctor?.ambulatori?.[0] ?? null;
}

/**
 * Le preferenze si salvano come un oggetto unico: due scritture ravvicinate
 * (un interruttore e subito dopo un altro) leggerebbero la stessa copia e la
 * seconda cancellerebbe la prima. In coda, ognuna parte dall'ultima salvata.
 */
let codaPreferenze: Promise<unknown> = Promise.resolve();
function aggiornaPreferenze(
  modifica: (prefs: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const lavoro = codaPreferenze.then(async () => {
    const prefs = (await PreferenceService.getPreferences()) ?? {};
    await PreferenceService.savePreferences(modifica(prefs));
  });
  codaPreferenze = lavoro.catch(() => {});
  return lavoro;
}

// ─── Contesto: chi apre la guida ──────────────────────────────────────────

type GuidaContextValue = { apri: () => void };

const GuidaContext = createContext<GuidaContextValue | null>(null);

export function useGuidaPrimoAvvio(): GuidaContextValue {
  const ctx = useContext(GuidaContext);
  if (!ctx) throw new Error("useGuidaPrimoAvvio va usato dentro GuidaPrimoAvvioProvider");
  return ctx;
}

/**
 * Tiene la guida e la apre da sola al primo ingresso nella dashboard, se
 * `deveAprirsiDaSola` lo dice (archivio vuoto, guida mai chiusa). Il
 * controllo si fa una volta per sessione: chi la salta e resta con l'archivio
 * vuoto non se la ritrova a ogni ritorno sulla dashboard.
 */
export function GuidaPrimoAvvioProvider({ children }: { children: ReactNode }) {
  const [aperta, setAperta] = useState<null | { interrotta: boolean }>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const controllata = useRef(false);

  // Al primo passaggio dalla dashboard: guida da aprire, o paziente di prova
  // rimasto da una prova interrotta della versione precedente.
  useEffect(() => {
    if (controllata.current || pathname !== "/") return;
    controllata.current = true;
    void Promise.all([PreferenceService.getPreferences(), PatientService.getAllPatients()])
      .then(([prefs, pazienti]) => {
        if (leggiPazienteProva(prefs)) setAperta({ interrotta: true });
        else if (deveAprirsiDaSola(prefs, pazienti.length)) setAperta({ interrotta: false });
      })
      .catch(() => {});
  }, [pathname]);

  // La guida parte sempre dalla dashboard: e' li' che comincia la prova. Se
  // c'e' ancora il paziente di una prova interrotta si decide prima di lui.
  const apri = useCallback(() => {
    navigate("/");
    void PreferenceService.getPreferences()
      .then((prefs) => setAperta({ interrotta: Boolean(leggiPazienteProva(prefs)) }))
      .catch(() => setAperta({ interrotta: false }));
  }, [navigate]);

  const value = useMemo(() => ({ apri }), [apri]);

  return (
    <GuidaContext.Provider value={value}>
      {children}
      {aperta && (
        <GuidaPrimoAvvio
          key={aperta.interrotta ? "interrotta" : "guida"}
          interrotta={aperta.interrotta}
          onChiudi={() => setAperta(null)}
        />
      )}
    </GuidaContext.Provider>
  );
}

// ─── Pezzi comuni ─────────────────────────────────────────────────────────

function Avanzamento({ fase }: { fase: Fase }) {
  const indice = FASI_NUMERATE.indexOf(fase);
  if (indice < 0) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-center gap-2"
        role="progressbar"
        aria-valuenow={indice + 1}
        aria-valuemin={1}
        aria-valuemax={FASI_NUMERATE.length}
        aria-label={`Fase ${indice + 1} di ${FASI_NUMERATE.length}`}
      >
        {FASI_NUMERATE.map((f, i) => (
          <div
            key={f}
            className={`onboarding-step-pill ${
              CLASSE_PILLOLA[i < indice ? "done" : i === indice ? "active" : "future"]
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * La testata del referto come la stampa `PdfService.drawHeader`: a sinistra
 * chi firma, a destra lo studio e i recapiti, filetto doppio e titolo su
 * fascia grigia. Serve a far vedere a che cosa servono i campi mentre li si
 * scrive; le misure sono quelle dello schermo, non del foglio.
 */
function AnteprimaIntestazione({
  doctor,
  titolo,
  studio,
  mostraTelefono,
  mostraEmail,
}: {
  doctor: Doctor | null;
  titolo: TitoloMedico;
  studio: DatiStudio;
  mostraTelefono: boolean;
  mostraEmail: boolean;
}) {
  const nome = [titolo, doctor?.nome, doctor?.cognome].filter(Boolean).join(" ");
  const indirizzo = [studio.indirizzo.trim(), [studio.cap.trim(), studio.citta.trim()].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" - ");
  const contatti = [
    mostraTelefono && doctor?.telefono ? `Tel ${doctor.telefono}` : "",
    mostraEmail && doctor?.email ? doctor.email : "",
  ].filter(Boolean);

  return (
    <div className="guida-anteprima" aria-label="Anteprima dell'intestazione del referto">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="guida-anteprima-nome">{nome || "Nome e cognome"}</p>
          {doctor?.specializzazione?.trim() && (
            <p className="guida-anteprima-riga">{doctor.specializzazione}</p>
          )}
        </div>
        <div className="min-w-0 text-right">
          <p className={`guida-anteprima-riga ${studio.nome.trim() ? "" : "guida-anteprima-vuoto"}`}>
            {studio.nome.trim() || "Nome dello studio"}
          </p>
          <p className={`guida-anteprima-riga ${indirizzo ? "" : "guida-anteprima-vuoto"}`}>
            {indirizzo || "Indirizzo - CAP Città"}
          </p>
          {contatti.length > 0 && (
            <p className="guida-anteprima-riga">{contatti.join("   -   ")}</p>
          )}
          {doctor?.partitaIva?.trim() && (
            <p className="guida-anteprima-riga">P.IVA {doctor.partitaIva}</p>
          )}
        </div>
      </div>
      <div className="guida-anteprima-filetto" />
      <div className="guida-anteprima-titolo">VISITA CARDIOLOGICA</div>
    </div>
  );
}

// ─── La guida ─────────────────────────────────────────────────────────────

function GuidaPrimoAvvio({
  interrotta,
  onChiudi,
}: {
  /** Aperta per il paziente di prova rimasto da una versione precedente. */
  interrotta: boolean;
  onChiudi: () => void;
}) {
  const navigate = useNavigate();
  const idTitolo = useId();
  const [fase, setFase] = useState<Fase>(interrotta ? "fine" : "benvenuto");
  const [varianteFine, setVarianteFine] = useState<VarianteFine>(
    interrotta ? "interrotta" : "completata",
  );
  const [cenno, setCenno] = useState(0);
  const [parla, setParla] = useState(false);
  const fermo = useReducedMotion() ?? false;
  const [pazienteProva, setPazienteProva] = useState<Patient | null>(null);
  const [cancellaProva, setCancellaProva] = useState(true);
  const [esitoPrecedente, setEsitoPrecedente] = useState<EsitoGuida | null>(null);
  /** La prova e' finita e si sta tornando in dashboard (vedi `lasciaLaProva`). */
  const [uscita, setUscita] = useState<null | "completata" | "saltata">(null);
  const { pathname } = useLocation();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [numeroPazienti, setNumeroPazienti] = useState(0);
  const [titolo, setTitolo] = useState<TitoloMedico>("Dott.");
  const [studio, setStudio] = useState<DatiStudio>(STUDIO_VUOTO);
  const [studioSalvato, setStudioSalvato] = useState<DatiStudio | null>(null);
  const [moduli, setModuli] = useState<ModuliVisitaAttivi>({ ...MODULI_VISITA_SPENTI });
  const [contattiInPdf, setContattiInPdf] = useState({ telefono: true, email: true });
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [d, prefs, pazienti] = await Promise.all([
          DoctorService.getDoctor(),
          PreferenceService.getPreferences(),
          PatientService.getAllPatients(),
        ]);
        setDoctor(d);
        setTitolo(titoloMedico(d));
        const primario = studioPrimario(d);
        if (primario) {
          const dati = {
            nome: primario.nome ?? "",
            indirizzo: primario.indirizzo ?? "",
            cap: primario.cap ?? "",
            citta: primario.citta ?? "",
          };
          setStudio(dati);
          setStudioSalvato(dati);
        }
        setModuli(leggiModuliVisita(prefs));
        setContattiInPdf({
          telefono: prefs?.showDoctorPhoneInPdf !== false,
          email: prefs?.showDoctorEmailInPdf !== false,
        });
        setNumeroPazienti(pazienti.length);
        setEsitoPrecedente(leggiStatoGuida(prefs)?.esito ?? null);
        const idProva = leggiPazienteProva(prefs);
        if (idProva) setPazienteProva(pazienti.find((p) => p.id === idProva) ?? null);
      } catch {
        // La guida resta usabile anche senza dati: i campi partono vuoti.
      }
    })();
  }, []);

  const chiudi = useCallback(
    (esito: EsitoGuida) => {
      void aggiornaPreferenze((prefs) => conStatoGuida(prefs, esito)).catch(() => {});
      onChiudi();
    },
    [onChiudi],
  );

  const vaiA = useCallback((prossima: Fase) => {
    setErrore(null);
    setCenno((n) => n + 1);
    setFase(prossima);
  }, []);

  // Arrivare alla fine della prova vale come guida completata, anche se poi
  // si chiude la finestra invece di premere un pulsante.
  useEffect(() => {
    if (fase === "fine" && varianteFine === "completata") {
      void aggiornaPreferenze((prefs) => conStatoGuida(prefs, "completata")).catch(() => {});
    }
  }, [fase, varianteFine]);

  /** Esito da registrare chiudendo: una prova interrotta non cancella una completata. */
  const esitoDiChiusura: EsitoGuida =
    varianteFine === "completata" ? "completata" : (esitoPrecedente ?? "saltata");

  /**
   * Finita la prova, o usciti a meta', si torna in dashboard e solo li' la
   * prova si chiude, con il suo archivio. In quest'ordine la pagina della
   * prova (la visita di un paziente inventato) si smonta mentre l'archivio di
   * prova e' ancora aperto, e quello che scrive uscendo, come la bozza della
   * visita, finisce nella memoria che si butta e non nell'archivio vero.
   */
  const lasciaLaProva = useCallback(
    (come: "completata" | "saltata") => {
      navigate("/");
      setUscita(come);
    },
    [navigate],
  );

  useEffect(() => {
    if (!uscita || pathname !== "/") return;
    setUscita(null);
    if (uscita === "saltata") {
      chiudi("saltata");
      return;
    }
    setVarianteFine("completata");
    setCenno((n) => n + 1);
    setFase("fine");
  }, [uscita, pathname, chiudi]);

  // Tastiera nelle fasi a finestra. Le scorciatoie dell'app (Ctrl+N, Ctrl+K,
  // Ctrl+P...) si fermano qui, in cattura: aprirebbero un modal sotto la
  // guida. Nella prova le gestisce `ProvaGuidata`, che le lascia passare
  // quando il passo chiede di provarle.
  useEffect(() => {
    if (fase === "prova") return;
    const suTasto = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["n", "k", "p", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape" && fase !== "fine") {
        e.preventDefault();
        chiudi("saltata");
      }
    };
    window.addEventListener("keydown", suTasto, true);
    return () => window.removeEventListener("keydown", suTasto, true);
  }, [fase, chiudi]);

  /**
   * Chiude la guida dalla fase finale. Il paziente di prova di una versione
   * precedente, se c'e', si cancella con le sue visite e i suoi documenti
   * (`deletePatient`) e con la bozza della visita; oppure resta, e la guida
   * smette di ricordarlo.
   */
  const concludi = async (dopo: "dashboard" | "paziente") => {
    setSalvando(true);
    try {
      if (pazienteProva && cancellaProva) {
        await PatientService.deletePatient(pazienteProva.id);
        void cancellaBozzaVisita(chiaveBozzaVisita(undefined, pazienteProva.id));
      }
      await aggiornaPreferenze((prefs) => conPazienteProva(prefs, null));
    } catch {
      // Se la cancellazione non riesce il paziente resta, e si toglie da
      // Pazienti come ogni altro: non vale la pena bloccare la chiusura.
    } finally {
      setSalvando(false);
    }
    chiudi(esitoDiChiusura);
    navigate(dopo === "paziente" ? "/add-patient" : "/");
    window.dispatchEvent(new CustomEvent(EVENTO_PAZIENTI_CAMBIATI));
  };

  const scegliTitolo = (t: TitoloMedico) => {
    if (t === titolo) return;
    setTitolo(t);
    setCenno((n) => n + 1);
    // Si salva subito, come un interruttore: e' una scelta, non un modulo.
    void DoctorService.updateDoctor({ titolo: t })
      .then((d) => {
        setDoctor(d);
        window.dispatchEvent(new CustomEvent("appdottori-doctor-updated"));
      })
      .catch(() => setErrore("Non sono riuscito a salvare il titolo."));
  };

  const studioCompleto = Boolean(studio.nome.trim() && studio.indirizzo.trim());
  const studioCambiato =
    !studioSalvato ||
    (Object.keys(STUDIO_VUOTO) as Array<keyof DatiStudio>).some(
      (k) => studio[k].trim() !== studioSalvato[k].trim(),
    );

  const salvaStudio = async () => {
    if (!studioCompleto) return;
    if (!studioCambiato) {
      vaiA("moduli");
      return;
    }
    setSalvando(true);
    setErrore(null);
    try {
      const dati: DatiStudio = {
        nome: studio.nome.trim(),
        indirizzo: studio.indirizzo.trim(),
        cap: studio.cap.trim(),
        citta: studio.citta.trim(),
      };
      const esistenti = doctor?.ambulatori ?? [];
      const primario = studioPrimario(doctor);
      // Se c'e' gia' una sede si corregge quella in uso, non se ne aggiunge
      // un'altra: chi riapre la guida da Aiuto non deve ritrovarsi due studi.
      const lista: Ambulatorio[] = primario
        ? esistenti.map((a) => (a.id === primario.id ? { ...a, ...dati } : a))
        : [...esistenti, { id: Date.now().toString(), ...dati, telefono: "", isPrimario: true }];
      const aggiornato = await DoctorService.updateDoctor({ ambulatori: lista });
      setDoctor(aggiornato);
      setStudioSalvato(dati);
      window.dispatchEvent(new CustomEvent("appdottori-doctor-updated"));
      vaiA("moduli");
    } catch {
      setErrore("Non sono riuscito a salvare lo studio. Riprova o saltalo: lo trovi in Impostazioni.");
    } finally {
      setSalvando(false);
    }
  };

  const cambiaModulo = (chiave: ChiaveModuloOpzionale, attivo: boolean) => {
    setModuli((prev) => ({ ...prev, [chiave]: attivo }));
    if (attivo) setCenno((n) => n + 1);
    // Si unisce al registro salvato chiave per chiave: due clic ravvicinati
    // non si cancellano a vicenda.
    void aggiornaPreferenze((prefs) => ({
      ...prefs,
      moduliVisita: { ...leggiModuliVisita(prefs), [chiave]: attivo },
    })).catch(() => setErrore("Non sono riuscito a salvare i moduli."));
  };

  // ── Prova sull'app vera ──
  if (fase === "prova") {
    return (
      <ProvaGuidata
        mod={TASTO_MOD}
        onCompletata={() => lasciaLaProva("completata")}
        onEsci={() => lasciaLaProva("saltata")}
      />
    );
  }

  // ── Fasi a finestra ──
  const larghezza =
    fase === "moduli" ? "max-w-[60rem]" : fase === "studio" ? "max-w-[44rem]" : "max-w-[34rem]";

  let contenuto: ReactNode;
  if (fase === "benvenuto") {
    contenuto = (
      <div className="flex flex-col items-center text-center gap-5">
        {/* Nessun "Benvenuto" e nessun nome col titolo: il titolo si sceglie
            al passo dopo, e fino ad allora vale "Dott." per tutti. */}
        <h1 id={idTitolo} className="guida-titolo">
          Ti diamo il benvenuto in Corioli Cardiologia
        </h1>
        <div className="guida-narratore w-full text-left">
          <div className="guida-narratore-gufo">
            <DoctorMascot size={104} saluta={parla} parla={parla} nodSignal={cenno} />
          </div>
          <Nuvoletta className="min-w-0 flex-1">
            <p className="guida-sottotitolo">
              <Battuta
                testo="Ciao! Ti accompagno io. Prima prepariamo il tuo studio, poi proviamo Corioli insieme su qualche paziente di prova. Ci vogliono cinque minuti."
                onParla={setParla}
              />
            </p>
          </Nuvoletta>
        </div>
        <ol className="w-full space-y-2.5 text-left">
          {[
            { icona: Building2, titolo: "Il tuo studio", testo: "Titolo e indirizzo in testa ai referti" },
            { icona: Stethoscope, titolo: "La visita", testo: "Le sezioni che usi davvero" },
            {
              icona: MousePointerClick,
              titolo: "Provala",
              testo:
                "Su pazienti inventati con anni di visite: cerchi, guardi l'andamento degli esami, scrivi e stampi il referto. Uscendo ritrovi il tuo archivio com'era.",
            },
          ].map(({ icona: Icona, titolo: t, testo }, i) => (
            <motion.li
              key={t}
              className="guida-elenco-voce"
              initial={fermo ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.12, duration: 0.3, ease: "easeOut" }}
            >
              <span className="guida-elenco-icona">
                <Icona size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">
                  {i + 1}. {t}
                </span>
                <span className="block text-[14px] text-default-600">{testo}</span>
              </span>
            </motion.li>
          ))}
        </ol>
        <div className="w-full space-y-2">
          <Button
            color="primary"
            className="onboarding-cta-btn w-full"
            onPress={() => vaiA("studio")}
            endContent={<ArrowRight size={18} />}
            autoFocus
          >
            Iniziamo
          </Button>
          <Button
            variant="light"
            className="onboarding-back-btn w-full"
            onPress={() => chiudi("saltata")}
          >
            Salta, la ritrovo in Aiuto
          </Button>
        </div>
      </div>
    );
  } else if (fase === "studio") {
    contenuto = (
      <div className="flex flex-col gap-3">
        <Avanzamento fase={fase} />
        <div className="guida-narratore">
          {/* Guarda in basso, verso l'anteprima del referto. */}
          <div className="guida-narratore-gufo">
            <DoctorMascot size={64} parla={parla} nodSignal={cenno} sguardo={{ x: 0.4, y: 1 }} />
          </div>
          <Nuvoletta className="min-w-0 flex-1">
            <h1 id={idTitolo} className="guida-titolo">
              Il tuo studio
            </h1>
            <p className="guida-sottotitolo">
              <Battuta
                testo="Quello che scrivi qui esce in testa a ogni referto. Guarda l'anteprima qui sotto."
                onParla={setParla}
              />
            </p>
          </Nuvoletta>
        </div>

        <div className="space-y-2">
          <p className="guida-etichetta">Titolo, nel saluto e nei referti</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Titolo">
            {TITOLI_MEDICO.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={titolo === t}
                onClick={() => scegliTitolo(t)}
                className={`guida-scelta ${titolo === t ? "guida-scelta--attiva" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="guida-etichetta">Studio in cui visiti</p>
            <p className="text-[13px] text-default-500">
              Altre sedi da Impostazioni › Ambulatori
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nome dello studio"
              placeholder="Es. Studio di cardiologia"
              value={studio.nome}
              onValueChange={(v) => setStudio((s) => ({ ...s, nome: v }))}
              variant="bordered"
              isRequired
              autoFocus
            />
            <Input
              label="Indirizzo"
              placeholder="Es. Via Roma 12"
              value={studio.indirizzo}
              onValueChange={(v) => setStudio((s) => ({ ...s, indirizzo: v }))}
              variant="bordered"
              isRequired
            />
            <Input
              label="CAP"
              value={studio.cap}
              onValueChange={(v) => setStudio((s) => ({ ...s, cap: v }))}
              variant="bordered"
              inputMode="numeric"
              maxLength={5}
            />
            <Input
              label="Città"
              value={studio.citta}
              onValueChange={(v) => setStudio((s) => ({ ...s, citta: v }))}
              variant="bordered"
              onKeyDown={(e) => {
                if (e.key === "Enter") void salvaStudio();
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="guida-etichetta">Così esce in testa al referto</p>
          <AnteprimaIntestazione
            doctor={doctor}
            titolo={titolo}
            studio={studio}
            mostraTelefono={contattiInPdf.telefono}
            mostraEmail={contattiInPdf.email}
          />
        </div>

        {errore && (
          <p className="text-[14px] text-danger" role="alert">
            {errore}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="light"
            className="guida-btn-secondario"
            onPress={() => vaiA("benvenuto")}
            startContent={<ArrowLeft size={16} />}
          >
            Indietro
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="light" className="guida-btn-secondario" onPress={() => vaiA("moduli")}>
              Salta questo passo
            </Button>
            <Button
              color="primary"
              className="guida-btn-primario"
              isDisabled={!studioCompleto}
              isLoading={salvando}
              onPress={() => void salvaStudio()}
              endContent={!salvando ? <ArrowRight size={16} /> : null}
            >
              {studioCambiato ? "Salva e continua" : "Continua"}
            </Button>
          </div>
        </div>
      </div>
    );
  } else if (fase === "moduli") {
    const attivi = MODULI_OPZIONALI.filter((m) => moduli[m.chiave]).length;
    contenuto = (
      <div className="flex flex-col gap-4">
        <Avanzamento fase={fase} />
        <div className="guida-narratore">
          <div className="guida-narratore-gufo">
            <DoctorMascot size={72} parla={parla} nodSignal={cenno} sguardo={{ x: 0.2, y: 1 }} />
          </div>
          <Nuvoletta className="min-w-0 flex-1">
            <h1 id={idTitolo} className="guida-titolo">
              La visita
            </h1>
            <p className="guida-sottotitolo">
              <Battuta
                testo="Accendi gli esami che referti anche tu: gli altri restano nascosti. Li cambi quando vuoi da Impostazioni."
                onParla={setParla}
              />
            </p>
          </Nuvoletta>
        </div>

        {/* Una riga di testo e non dieci chip: e' il contorno della scelta, e
            a 1280x720 le chip spingevano gli interruttori sotto il bordo. */}
        <div className="guida-voci-fisse">
          <Check size={18} aria-hidden className="shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold text-foreground">Sempre presenti: </span>
            {VOCI_FISSE_VISITA.join(" · ")}
          </p>
        </div>

        {/* I due gruppi affiancati: uno sotto l'altro la card superava i 720px
            di un Full HD al 150%, e il pulsante per andare avanti finiva sotto
            il bordo della finestra. */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
          {GRUPPI_MODULI.map(({ gruppo, titolo: titoloGruppo, nota }) => (
            <div key={gruppo} className="space-y-2">
              <div>
                <p className="guida-etichetta">{titoloGruppo}</p>
                {nota && <p className="text-[13px] text-default-500 mt-0.5">{nota}</p>}
              </div>
              <div
                className={`grid grid-cols-1 gap-2 md:grid-cols-2 ${
                  moduliDelGruppo(gruppo).length > 2 ? "" : "lg:grid-cols-1"
                }`}
              >
                {moduliDelGruppo(gruppo).map((modulo) => (
                  <Switch
                    key={modulo.chiave}
                    isSelected={moduli[modulo.chiave]}
                    onValueChange={(v) => cambiaModulo(modulo.chiave, v)}
                    aria-label={`Attiva il modulo ${modulo.titolo}`}
                    classNames={{
                      base: "guida-modulo inline-flex flex-row-reverse w-full max-w-none items-center justify-between gap-3 cursor-pointer data-[selected=true]:border-[#1D9E75] data-[selected=true]:bg-[#F2FAF7]",
                      wrapper: "shrink-0",
                    }}
                  >
                    <span className="flex flex-col">
                      <span className="text-[15px] font-medium text-foreground">
                        {modulo.breve ?? modulo.titolo}
                      </span>
                      <span className="text-[13px] leading-snug text-default-500">
                        {modulo.descrizione}
                      </span>
                    </span>
                  </Switch>
                ))}
              </div>
            </div>
          ))}
        </div>

        {errore && (
          <p className="text-[14px] text-danger" role="alert">
            {errore}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="light"
            className="guida-btn-secondario"
            onPress={() => vaiA("studio")}
            startContent={<ArrowLeft size={16} />}
          >
            Indietro
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-[14px] text-default-500">
              {attivi === 0 ? "Solo le voci di base" : `${attivi} ${attivi === 1 ? "modulo acceso" : "moduli accesi"}`}
            </span>
            <Button
              color="primary"
              className="guida-btn-primario"
              onPress={() => {
                navigate("/");
                vaiA("prova");
              }}
              endContent={<ArrowRight size={16} />}
            >
              Continua
            </Button>
          </div>
        </div>
      </div>
    );
  } else {
    const moduliAccesi = MODULI_OPZIONALI.filter((m) => moduli[m.chiave]).map(
      (m) => m.breve ?? m.titolo,
    );
    // Lo studio saltato resta segnalato come da fare: senza, il referto esce
    // con l'intestazione a meta'.
    const riepilogo = [
      {
        titolo: "Intestazione dei referti",
        testo: studioSalvato
          ? [studioSalvato.nome, studioSalvato.citta].filter(Boolean).join(", ")
          : "Da completare in Impostazioni › Ambulatori",
        fatto: Boolean(studioSalvato),
      },
      {
        titolo: "Moduli della visita",
        testo: moduliAccesi.length > 0 ? moduliAccesi.join(", ") : "Solo le voci di base",
        fatto: true,
      },
      {
        titolo: "Copia di sicurezza",
        testo: "L'archivio resta su questo computer, con una copia automatica ogni giorno",
        fatto: true,
      },
    ];
    // L'archivio vero e' vuoto, tolto l'eventuale paziente di prova rimasto?
    const archivioVuoto =
      numeroPazienti - (pazienteProva && cancellaProva ? 1 : 0) <= 0;
    const completata = varianteFine === "completata";
    const nomeProva = pazienteProva
      ? (formatPatientDisplayName(pazienteProva) ?? "il paziente di prova")
      : null;

    contenuto = (
      <div className="flex flex-col items-center text-center gap-5">
        <h1 id={idTitolo} className="guida-titolo">
          {completata ? "Tutto pronto" : "Il paziente di prova"}
        </h1>
        <div className="guida-narratore w-full text-left">
          <div className="guida-narratore-gufo">
            <DoctorMascot
              size={completata ? 80 : 72}
              festeggia={completata}
              happy={!completata}
              parla={parla}
              saluta={completata && !parla}
            />
          </div>
          <Nuvoletta className="min-w-0 flex-1">
            <p className="guida-sottotitolo">
              <Battuta
                testo={
                  !completata
                    ? "La prova si è fermata a metà e il paziente di prova è ancora in archivio. Lo cancello?"
                    : archivioVuoto
                      ? "Ben fatto! I pazienti di prova se ne sono andati: ora tocca a quelli veri."
                      : "Ben fatto! I pazienti di prova se ne sono andati e l'archivio è di nuovo il tuo."
                }
                onParla={setParla}
              />
            </p>
          </Nuvoletta>
        </div>
        {completata && (
          <ul className="w-full space-y-2.5 text-left">
            {riepilogo.map(({ titolo: t, testo, fatto }) => (
              <li key={t} className="guida-elenco-voce">
                <span className={`guida-elenco-icona ${fatto ? "" : "guida-elenco-icona--attesa"}`}>
                  {fatto ? <Check size={20} /> : <CircleDashed size={20} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-foreground">{t}</span>
                  <span className="block text-[14px] text-default-600">{testo}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {nomeProva && (
          <Switch
            isSelected={cancellaProva}
            onValueChange={setCancellaProva}
            classNames={{
              base: "guida-modulo inline-flex flex-row-reverse w-full max-w-none items-center justify-between gap-3 cursor-pointer text-left data-[selected=true]:border-[#1D9E75] data-[selected=true]:bg-[#F2FAF7]",
              wrapper: "shrink-0",
            }}
          >
            <span className="flex flex-col">
              <span className="text-[15px] font-medium text-foreground">
                Cancella {nomeProva} dall'archivio
              </span>
              <span className="text-[13px] leading-snug text-default-500">
                È il paziente registrato durante la prova; si cancellano anche le sue visite.
                Spento, resta in archivio.
              </span>
            </span>
          </Switch>
        )}
        <div className="w-full space-y-2">
          {completata && archivioVuoto ? (
            <>
              <Button
                color="primary"
                className="onboarding-cta-btn w-full"
                isLoading={salvando}
                onPress={() => void concludi("paziente")}
                endContent={!salvando ? <ArrowRight size={18} /> : null}
                autoFocus
              >
                Registra il primo paziente
              </Button>
              <Button
                variant="light"
                className="onboarding-back-btn w-full"
                isDisabled={salvando}
                onPress={() => void concludi("dashboard")}
              >
                Vai alla dashboard
              </Button>
            </>
          ) : (
            <Button
              color="primary"
              className="onboarding-cta-btn w-full"
              isLoading={salvando}
              onPress={() => void concludi("dashboard")}
              autoFocus
            >
              {completata ? "Torna alla dashboard" : "Fatto"}
            </Button>
          )}
          <p className="pt-1 text-[13px] text-default-500">
            La guida resta in Aiuto, se vuoi rifarla.
          </p>
        </div>
      </div>
    );
  }

  return createPortal(
    <div
      className="guida-area"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitolo}
      {...ATTRIBUTI_LIVELLO_GUIDA}
    >
      <motion.div
        className={`guida-card ${larghezza}`}
        initial={fermo ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        {/* Una fase lascia il posto all'altra scivolando: si capisce che si
            va avanti (o indietro) invece di vedere il contenuto cambiare di
            colpo. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={fase}
            className="px-8 py-5"
            initial={fermo ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={fermo ? undefined : { opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {contenuto}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body,
  );
}
