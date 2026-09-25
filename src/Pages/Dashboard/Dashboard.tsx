import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useDeferredValue,
} from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardBody, Input, Button, Chip } from "@nextui-org/react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { brandSuccessAlertSx } from "../../utils/muiBrand";
import { SearchIcon } from "../../components/navbar/SearchIcon";
import {
  PatientService,
  DoctorService,
  PreferenceService,
  VisitService,
} from "../../services/OfflineServices";
import { PageHeader } from "../../components/PageHeader";
import { PatientGridSkeleton } from "../../components/AppStartupSkeleton";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import {
  Users,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  CalendarPlus,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { calculateAge } from "../../utils/dateUtils";
import { normalizeGruppi } from "../../utils/gruppiRicerca";
import { formatPatientDisplayName } from "../../utils/patientDisplay";
import { cercaPazienti, ultimaVisitaPerPaziente } from "../../utils/ricercaPazienti";
import type { Patient } from "../../types/Storage";

/**
 * Elenco dei pazienti.
 *
 * Era una griglia di schede: otto pazienti per schermata, ognuna con luogo di
 * nascita e genere ma senza l'ultima visita, il nome centrato e i dati
 * allineati a destra. Ora e' una tabella densa, 15-20 righe per schermata,
 * con le colonne che servono a riconoscere un paziente e a decidere cosa
 * farne, e l'azione piu' frequente ("Nuova visita") sulla riga.
 */

interface RecentPatientSearchEntry {
  id: string;
  name?: string;
  surname?: string;
  cf?: string;
  cfGenerated?: boolean;
}

type Ordine = "ultimaVisita" | "cognome";

const RECENT_PATIENT_SEARCHES_KEY = "appdottori_recent_patient_searches";
const MAX_RECENT_PATIENT_SEARCHES = 6;

const ROWS_PER_PAGE = 50;

function isNonEmpty(value?: string | null): value is string {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (v === "—" || v === "-") return false;
  return !/^[-—\s]+$/.test(v);
}

/** Completa con nome, cognome, CF e data di nascita. */
function hasCompleteAnagrafica(patient: Patient): boolean {
  return (
    isNonEmpty(patient.nome) &&
    isNonEmpty(patient.cognome) &&
    isNonEmpty(patient.codiceFiscale) &&
    isNonEmpty(patient.dataNascita)
  );
}

function chipValido(p: RecentPatientSearchEntry): boolean {
  return isNonEmpty(p.name) || isNonEmpty(p.surname) || isNonEmpty(p.cf);
}

function formattaData(iso: string): string {
  const [a, m, g] = iso.split("-");
  return a && m && g ? `${g}/${m}/${a}` : iso;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [ultimaVisita, setUltimaVisita] = useState<Map<string, string>>(new Map());
  const [ordine, setOrdine] = useState<Ordine>("ultimaVisita");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });
  const [recentPatientSearches, setRecentPatientSearches] = useState<
    RecentPatientSearchEntry[]
  >([]);
  const [currentPage, setCurrentPage] = useState(1);
  /** Serve solo a decidere se mostrare i badge dei gruppi nelle righe. */
  const [gruppiAbilitati, setGruppiAbilitati] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const [tutti, visite] = await Promise.all([
        PatientService.getAllPatients(),
        VisitService.getAllVisits(),
      ]);
      setPatients(tutti);
      setUltimaVisita(ultimaVisitaPerPaziente(visite));
    } catch (error) {
      console.error("Error fetching patient data:", error);
      setErrorMessage("Errore nel caricamento dei pazienti");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const msg = sessionStorage.getItem("appdottori_toast");
    if (msg) {
      setToast({ open: true, message: msg });
      sessionStorage.removeItem("appdottori_toast");
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        let raw = await PreferenceService.getRecentPatientSearches();
        if (!raw && typeof localStorage !== "undefined") {
          raw = localStorage.getItem(RECENT_PATIENT_SEARCHES_KEY);
          if (raw) await PreferenceService.setRecentPatientSearches(raw);
        }
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentPatientSearches(
            parsed
              .filter((p) => p && typeof p.id === "string")
              .slice(0, MAX_RECENT_PATIENT_SEARCHES),
          );
        }
      } catch {
        // ignore
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const caricaGruppi = async () => {
      try {
        const prefs = await PreferenceService.getPreferences();
        setGruppiAbilitati(Boolean(prefs?.gruppiRicercaEnabled));
      } catch {
        setGruppiAbilitati(false);
      }
    };
    void caricaGruppi();
    const onFocus = () => void caricaGruppi();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    DoctorService.initializeDefaultDoctor().catch((error) =>
      console.error("Error fetching doctor data:", error),
    );
    void loadPatients();
  }, [loadPatients]);

  const deferredSearch = useDeferredValue(searchTerm);
  const filteredPatients = useMemo(() => {
    // Con una ricerca l'ordine e' quello di pertinenza (`cercaPazienti`);
    // senza, quello scelto dalle intestazioni.
    if (deferredSearch.trim()) return cercaPazienti(patients, deferredSearch);
    const ordinati = [...patients];
    if (ordine === "cognome") {
      ordinati.sort((a, b) =>
        `${a.cognome ?? ""} ${a.nome ?? ""}`.localeCompare(
          `${b.cognome ?? ""} ${b.nome ?? ""}`,
          "it",
          { sensitivity: "base" },
        ),
      );
    } else {
      // Chi non ha visite va in fondo, fra loro dal piu' recente in anagrafica.
      ordinati.sort((a, b) => {
        const va = ultimaVisita.get(a.id) ?? "";
        const vb = ultimaVisita.get(b.id) ?? "";
        if (va !== vb) return vb.localeCompare(va);
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      });
    }
    return ordinati;
  }, [patients, deferredSearch, ordine, ultimaVisita]);

  const totalFiltered = filteredPatients.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ROWS_PER_PAGE));
  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredPatients.slice(start, start + ROWS_PER_PAGE);
  }, [filteredPatients, currentPage]);

  const recentValidChips = useMemo(
    () => recentPatientSearches.filter(chipValido),
    [recentPatientSearches],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, ordine]);

  useEffect(() => {
    // Mantieni in memoria solo pazienti ancora esistenti/aggiornati.
    if (patients.length === 0 || recentPatientSearches.length === 0) return;
    const byId = new Map(patients.map((p) => [p.id, p]));
    const normalized = recentPatientSearches
      .map((p) => {
        const live = byId.get(p.id);
        if (!live) return null;
        return {
          id: live.id,
          name: live.nome,
          surname: live.cognome,
          cf: live.codiceFiscale,
          cfGenerated: Boolean(live.codiceFiscaleGenerato),
        };
      })
      .filter(Boolean) as RecentPatientSearchEntry[];

    if (normalized.length !== recentPatientSearches.length) {
      setRecentPatientSearches(normalized);
      PreferenceService.setRecentPatientSearches(
        JSON.stringify(normalized),
      ).catch(() => {});
    }
  }, [patients, recentPatientSearches]);

  const saveRecentPatientSearch = useCallback((patient: RecentPatientSearchEntry) => {
    setRecentPatientSearches((prev) => {
      const next = [patient, ...prev.filter((p) => p.id !== patient.id)].slice(
        0,
        MAX_RECENT_PATIENT_SEARCHES,
      );
      PreferenceService.setRecentPatientSearches(JSON.stringify(next)).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const apriScheda = useCallback(
    (p: Patient) => {
      saveRecentPatientSearch({
        id: p.id,
        name: p.nome,
        surname: p.cognome,
        cf: p.codiceFiscale,
        cfGenerated: Boolean(p.codiceFiscaleGenerato),
      });
      navigate(`/patient-history/${p.id}`);
    },
    [navigate, saveRecentPatientSearch],
  );

  const intestazioneOrdinabile = (chiave: Ordine, etichetta: string) => {
    const attivo = !deferredSearch.trim() && ordine === chiave;
    const Freccia = chiave === "ultimaVisita" ? ArrowDown : ArrowUp;
    return (
      <button
        type="button"
        onClick={() => setOrdine(chiave)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          attivo ? "text-foreground" : ""
        }`}
        aria-pressed={attivo}
        title={`Ordina per ${etichetta.toLowerCase()}`}
      >
        {etichetta}
        {attivo && <Freccia size={12} aria-hidden />}
      </button>
    );
  };

  const HeaderActions = (
    <div className="flex gap-3 w-full md:w-auto">
      <Button
        color="primary"
        startContent={<UserPlus size={18} />}
        onPress={() => navigate("/add-patient")}
        className="font-medium flex-1 md:flex-none"
      >
        Nuovo paziente
      </Button>
    </div>
  );

  return (
    <div className="corioli-page space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Pazienti"
        subtitle={
          loading
            ? undefined
            : `${patients.length} ${patients.length === 1 ? "paziente" : "pazienti"} in archivio`
        }
        actions={HeaderActions}
      >
        <div>
          <Input
            placeholder="Cerca per cognome, nome o codice fiscale"
            aria-label="Cerca per cognome, nome o codice fiscale"
            size="lg"
            spellCheck={false}
            startContent={<SearchIcon size={20} className="text-default-500" />}
            value={searchTerm}
            onValueChange={setSearchTerm}
            variant="bordered"
            classNames={{
              input: "text-base",
              inputWrapper: "h-12 border-default-200 bg-white",
            }}
            isClearable
            onClear={() => setSearchTerm("")}
          />
          {recentValidChips.length > 0 && !searchTerm && (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 text-xs text-default-600">Aperti di recente:</span>
              {recentValidChips.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="flat"
                  className="shrink-0"
                  onPress={() => navigate(`/patient-history/${p.id}`)}
                >
                  {formatPatientDisplayName({ nome: p.name ?? "", cognome: p.surname ?? "" }) ?? (
                    <CodiceFiscaleValue value={p.cf} generatedFromImport={Boolean(p.cfGenerated)} />
                  )}
                </Button>
              ))}
              <Button
                size="sm"
                variant="light"
                className="h-6 min-w-0 shrink-0 px-2 text-xs text-default-600"
                onPress={() => {
                  setRecentPatientSearches([]);
                  PreferenceService.setRecentPatientSearches("[]").catch(() => {});
                }}
              >
                Pulisci
              </Button>
            </div>
          )}
        </div>
      </PageHeader>

      {loading && <PatientGridSkeleton />}

      {errorMessage && (
        <Card className="border-l-4 border-l-danger">
          <CardBody>
            <p className="text-danger">{errorMessage}</p>
          </CardBody>
        </Card>
      )}

      {!loading && filteredPatients.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-default-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-default-200 bg-default-50 text-left text-xs font-medium text-default-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">
                  {intestazioneOrdinabile("cognome", "Paziente")}
                </th>
                <th className="px-4 py-2.5 font-medium w-20">Età</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Codice fiscale</th>
                <th className="px-4 py-2.5 font-medium w-36">
                  {intestazioneOrdinabile("ultimaVisita", "Ultima visita")}
                </th>
                <th className="px-4 py-2.5 w-40">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-100">
              {paginatedPatients.map((p) => {
                const eta = p.dataNascita ? calculateAge(p.dataNascita) : null;
                const ultima = ultimaVisita.get(p.id);
                const gruppi = gruppiAbilitati ? normalizeGruppi(p.gruppiRicerca) : [];
                return (
                  <tr
                    key={p.id}
                    onClick={() => apriScheda(p)}
                    className="cursor-pointer transition-colors hover:bg-default-50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-gray-900">
                          {formatPatientDisplayName(p) ?? "Paziente senza nome"}
                        </span>
                        {!hasCompleteAnagrafica(p) && (
                          <span
                            className="text-xs font-medium text-warning-700"
                            title="Mancano nome, cognome, codice fiscale o data di nascita"
                          >
                            anagrafica incompleta
                          </span>
                        )}
                        {gruppi.map((g) => (
                          <Chip
                            key={g.nome}
                            size="sm"
                            variant="flat"
                            color="secondary"
                            classNames={{ content: "text-[11px] px-1" }}
                            startContent={<FlaskConical size={11} className="ml-1 shrink-0" />}
                          >
                            {g.nome}
                          </Chip>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-default-700">
                      {eta != null ? `${eta} a` : "—"}
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-default-700">
                      <CodiceFiscaleValue
                        value={p.codiceFiscale}
                        generatedFromImport={Boolean(p.codiceFiscaleGenerato)}
                      />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-default-700">
                      {ultima ? formattaData(ultima) : <span className="text-default-500">nessuna</span>}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      {/* Il clic sul pulsante non deve aprire anche la scheda. */}
                      <span onClick={(e) => e.stopPropagation()}>
                        {/* Senza bordo: con il bordo, una colonna di pulsanti
                            uguali pesava piu' dei nomi dei pazienti. */}
                        <Button
                          size="sm"
                          variant="light"
                          className="text-default-700"
                          startContent={<CalendarPlus size={14} />}
                          onPress={() =>
                            navigate(`/add-visit?patientId=${encodeURIComponent(p.id)}`)
                          }
                        >
                          Nuova visita
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            size="md"
            variant="flat"
            isDisabled={currentPage <= 1}
            onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
            startContent={<ChevronLeft size={18} />}
          >
            Precedente
          </Button>
          <span className="text-sm text-default-600">
            Pagina {currentPage} di {totalPages}
          </span>
          <Button
            size="md"
            variant="flat"
            isDisabled={currentPage >= totalPages}
            onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            endContent={<ChevronRight size={18} />}
          >
            Successiva
          </Button>
        </div>
      )}

      {!loading && filteredPatients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 bg-default-100 rounded-full flex items-center justify-center mb-6">
            <Users size={40} className="text-default-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchTerm ? "Nessun paziente trovato" : "Nessun paziente registrato"}
          </h3>
          <p className="text-default-600 max-w-md mx-auto mb-8">
            {searchTerm
              ? "Controlla il cognome o registra il paziente come nuovo."
              : "Inizia aggiungendo il tuo primo paziente."}
          </p>
          <Button
            color="primary"
            startContent={<UserPlus size={18} />}
            onPress={() => {
              const q = searchTerm.trim();
              if (!q) return navigate("/add-patient");
              const [cognome, ...nome] = q.split(/\s+/);
              const params = new URLSearchParams({ cognome });
              if (nome.length) params.set("nome", nome.join(" "));
              navigate(`/add-patient?${params}`);
            }}
            className="font-medium"
          >
            {searchTerm ? `Registra «${searchTerm.trim()}»` : "Nuovo paziente"}
          </Button>
        </div>
      )}

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity="success"
          variant="filled"
          sx={{ width: "100%", ...brandSuccessAlertSx }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
