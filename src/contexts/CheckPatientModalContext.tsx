import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Input,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@nextui-org/react";
import { CalendarPlus, FileText, Search, UserPlus } from "lucide-react";
import { PatientService, VisitService } from "../services/OfflineServices";
import type { Patient } from "../types/Storage";
import { CodiceFiscaleValue } from "../components/CodiceFiscaleValue";
import { AppModal } from "../components/AppModal";
import { useUnsavedChanges } from "./UnsavedChangesContext";
import { calculateAge } from "../utils/dateUtils";
import { formatPatientDisplayName, patientInitials } from "../utils/patientDisplay";
import {
  cercaPazienti,
  sembraCodiceFiscale,
  ultimaVisitaPerPaziente,
} from "../utils/ricercaPazienti";

/**
 * Il pannello di ricerca del paziente, in due modi.
 *
 * - **visita** (Ctrl+N, "Nuova visita"): scelto il paziente si apre subito la
 *   maschera della visita. Prima si passava dalla scheda e serviva un altro
 *   clic su "Nuova visita", mentre il paziente e' gia' seduto davanti.
 * - **cerca** (Ctrl+K, la ricerca nella barra in alto): scelto il paziente si
 *   apre la scheda.
 *
 * In entrambi la riga ha l'azione dell'altro modo come pulsante secondario.
 * La ricerca e' per cognome, nome o codice fiscale (`cercaPazienti`): prima
 * era solo per codice fiscale, e bastava un paziente in archivio senza CF per
 * spegnere i suggerimenti a tutti.
 */
type Modo = "visita" | "cerca";

type CheckPatientModalContextValue = {
  openCheckPatientModal: () => void;
  openPatientSearch: () => void;
  closeCheckPatientModal: () => void;
};

const CheckPatientModalContext =
  createContext<CheckPatientModalContextValue | null>(null);

const MAX_RISULTATI = 8;
const MAX_RECENTI = 5;

function formattaData(iso: string): string {
  const [a, m, g] = iso.split("-");
  return a && m && g ? `${g}/${m}/${a}` : iso;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable ||
        el.getAttribute("role") === "textbox"),
  );
}

