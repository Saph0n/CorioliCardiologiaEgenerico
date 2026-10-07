import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Avatar,
} from "@nextui-org/react";
import {
  UserPlus,
  Users,
  FileText,
  ChevronRight,
  Calendar,
  Stethoscope,
  ArrowRight,
  Activity,
  TrendingUp,
  ClipboardList,
  Cake,
  Clock,
  LayoutDashboard,
} from "lucide-react";
import {
  DoctorService,
  PatientService,
  VisitService,
} from "../../services/OfflineServices";
import { Patient, Visit } from "../../types/Storage";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { brandSuccessAlertSx } from "../../utils/muiBrand";
import { PageHeader } from "../../components/PageHeader";
import { PageLoadingSkeleton } from "../../components/AppStartupSkeleton";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import { useCheckPatientModal } from "../../contexts/CheckPatientModalContext";
import {
  pazientiDaSeguire,
  type VoceDaSeguire,
} from "../../utils/pazientiDaSeguire";
import { RigaPazienteDaSeguire } from "../../components/generale/RigaPazienteDaSeguire";
import { formatPatientDisplayName, patientInitials } from "../../utils/patientDisplay";
import { titoloMedico } from "../../utils/doctorProfile";
import { TagPressione } from "../../components/generale/EtichetteParametriVisita";
import { eAdulto, parsePressione, type Pressione } from "../../utils/parametriVitali";
import { calculateAge as etaAllaData } from "../../utils/dateUtils";

interface GroupedRecentVisit {
  patientId: string;
  patientName: string;
  dateKey: string;
  dateLabel: string;
  count: number;
  tipo?: Visit["tipo"];
  mixedTypes: boolean;
  /** Pressione dell'ultima visita del giorno, se misurata. */
  pressione?: Pressione;
  /** Adulto alla data della visita: decide il colore della pressione. */
  adulto: boolean;
}

/** Una riga della colonna "Da seguire", con nome e iniziali gia' risolti. */
interface VoceDaSeguireConNome extends VoceDaSeguire {
  patientName: string;
  iniziali: string;
}

interface DashboardStats {
  totalPatients: number;
  totalVisits: number;
  recentPatients: Patient[];
  pazientiDaSeguire: VoceDaSeguireConNome[];
  groupedRecentVisits: GroupedRecentVisit[];
  averageAge: number;
  visitsThisMonth: number;
  patientsThisMonth: number;
  subtitle: string;
}

const getGreetingMessage = () => {
  const currentHour = new Date().getHours();
  if (currentHour >= 6 && currentHour < 12) return "Buongiorno";
  if (currentHour >= 12 && currentHour < 18) return "Buon pomeriggio";
  return "Buonasera";
};

