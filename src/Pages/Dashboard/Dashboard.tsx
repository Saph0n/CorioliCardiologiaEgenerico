import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useDeferredValue,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Chip,
  Avatar,
} from "@nextui-org/react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { brandSuccessAlertSx } from "../../utils/muiBrand";
import { SearchIcon } from "../../components/navbar/SearchIcon";
import {
  PatientService,
  DoctorService,
  PreferenceService,
} from "../../services/OfflineServices";
import { PageHeader } from "../../components/PageHeader";
import { PatientGridSkeleton } from "../../components/AppStartupSkeleton";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import { Users, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { calculateAge } from "../../utils/dateUtils";

// Interfaccia compatibile con il componente esistente
interface PatientData {
  id: string; // Added ID for editing
  name?: string;
  surname?: string;
  birthday?: string;
  gender?: string;
  email?: string;
  phone?: string;
  cf?: string;
  cfGenerated?: boolean;
  birthplace?: string;
}

interface RecentPatientSearchEntry {
  id: string;
  name?: string;
  surname?: string;
  cf?: string;
  cfGenerated?: boolean;
}

const RECENT_PATIENT_SEARCHES_KEY = "appdottori_recent_patient_searches";
const MAX_RECENT_PATIENT_SEARCHES = 6;

const ROWS_PER_PAGE = 24;

function isNonEmpty(value?: string | null): value is string {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (v === "—" || v === "-") return false;
  return !/^[-—\s]+$/.test(v);
}

function hasDisplayName(patient: { name?: string; surname?: string }): boolean {
  return isNonEmpty(patient.name) || isNonEmpty(patient.surname);
}

/** Verde solo con nome, cognome, CF e data di nascita. */
function hasCompleteAnagrafica(patient: PatientData): boolean {
  return (
    isNonEmpty(patient.name) &&
    isNonEmpty(patient.surname) &&
    isNonEmpty(patient.cf) &&
    isNonEmpty(patient.birthday)
  );
}

function getDisplayName(patient: PatientData): string {
  return [patient.name, patient.surname].filter(isNonEmpty).join(" ");
}

function isReadableCf(cf?: string): boolean {
  return isNonEmpty(cf);
}

function chipValido(p: RecentPatientSearchEntry): boolean {
  if (isNonEmpty(p.name) || isNonEmpty(p.surname)) return true;
  return isReadableCf(p.cf);
}

function hasCardDetails(patient: PatientData): boolean {
  const hasBirthday = isNonEmpty(patient.birthday);
  const hasBirthplace = isNonEmpty(patient.birthplace);
  const hasGender = patient.gender === "M" || patient.gender === "F";
  const count = [hasBirthday, hasBirthplace, hasGender].filter(Boolean).length;
  if (count === 0) return false;
  if (count === 1 && hasGender) return false;
  return true;
}

function IncompletePatientCf({
  cf,
  cfGenerated,
}: {
  cf: string;
  cfGenerated?: boolean;
}) {
  return (
    <span
      className="truncate"
      style={{
        color: "var(--color-text-secondary)",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        cursor: "default",
      }}
    >
      {cf.trim().toUpperCase()}
      {cfGenerated && (
        <span
          className="text-danger font-bold ml-1"
          title="Codice fiscale generato automaticamente da import"
        >
          *
        </span>
      )}
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [patients, setPatients] = useState<PatientData[]>([]);
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

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const patients = await PatientService.getAllPatients();
      const sorted = [...patients].sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime(),
      );
      const convertedPatients: PatientData[] = sorted.map((patient) => ({
        id: patient.id,
        name: patient.nome,
        surname: patient.cognome,
        birthday: patient.dataNascita,
        gender: patient.sesso,
        email: patient.email,
        phone: patient.telefono,
        cf: patient.codiceFiscale,
        cfGenerated: Boolean(patient.codiceFiscaleGenerato),
        birthplace: patient.luogoNascita,
      }));
      setPatients(convertedPatients);
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
    const fetchDoctorData = async () => {
      try {
        await DoctorService.initializeDefaultDoctor();
      } catch (error) {
        console.error("Error fetching doctor data:", error);
      }
    };

    fetchDoctorData();
    loadPatients();
  }, [loadPatients]);

  // Ricerca: capisce da solo se stai cercando per nome/cognome o per codice fiscale
  const deferredSearch = useDeferredValue(searchTerm);
  const filteredPatients = useMemo(() => {
    const raw = deferredSearch.trim();
    if (!raw) return patients;
    const search = raw.toLowerCase();
    const cfOnly = raw.replace(/\s/g, "").toUpperCase();
    // Considera CF solo se plausibile:
    // - 6-16 caratteri alfanumerici
    // - e contiene almeno un numero, oppure è lungo 16 caratteri
    // In questo modo una ricerca testuale tipo "elisabetta" resta una ricerca per nome/cognome.
    const looksLikeCf =
      /^[A-Za-z0-9]{6,16}$/.test(cfOnly) &&
      (/\d/.test(cfOnly) || cfOnly.length === 16);
    if (looksLikeCf) {
      return patients.filter((p) => {
        const cf = (p.cf || "").toUpperCase();
        return cf.includes(cfOnly) || cf.startsWith(cfOnly);
      });
    }
    // Altrimenti ricerca per nome e/o cognome: ogni parola deve matchare nome o cognome
    const tokens = search.split(/\s+/).filter(Boolean);
    return patients.filter((patient) => {
      const nome = (patient.name || "").toLowerCase();
      const cognome = (patient.surname || "").toLowerCase();
      return tokens.every(
        (token) => nome.includes(token) || cognome.includes(token),
      );
    });
  }, [patients, deferredSearch]);

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
  }, [deferredSearch]);

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
          name: live.name,
          surname: live.surname,
          cf: live.cf,
          cfGenerated: live.cfGenerated,
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

  const getPatientInitials = (patient: PatientData) => {
    return `${patient.name?.[0] || ""}${patient.surname?.[0] || ""}`.toUpperCase();
  };

  const getGenderColor = (gender?: string) => {
    return gender === "M"
      ? "primary"
      : gender === "F"
        ? "primary"
        : "default";
  };

  const saveRecentPatientSearch = useCallback((patient: PatientData) => {
    const entry: RecentPatientSearchEntry = {
      id: patient.id,
      name: patient.name,
      surname: patient.surname,
      cf: patient.cf,
      cfGenerated: patient.cfGenerated,
    };
    setRecentPatientSearches((prev) => {
      const next = [entry, ...prev.filter((p) => p.id !== patient.id)].slice(
        0,
        MAX_RECENT_PATIENT_SEARCHES,
      );
      PreferenceService.setRecentPatientSearches(JSON.stringify(next)).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const handleOpenPatientHistory = useCallback(
    (patient: PatientData) => {
      saveRecentPatientSearch(patient);
      navigate(`/patient-history/${patient.id}`);
    },
    [navigate, saveRecentPatientSearch],
  );

  const HeaderActions = (
    <div className="flex gap-3 w-full md:w-auto">
      <Button
        color="primary"
        startContent={<UserPlus size={18} />}
        onPress={() => navigate("/add-patient")}
        className="font-medium shadow-md shadow-primary/20 flex-1 md:flex-none"
      >
        Nuovo Paziente
      </Button>
    </div>
  );

  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Pazienti"
        subtitle={
          loading
            ? undefined
            : `${patients.length} ${patients.length === 1 ? "paziente" : "pazienti"} in archivio`
        }
        icon={Users}
        actions={HeaderActions}
      >
        {/* Search Bar embedded in header area */}
        <Card className="shadow-sm mt-4">
          <CardBody className="p-4">
            <Input
              placeholder="Cerca per nome, cognome o codice fiscale (ricerca automatica)"
              size="lg"
              startContent={
                <SearchIcon size={20} className="text-default-500" />
              }
              value={searchTerm}
              onValueChange={setSearchTerm}
              variant="bordered"
              classNames={{
                input: "text-base",
                inputWrapper: "h-12 border-default-200",
              }}
              isClearable
              onClear={() => setSearchTerm("")}
            />
            {recentValidChips.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">
                    Ultimi pazienti cercati
                  </p>
                  <Button
                    size="sm"
                    variant="light"
                    className="h-6 min-w-0 px-2 text-xs"
                    onPress={() => {
                      setRecentPatientSearches([]);
                      PreferenceService.setRecentPatientSearches("[]").catch(
                        () => {},
                      );
                    }}
                  >
                    Pulisci
                  </Button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentValidChips.map((p) => {
                    const chipName = getDisplayName(p);
                    const showChipName = hasDisplayName(p);
                    const showChipCf = isReadableCf(p.cf);
                    return (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="flat"
                      className="justify-start shrink-0"
                      onPress={() => handleOpenPatientHistory(p as PatientData)}
                    >
                      {showChipName && (
                        <span className="mr-2">{chipName}</span>
                      )}
                      {showChipCf && (
                        <CodiceFiscaleValue
                          value={p.cf}
                          generatedFromImport={Boolean(p.cfGenerated)}
                        />
                      )}
                    </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </PageHeader>

      {/* Loading State */}
      {loading && <PatientGridSkeleton />}

      {/* Error Message */}
      {errorMessage && (
        <Card className="border-l-4 border-l-danger">
          <CardBody>
            <p className="text-danger">{errorMessage}</p>
          </CardBody>
        </Card>
      )}

      {/* Patients Grid (paginated) */}
      {!loading && (
        <>
          <div className="mb-4">
            <p
              className="text-[13px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {totalFiltered === 0
                ? "Nessun paziente"
                : `${totalFiltered} ${totalFiltered === 1 ? "paziente" : "pazienti"} — pagina ${currentPage} di ${totalPages}`}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {paginatedPatients.map((patient) => {
              const complete = hasCompleteAnagrafica(patient);
              const showName = hasDisplayName(patient);
              const showDetails = hasCardDetails(patient);
              const showCf = isNonEmpty(patient.cf);
              return (
              <Card
                key={patient.id}
                isPressable
                onPress={() => handleOpenPatientHistory(patient)}
                className="hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer border-l-[3px]"
                style={{
                  borderLeftColor: complete ? "#1D9E75" : "#EF9F27",
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3 w-full">
                    {showName ? (
                      <Avatar
                        name={getPatientInitials(patient)}
                        className="flex-shrink-0"
                        color={getGenderColor(patient.gender)}
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-base font-medium"
                        style={{
                          backgroundColor: "#F1EFE8",
                          color: "#888780",
                        }}
                        aria-hidden
                      >
                        ?
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {showName ? (
                        <>
                          <h4 className="font-semibold text-lg truncate">
                            {getDisplayName(patient)}
                          </h4>
                          {showCf && (
                            <p className="text-sm text-gray-500 truncate">
                              <CodiceFiscaleValue
                                value={patient.cf}
                                generatedFromImport={Boolean(
                                  patient.cfGenerated,
                                )}
                              />
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {showCf && (
                            <p className="truncate" style={{ cursor: "default" }}>
                              <IncompletePatientCf
                                cf={patient.cf!}
                                cfGenerated={patient.cfGenerated}
                              />
                            </p>
                          )}
                          <span
                            className="mt-1 inline-block rounded-[20px] px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: "#FAEEDA",
                              color: "#854F0B",
                              border: "0.5px solid #EF9F27",
                            }}
                          >
                            Anagrafica incompleta
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {showDetails && (
                <CardBody className="pt-0">
                  <div className="space-y-2">
                    {isNonEmpty(patient.birthday) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Data di nascita:</span>
                        <span>
                          {new Date(patient.birthday).toLocaleDateString(
                            "it-IT",
                          )}
                          {calculateAge(patient.birthday) != null
                            ? ` (${calculateAge(patient.birthday)} anni)`
                            : ""}
                        </span>
                      </div>
                    )}
                    {isNonEmpty(patient.birthplace) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Luogo:</span>
                        <span className="max-w-[120px] truncate">
                          {patient.birthplace}
                        </span>
                      </div>
                    )}
                    {(patient.gender === "M" || patient.gender === "F") && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Genere:</span>
                        <Chip
                          size="sm"
                          color={getGenderColor(patient.gender)}
                          variant="flat"
                        >
                          {patient.gender === "M" ? "Maschio" : "Femmina"}
                        </Chip>
                      </div>
                    )}
                  </div>
                </CardBody>
                )}
              </Card>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
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
                onPress={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                endContent={<ChevronRight size={18} />}
              >
                Successiva
              </Button>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && filteredPatients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
            <Users size={48} className="text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchTerm
              ? "Nessun paziente trovato"
              : "Nessun paziente registrato"}
          </h3>
          <p className="text-gray-500 max-w-md mx-auto mb-8">
            {searchTerm
              ? "Prova a modificare i termini di ricerca o aggiungi un nuovo paziente."
              : "Inizia aggiungendo il tuo primo paziente per gestire le visite mediche."}
          </p>
          <Button
            color="primary"
            startContent={<UserPlus size={18} />}
            onPress={() => navigate("/add-patient")}
            className="font-medium shadow-md shadow-primary/20"
          >
            Nuovo Paziente
          </Button>
        </div>
      )}

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        // In basso a destra come gli altri messaggi (`ToastContext`).
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
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