export function CheckPatientModalProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // Il pannello si apre anche da dentro una visita (Ctrl+N, Ctrl+K): uscirne
  // verso un altro paziente passa dalla stessa conferma delle modifiche.
  const { guardAction } = useUnsavedChanges();
  const [modo, setModo] = useState<Modo | null>(null);
  const [query, setQuery] = useState("");
  const [pazienti, setPazienti] = useState<Patient[]>([]);
  const [ultimaVisita, setUltimaVisita] = useState<Map<string, string>>(new Map());
  const [evidenziato, setEvidenziato] = useState(0);

  const apri = useCallback((m: Modo) => {
    setQuery("");
    setEvidenziato(0);
    setModo(m);
  }, []);
  const openCheckPatientModal = useCallback(() => apri("visita"), [apri]);
  const openPatientSearch = useCallback(() => apri("cerca"), [apri]);
  const closeCheckPatientModal = useCallback(() => {
    setModo(null);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!modo) return;
    let cancelled = false;
    void Promise.all([PatientService.getAllPatients(), VisitService.getAllVisits()])
      .then(([tutti, visite]) => {
        if (cancelled) return;
        setPazienti(tutti);
        setUltimaVisita(ultimaVisitaPerPaziente(visite));
      })
      .catch((err) => {
        console.error("Errore nel caricamento pazienti per la ricerca:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [modo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.isComposing) return;
      const hasCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (!hasCmdOrCtrl || e.altKey || e.shiftKey) return;
      const tasto = e.key.toLowerCase();
      if (tasto === "n") {
        e.preventDefault();
        apri("visita");
      } else if (tasto === "k") {
        e.preventDefault();
        apri("cerca");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [apri]);

  const cercando = query.trim().length > 0;
  const risultati = useMemo(() => {
    if (cercando) return cercaPazienti(pazienti, query).slice(0, MAX_RISULTATI);
    // Senza ricerca: i pazienti visti per ultimi, che sono quelli che si
    // riaprono piu' spesso.
    return [...pazienti]
      .sort((a, b) => {
        const va = ultimaVisita.get(a.id) ?? (a.updatedAt ?? "").slice(0, 10);
        const vb = ultimaVisita.get(b.id) ?? (b.updatedAt ?? "").slice(0, 10);
        return vb.localeCompare(va);
      })
      .slice(0, MAX_RECENTI);
  }, [cercando, pazienti, query, ultimaVisita]);

  useEffect(() => {
    setEvidenziato(0);
  }, [query]);

  const vai = (href: string) => {
    closeCheckPatientModal();
    guardAction(() => navigate(href));
  };
  const apriVisita = (p: Patient) => vai(`/add-visit?patientId=${encodeURIComponent(p.id)}`);
  const apriScheda = (p: Patient) => vai(`/patient-history/${p.id}`);
  const principale = modo === "visita" ? apriVisita : apriScheda;
  const secondaria = modo === "visita" ? apriScheda : apriVisita;

  /**
   * Registra un paziente nuovo portando con se' quello che si e' gia' scritto:
   * il codice fiscale se la ricerca sembra un CF, altrimenti cognome e nome
   * (la prima parola e' il cognome, come si cerca). Nel form il pulsante
   * principale e' "Salva e inizia visita".
   */
  const registraNuovo = () => {
    const params = new URLSearchParams();
    const q = query.trim();
    if (q && sembraCodiceFiscale(q)) {
      params.set("cf", q.replace(/\s/g, "").toUpperCase());
    } else if (q) {
      const [cognome, ...nome] = q.split(/\s+/);
      params.set("cognome", cognome);
      if (nome.length) params.set("nome", nome.join(" "));
    }
    const qs = params.toString();
    vai(qs ? `/add-patient?${qs}` : "/add-patient");
  };

  // L'Input di NextUI passa `onKeyDown` a react-aria, che ferma la
  // propagazione di ogni tasto se non gli si dice il contrario: senza
  // `continuePropagation` l'Esc non arrivava al modal e il pannello non si
  // chiudeva.
  const onKeyDown = (
    e: ReactKeyboardEvent<HTMLInputElement> & { continuePropagation?: () => void },
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEvidenziato((i) => Math.min(i + 1, Math.max(risultati.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEvidenziato((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const scelto = risultati[evidenziato];
      if (scelto) principale(scelto);
      else if (cercando) registraNuovo();
    } else {
      e.continuePropagation?.();
    }
  };

  const value = useMemo(
    () => ({ openCheckPatientModal, openPatientSearch, closeCheckPatientModal }),
    [openCheckPatientModal, openPatientSearch, closeCheckPatientModal],
  );

  const titolo = modo === "visita" ? "Nuova visita" : "Cerca paziente";

  return (
    <CheckPatientModalContext.Provider value={value}>
      {children}
      <AppModal
        isOpen={modo !== null}
        onClose={closeCheckPatientModal}
        placement="top"
        backdrop="blur"
        size="xl"
        scrollBehavior="inside"
        classNames={{
          base: "border border-default-200 mt-24",
          header: "border-b border-default-100",
          footer: "border-t border-default-100",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-3 items-stretch">
            <span className="text-base font-semibold text-gray-900">{titolo}</span>
            <Input
              autoFocus
              aria-label="Cerca per cognome, nome o codice fiscale"
              spellCheck={false}
              autoComplete="off"
              placeholder="Cognome, nome o codice fiscale"
              value={query}
              onValueChange={setQuery}
              onKeyDown={onKeyDown}
              variant="bordered"
              size="lg"
              startContent={<Search size={18} className="text-default-500" />}
              classNames={{ input: "text-base", inputWrapper: "h-12" }}
            />
          </ModalHeader>
          <ModalBody className="px-3 py-3">
            {risultati.length > 0 && (
              <>
                <p className="px-2 text-xs font-medium text-default-600">
                  {cercando ? "Pazienti trovati" : "Visti di recente"}
                </p>
                <ul role="listbox" aria-label={titolo} className="flex flex-col gap-0.5">
                  {risultati.map((p, i) => {
                    const eta = p.dataNascita ? calculateAge(p.dataNascita) : null;
                    const ultima = ultimaVisita.get(p.id);
                    const attivo = i === evidenziato;
                    return (
                      <li
                        key={p.id}
                        role="option"
                        aria-selected={attivo}
                        onMouseEnter={() => setEvidenziato(i)}
                        className={`flex items-center gap-2 rounded-lg pr-2 transition-colors ${
                          attivo ? "bg-default-100" : ""
                        }`}
                      >
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => principale(p)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                        >
                          <span className="dashboard-pregnancy-avatar">{patientInitials(p)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-gray-900">
                              {formatPatientDisplayName(p) ?? "Paziente senza nome"}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-default-600">
                              {eta != null && <>{eta} anni · </>}
                              <CodiceFiscaleValue
                                value={p.codiceFiscale}
                                placeholder="CF non inserito"
                                generatedFromImport={Boolean(p.codiceFiscaleGenerato)}
                              />
                              {" · "}
                              {ultima ? `ultima visita ${formattaData(ultima)}` : "nessuna visita"}
                            </span>
                          </span>
                        </button>
                        <Button
                          size="sm"
                          variant="light"
                          tabIndex={-1}
                          className="shrink-0 text-default-700"
                          startContent={
                            modo === "visita" ? <FileText size={14} /> : <CalendarPlus size={14} />
                          }
                          onPress={() => secondaria(p)}
                        >
                          {modo === "visita" ? "Scheda" : "Nuova visita"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {cercando && risultati.length === 0 && (
              <div className="px-2 py-6 text-center">
                <p className="text-sm font-medium text-gray-900">Nessun paziente trovato</p>
                <p className="mt-1 text-sm text-default-600">
                  Premi Invio per registrare «{query.trim()}» come nuovo paziente.
                </p>
              </div>
            )}
            {!cercando && risultati.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-default-600">
                Nessun paziente in archivio.
              </p>
            )}
          </ModalBody>
          <ModalFooter className="flex items-center justify-between gap-3">
            <p className="text-xs text-default-600">
              <kbd className="corioli-kbd">↑</kbd> <kbd className="corioli-kbd">↓</kbd> per
              scegliere · <kbd className="corioli-kbd">Invio</kbd>{" "}
              {cercando && risultati.length === 0
                ? "registra il paziente"
                : modo === "visita"
                  ? "apre la visita"
                  : "apre la scheda"}
            </p>
            <Button
              variant="flat"
              startContent={<UserPlus size={16} />}
              onPress={registraNuovo}
            >
              Nuovo paziente
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>
    </CheckPatientModalContext.Provider>
  );
}

export function useCheckPatientModal() {
  const ctx = useContext(CheckPatientModalContext);
  if (!ctx) {
    throw new Error(
      "useCheckPatientModal must be used within CheckPatientModalProvider",
    );
  }
  return ctx;
}

/** Apre il modale e torna alla dashboard (compatibilità link /check-patient). */
export function CheckPatientOpener() {
  const { openCheckPatientModal } = useCheckPatientModal();
  const navigate = useNavigate();

  useEffect(() => {
    openCheckPatientModal();
    navigate("/", { replace: true });
  }, [openCheckPatientModal, navigate]);

  return null;
}