const calculateAge = (birthDateString: string): number => {
  if (!birthDateString) return 0;
  let birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) {
    const parts = birthDateString.split(/[-/]/);
    if (parts.length === 3 && parseInt(parts[2]) > 1900) {
      birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
  }
  if (isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return Math.max(0, age);
};

const getVisitDateKey = (dataVisita: string): string => {
  const d = new Date(dataVisita);
  if (isNaN(d.getTime())) return dataVisita.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const groupRecentVisits = (
  visits: (Visit & { patientName: string; eta: number | null })[],
  maxItems = 6,
): GroupedRecentVisit[] => {
  const groups = new Map<string, GroupedRecentVisit>();

  for (const visit of visits) {
    const dateKey = getVisitDateKey(visit.dataVisita);
    const key = `${visit.patientId}_${dateKey}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        patientId: visit.patientId,
        patientName: visit.patientName,
        dateKey,
        dateLabel: new Date(visit.dataVisita).toLocaleDateString("it-IT"),
        count: 1,
        tipo: visit.tipo,
        mixedTypes: false,
        pressione: parsePressione(visit.visita?.pressioneArteriosa) ?? undefined,
        adulto: eAdulto(visit.eta),
      });
      continue;
    }

    existing.count += 1;
    if (existing.tipo !== visit.tipo) {
      existing.mixedTypes = true;
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    .slice(0, maxItems);
};

/**
 * Sotto al saluto: l'ultima visita registrata, come su Corioli Cardiologia e
 * Ginecologia ("Ultima visita: 11 settembre con Maria Vecchi"). Sempre la
 * stessa forma; senza visite resta la data di oggi.
 */
const buildDashboardSubtitle = (
  visits: (Visit & { patientNameInFrase: string })[],
): string => {
  const last = visits[0];
  if (!last) return oggiPerEsteso();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const visitDate = new Date(last.dataVisita);
  if (isNaN(visitDate.getTime())) return oggiPerEsteso();
  visitDate.setHours(0, 0, 0, 0);

  const when =
    visitDate.getTime() === today.getTime()
      ? "oggi"
      : visitDate.getTime() === yesterday.getTime()
        ? "ieri"
        : visitDate.toLocaleDateString("it-IT", {
            day: "numeric",
            month: "long",
            // L'anno solo se non e' quello in corso: "11 settembre" basta.
            ...(visitDate.getFullYear() !== today.getFullYear()
              ? { year: "numeric" as const }
              : {}),
          });
  return `Ultima visita: ${when} con ${last.patientNameInFrase}`;
};

/** "mercoledì 23 settembre": sotto al saluto, al posto di una frase di rito. */
function oggiPerEsteso(): string {
  const oggi = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return oggi.charAt(0).toUpperCase() + oggi.slice(1);
}

export default function Home() {
  const navigate = useNavigate();
  const { openCheckPatientModal } = useCheckPatientModal();
  const [doctorName, setDoctorName] = useState<string | null>(null);
  const [titolo, setTitolo] = useState<string>("Dott.");
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    totalVisits: 0,
    recentPatients: [],
    pazientiDaSeguire: [],
    groupedRecentVisits: [],
    averageAge: 0,
    visitsThisMonth: 0,
    patientsThisMonth: 0,
    subtitle: "",
  });
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  useEffect(() => {
    const msg = sessionStorage.getItem("appdottori_toast");
    if (msg) {
      setToast({ open: true, message: msg });
      sessionStorage.removeItem("appdottori_toast");
    }
  }, []);

  useEffect(() => {
    // Un caricamento superato (pagina lasciata prima della fine) non scrive.
    let superato = false;
    const load = async () => {
      setLoading(true);
      try {
        const patientsPromise = PatientService.getAllPatients();
        const [doctor, patients, visits] = await Promise.all([
          DoctorService.initializeDefaultDoctor(),
          patientsPromise,
          VisitService.getAllVisits(),
        ]);
        if (superato) return;

        setDoctorName(doctor.cognome);
        setTitolo(titoloMedico(doctor));

        const now = new Date();
        const thisMonthStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        ).toISOString();

        const visitsThisMonth = visits.filter(
          (v) => v.dataVisita >= thisMonthStart,
        ).length;
        const patientsThisMonth = patients.filter(
          (p) => p.createdAt >= thisMonthStart,
        ).length;

        let validAgesCount = 0;
        const totalAge = patients.reduce((sum, p) => {
          const age = calculateAge(p.dataNascita);
          if (age > 0) {
            validAgesCount++;
            return sum + age;
          }
          return sum;
        }, 0);
        const averageAge =
          validAgesCount > 0 ? Math.round(totalAge / validAgesCount) : 0;

        const visitDatesByPatient = new Map<string, number>();
        for (const v of visits) {
          const t = new Date(v.dataVisita).getTime();
          const prev = visitDatesByPatient.get(v.patientId);
          if (prev == null || t > prev) visitDatesByPatient.set(v.patientId, t);
        }
        const sortedPatients = [...patients]
          .sort((a, b) => {
            const lastA = Math.max(
              new Date(a.createdAt).getTime(),
              new Date(a.updatedAt).getTime(),
              visitDatesByPatient.get(a.id) ?? 0,
            );
            const lastB = Math.max(
              new Date(b.createdAt).getTime(),
              new Date(b.updatedAt).getTime(),
              visitDatesByPatient.get(b.id) ?? 0,
            );
            return lastB - lastA;
          })
          .slice(0, 6);

        const patientMap = new Map(patients.map((p) => [p.id, p]));
        const enrichedVisits = visits.map((v) => {
          const p = patientMap.get(v.patientId);
          return {
            ...v,
            patientName: p
              ? formatPatientDisplayName(p) ?? "Paziente senza nome"
              : "Paziente sconosciuto",
            patientCf: p?.codiceFiscale || "",
            eta: p ? etaAllaData(p.dataNascita, v.dataVisita) : null,
            // Per la frase sotto al saluto: "con Maria Vecchi", non "con
            // VECCHI Maria". Il maiuscolo del cognome serve negli elenchi.
            patientNameInFrase: p
              ? [p.nome, p.cognome].filter(Boolean).join(" ") || "paziente senza nome"
              : "paziente sconosciuto",
          };
        });
        const sortedVisits = enrichedVisits.sort(
          (a, b) =>
            new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime(),
        );
        // Sei, come i pazienti recenti nella colonna accanto: le righe delle
        // due colonne stanno allineate.
        const groupedRecentVisits = groupRecentVisits(sortedVisits, 6);
        const subtitle = buildDashboardSubtitle(sortedVisits);

        // Colonna "Pazienti da seguire": il nome si risolve qui perche' la
        // funzione lavora sui dati clinici e non deve sapere come si scrive
        // un paziente.
        const daSeguire = pazientiDaSeguire(patients, visits).map((voce) => {
          const p = patientMap.get(voce.patientId);
          return {
            ...voce,
            patientName: p
              ? formatPatientDisplayName(p) ?? "Paziente senza nome"
              : "Paziente sconosciuto",
            iniziali: p ? patientInitials(p) : "?",
          };
        });

        setStats({
          totalPatients: patients.length,
          totalVisits: visits.length,
          recentPatients: sortedPatients,
          pazientiDaSeguire: daSeguire,
          groupedRecentVisits,
          averageAge,
          visitsThisMonth,
          patientsThisMonth,
          subtitle,
        });
      } catch (e) {
        console.error(e);
      } finally {
        if (!superato) setLoading(false);
      }
    };
    load();
    return () => {
      superato = true;
    };
  }, []);

  if (loading) {
    return <PageLoadingSkeleton variant="home" pathname="/" />;
  }

  // "Nuova visita" e' l'azione di tutti i giorni, "Nuovo paziente" solo
  // per chi viene la prima volta: prima il pulsante pieno era il secondo.
  const HeaderActions = (
    <div className="flex gap-3 w-full md:w-auto">
      <Button
        variant="bordered"
        startContent={<UserPlus size={18} />}
        onPress={() => navigate("/add-patient")}
        className="font-medium flex-1 md:flex-none border-default-300 text-default-700 bg-white"
      >
        Nuovo paziente
      </Button>
      <Button
        color="primary"
        startContent={<Calendar size={18} />}
        onPress={openCheckPatientModal}
        className="corioli-cta font-medium flex-1 md:flex-none"
      >
        Nuova visita
      </Button>
    </div>
  );

  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={`${getGreetingMessage()}, ${doctorName ? `${titolo} ${doctorName}` : "Dottore"}`}
        subtitle={stats.subtitle}
        icon={LayoutDashboard}
        actions={HeaderActions}
      />

      {/* ─── KPI Cards ────────────────────────────────────────── */}
      {/* Sostituite per un giorno da una barra di ricerca e rimesse: sono
          piaciute di piu'. La ricerca sta nella navbar (Ctrl K). */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          isPressable
          onPress={() => navigate("/pazienti")}
          className="corioli-kpi"
        >
          <CardBody className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Pazienti
                </p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.totalPatients}
                </h3>
                {stats.patientsThisMonth > 0 && (
                  <p className="text-xs corioli-text-brand mt-1 flex items-center gap-1">
                    <TrendingUp size={12} /> +{stats.patientsThisMonth} questo
                    mese
                  </p>
                )}
              </div>
              <div className="p-2.5 bg-default-100 rounded-xl text-default-600">
                <Users size={22} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          onPress={() => navigate("/visite")}
          className="corioli-kpi"
        >
          <CardBody className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Visite
                </p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.totalVisits}
                </h3>
                {stats.visitsThisMonth > 0 && (
                  <p className="text-xs corioli-text-brand mt-1 flex items-center gap-1">
                    <TrendingUp size={12} /> +{stats.visitsThisMonth} questo
                    mese
                  </p>
                )}
              </div>
              <div className="p-2.5 bg-default-100 rounded-xl text-default-600">
                <ClipboardList size={22} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="corioli-kpi">
          <CardBody className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Età media
                </p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.averageAge > 0 ? (
                    <>
                      {stats.averageAge}
                      <span className="text-base font-normal text-gray-500 ml-1">
                        anni
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </h3>
                <p className="text-xs text-gray-500 mt-1">dei pazienti</p>
              </div>
              <div className="p-2.5 bg-default-100 rounded-xl text-default-600">
                <Cake size={22} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          onPress={() => navigate("/visite")}
          className="corioli-kpi"
        >
          <CardBody className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Questo mese
                </p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.visitsThisMonth}
                </h3>
                <p className="text-xs text-gray-500 mt-1">visite effettuate</p>
              </div>
              <div className="p-2.5 bg-default-100 rounded-xl text-default-600">
                <Clock size={22} />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ─── Lists Row ─────────────────────────────────────────── */}
      {/* Tre colonne fisse, come su Corioli Cardiologia: pazienti, visite e
          i pazienti da seguire. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pazienti recenti */}
        <Card className="corioli-card">
          <CardHeader className="corioli-card-header flex justify-between items-center">
            <div className="dashboard-column-header-title">
              <Users className="text-brand-700 shrink-0" size={16} />
              <h3 className="text-base font-semibold text-gray-900">
                Pazienti recenti
              </h3>
            </div>
            <Button
              size="sm"
              variant="light"
              color="primary"
              endContent={<ChevronRight size={16} />}
              onPress={() => navigate("/pazienti")}
            >
              Vedi tutti
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {stats.recentPatients.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {stats.recentPatients.map((patient) => {
                  const displayName = formatPatientDisplayName(patient);
                  const avatarInitials = patientInitials(patient);

                  return (
                    <div
                      key={patient.id}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/patient-history/${patient.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={avatarInitials}
                          size="sm"
                          color="default"
                          className="transition-transform group-hover:scale-110 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          {displayName ? (
                            <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors truncate text-sm">
                              {displayName}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500 italic truncate">
                              Paziente senza nome
                            </p>
                          )}
                          {/* Altezza fissa, la stessa della seconda riga delle
                              altre due colonne: il codice fiscale e' a
                              spaziatura fissa e allungava la riga di un pixel,
                              e le righe non stavano piu' allineate. */}
                          <p className="text-xs leading-5 h-5 text-gray-500 truncate">
                            <CodiceFiscaleValue
                              value={patient.codiceFiscale}
                              generatedFromImport={Boolean(
                                patient.codiceFiscaleGenerato,
                              )}
                            />
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <Chip
                          size="sm"
                          variant="flat"
                          color="default"
                          className="text-xs"
                        >
                          {calculateAge(patient.dataNascita) > 0
                            ? `${calculateAge(patient.dataNascita)}a`
                            : "—"}
                        </Chip>
                        <ArrowRight
                          size={14}
                          className="text-gray-300 group-hover:text-brand-600 transition-colors"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-gray-500 gap-2">
                <Users size={32} className="text-gray-200" />
                <p className="text-sm">Nessun paziente registrato.</p>
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={() => navigate("/add-patient")}
                  startContent={<UserPlus size={14} />}
                >
                  Aggiungi
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Visite recenti */}
        <Card className="corioli-card">
          <CardHeader className="corioli-card-header flex justify-between items-center">
            <div className="dashboard-column-header-title">
              <FileText className="text-brand-700 shrink-0" size={16} />
              <h3 className="text-base font-semibold text-gray-900">
                Visite recenti
              </h3>
            </div>
            <Button
              size="sm"
              variant="light"
              color="primary"
              endContent={<ChevronRight size={16} />}
              onPress={() => navigate("/visite")}
            >
              Vedi tutte
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {stats.groupedRecentVisits.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {stats.groupedRecentVisits.map((group) => (
                  <div
                    key={`${group.patientId}_${group.dateKey}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() =>
                      group.patientId &&
                      navigate(`/patient-history/${group.patientId}`)
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-1.5 rounded-lg flex-shrink-0 bg-default-100 text-default-700">
                        <Stethoscope size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors truncate text-sm">
                          {group.patientName}
                        </p>
                        {/* Riga alta 20px come la seconda riga delle altre
                            due colonne: le righe restano allineate. */}
                        <div className="flex h-5 min-w-0 items-center gap-1.5">
                          {group.pressione && (
                            <TagPressione pa={group.pressione} adulto={group.adulto} compatta />
                          )}
                          <span className="min-w-0 truncate text-xs text-default-600">
                            {group.dateLabel}
                            {group.count > 1 && <> · {group.count} visite</>}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-gray-300 group-hover:text-brand-600 transition-colors flex-shrink-0 ml-2"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-gray-500 gap-2">
                <FileText size={32} className="text-gray-200" />
                <p className="text-sm">Nessuna visita registrata.</p>
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={openCheckPatientModal}
                  startContent={<Calendar size={14} />}
                >
                  Inizia
                </Button>
              </div>
            )}
          </CardBody>
        </Card>


        {/* Pazienti da seguire: la versione generale della colonna "Pazienti
            a rischio" di Corioli Cardiologia. Entra chi all'ultima misura ha
            la pressione da ipertensione, un BMI da obesita' o un'ipotensione
            ortostatica (`utils/pazientiDaSeguire`). "Vedi tutti" apre lo
            stesso elenco intero, in tabella. */}
        <Card className="corioli-card">
          <CardHeader className="corioli-card-header flex justify-between items-center">
            <div className="dashboard-column-header-title">
              <Activity className="text-brand-700 shrink-0" size={16} />
              <h3 className="text-base font-semibold text-gray-900">
                Pazienti da seguire
              </h3>
            </div>
            <Button
              size="sm"
              variant="light"
              color="primary"
              endContent={<ChevronRight size={16} />}
              onPress={() => navigate("/pazienti-da-seguire")}
            >
              Vedi tutti
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {stats.pazientiDaSeguire.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {stats.pazientiDaSeguire.map((voce) => (
                  <RigaPazienteDaSeguire
                    key={voce.patientId}
                    voce={voce}
                    nome={voce.patientName}
                    iniziali={voce.iniziali}
                    onApri={() => navigate(`/patient-history/${voce.patientId}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center gap-2">
                <Activity size={32} className="text-gray-200" />
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Nessun paziente da seguire
                </p>
                <p
                  className="text-xs max-w-[260px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Compaiono qui i pazienti che all&apos;ultima visita avevano la
                  pressione da 140/90 in su, un BMI da 30 in su o
                  un&apos;ipotensione ortostatica.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

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
