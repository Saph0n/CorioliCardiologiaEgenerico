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
  LayoutDashboard,
  TrendingUp,
  Cake,
  FlaskConical,
  Stethoscope,
  Clock,
  ArrowRight,
  ClipboardList,
  HeartPulse,
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
import { toLocalIsoDate } from "../../utils/dateUtils";
import { PreferenceService } from "../../services/OfflineServices";
import {
  formattaDurata,
  normalizeRegistro,
  statoGruppi,
  type StatoGruppo,
} from "../../utils/gruppiRicerca";
import {
  pazientiDaTenereDOcchio,
  type VoceRischio,
} from "../../utils/pazientiARischio";
import { RigaPazienteARischio } from "../../components/cardio/RigaPazienteARischio";
import { formatPatientDisplayName } from "../../utils/patientDisplay";

interface GroupedRecentVisit {
  patientId: string;
  patientName: string;
  dateKey: string;
  dateLabel: string;
  count: number;
  tipo?: Visit["tipo"];
  mixedTypes: boolean;
}

/** Una riga della colonna del rischio, col nome gia' risolto. */
interface VoceRischioConNome extends VoceRischio {
  patientName: string;
}

interface DashboardStats {
  totalPatients: number;
  totalVisits: number;
  recentPatients: Patient[];
  pazientiARischio: VoceRischioConNome[];
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

const getVisitTypeLabel = (_tipo?: Visit["tipo"]) => "Visita";

const getVisitTypeColor = (_tipo?: Visit["tipo"]): "primary" => "primary";

const getVisitDateKey = (dataVisita: string): string => {
  const d = new Date(dataVisita);
  if (isNaN(d.getTime())) return dataVisita.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getVisitTypePluralPhrase = (
  tipo: Visit["tipo"] | undefined,
  count: number,
): string => {
  if (count <= 1) return getVisitTypeLabel(tipo);
  return `${count} visite`;
};

const groupRecentVisits = (
  visits: (Visit & { patientName: string })[],
  maxItems = 5,
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

const buildDashboardSubtitle = (
  visits: (Visit & { patientName: string })[],
): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const visitsToday = visits.filter((v) => {
    const d = new Date(v.dataVisita);
    if (isNaN(d.getTime())) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  if (visitsToday.length > 0) {
    const n = visitsToday.length;
    return n === 1
      ? "Hai registrato 1 visita oggi"
      : `Hai registrato ${n} visite oggi`;
  }

  const todayKey = toLocalIsoDate(today);
  let isFirstOpenToday = false;
  try {
    const lastOpen = localStorage.getItem("corioli_home_last_open");
    isFirstOpenToday = lastOpen !== todayKey;
    if (isFirstOpenToday) {
      localStorage.setItem("corioli_home_last_open", todayKey);
    }
  } catch {
    /* ignore */
  }

  if (isFirstOpenToday && visits.length > 0) {
    const last = visits[0];
    const visitDate = new Date(last.dataVisita);
    visitDate.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const when =
      visitDate.getTime() === yesterday.getTime()
        ? "ieri"
        : visitDate.toLocaleDateString("it-IT", {
            day: "numeric",
            month: "long",
          });
    return `Ultima visita: ${when} con ${last.patientName}`;
  }

  return "Ecco il riepilogo della tua attività";
};

export default function Home() {
  const navigate = useNavigate();
  const { openCheckPatientModal } = useCheckPatientModal();
  const [doctorName, setDoctorName] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    totalVisits: 0,
    recentPatients: [],
    pazientiARischio: [],
    groupedRecentVisits: [],
    averageAge: 0,
    visitsThisMonth: 0,
    patientsThisMonth: 0,
    subtitle: "Ecco il riepilogo della tua attività",
  });
  const [loading, setLoading] = useState(true);

  const [gruppiAbilitati, setGruppiAbilitati] = useState(false);
  const [statiGruppi, setStatiGruppi] = useState<StatoGruppo[]>([]);
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
    const load = async () => {
      setLoading(true);
      try {
        const patientsPromise = PatientService.getAllPatients();
        const [doctor, patients, visits] = await Promise.all([
          DoctorService.initializeDefaultDoctor(),
          patientsPromise,
          VisitService.getAllVisits(),
        ]);

        setDoctorName(doctor.cognome);

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
          };
        });
        const sortedVisits = enrichedVisits.sort(
          (a, b) =>
            new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime(),
        );
        const groupedRecentVisits = groupRecentVisits(sortedVisits, 5);
        const subtitle = buildDashboardSubtitle(sortedVisits);

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

        // Gruppi di ricerca: il pannello compare solo se la funzione e' attiva.
        try {
          const prefs = await PreferenceService.getPreferences();
          const attivi = Boolean(prefs?.gruppiRicercaEnabled);
          setGruppiAbilitati(attivi);
          setStatiGruppi(
            attivi
              ? statoGruppi(normalizeRegistro(prefs?.gruppiRicerca), patients)
              : [],
          );
        } catch {
          setGruppiAbilitati(false);
        }

        // Colonna del rischio: la coorte da tenere sotto gli occhi. Il nome si
        // risolve qui perche' la funzione lavora sulle visite e non deve
        // sapere come si scrive un paziente.
        const aRischio = pazientiDaTenereDOcchio(visits).map((voce) => {
          const p = patientMap.get(voce.patientId);
          return {
            ...voce,
            patientName: p
              ? formatPatientDisplayName(p) ?? "Paziente senza nome"
              : "Paziente sconosciuto",
          };
        });

        setStats({
          totalPatients: patients.length,
          totalVisits: visits.length,
          recentPatients: sortedPatients,
          pazientiARischio: aRischio,
          groupedRecentVisits,
          averageAge,
          visitsThisMonth,
          patientsThisMonth,
          subtitle,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <PageLoadingSkeleton variant="home" pathname="/" />;
  }

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
      <Button
        variant="bordered"
        startContent={<Calendar size={18} />}
        onPress={openCheckPatientModal}
        className="font-medium flex-1 md:flex-none border-default-300 text-default-700 bg-white"
      >
        Nuova Visita
      </Button>
    </div>
  );

  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={`${getGreetingMessage()}, ${doctorName ? `Dott. ${doctorName}` : "Dottore"}`}
        subtitle={stats.subtitle}
        icon={LayoutDashboard}
        iconColor="primary"
        actions={HeaderActions}
      />

      {/* ─── KPI Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          isPressable
          onPress={() => navigate("/pazienti")}
          className="corioli-kpi"
        >
          <CardBody className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Età Media
                </p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.averageAge > 0 ? (
                    <>
                      {stats.averageAge}
                      <span className="text-base font-normal text-gray-400 ml-1">
                        anni
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </h3>
                <p className="text-xs text-gray-400 mt-1">dei pazienti</p>
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Questo Mese
                </p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.visitsThisMonth}
                </h3>
                <p className="text-xs text-gray-400 mt-1">visite effettuate</p>
              </div>
              <div className="p-2.5 bg-default-100 rounded-xl text-default-600">
                <Clock size={22} />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ─── Lists Row ─────────────────────────────────────────── */}
      {/* Tre colonne fisse: pazienti, visite e il rischio. Con i gruppi di
          ricerca accesi la loro card scende sulla riga sotto, invece di
          stringere le altre in quattro. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pazienti Recenti */}
        <Card className="corioli-card">
          <CardHeader className="corioli-card-header flex justify-between items-center">
            <div className="dashboard-column-header-title">
              <Users className="text-brand-700 shrink-0" size={16} />
              <h3 className="text-base font-semibold text-gray-900">
                Pazienti Recenti
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
                  const avatarInitials = displayName
                    ? `${patient.nome?.[0] ?? ""}${patient.cognome?.[0] ?? ""}`.trim() ||
                      displayName.slice(0, 2).toUpperCase()
                    : "?";

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
                            <p className="text-sm text-gray-400 italic truncate">
                              Paziente senza nome
                            </p>
                          )}
                          <p className="text-xs text-gray-500 truncate">
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
              <div className="flex flex-col items-center justify-center p-8 text-gray-400 gap-2">
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

        {/* Visite Recenti */}
        <Card className="corioli-card">
          <CardHeader className="corioli-card-header flex justify-between items-center">
            <div className="dashboard-column-header-title">
              <FileText className="text-brand-700 shrink-0" size={16} />
              <h3 className="text-base font-semibold text-gray-900">
                Visite Recenti
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
                        {/* div, non p: contiene una Chip (che rende un div) ed è usato come contenitore flex */}
                        <div className="text-xs text-gray-500 truncate flex items-center gap-1 flex-wrap">
                          {group.mixedTypes ? (
                            <span>{group.count} visite</span>
                          ) : (
                            <Chip
                              size="sm"
                              variant="flat"
                              color={getVisitTypeColor(group.tipo)}
                              className="text-xs h-5"
                            >
                              {getVisitTypePluralPhrase(group.tipo, group.count)}
                            </Chip>
                          )}
                          <span className="text-gray-400">·</span>
                          <span>{group.dateLabel}</span>
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
              <div className="flex flex-col items-center justify-center p-8 text-gray-400 gap-2">
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


        {/* Pazienti a rischio.
            Chiesta il 22 settembre 2026: una colonna che tenga i pazienti piu'
            a rischio sotto gli occhi, come la tabella delle gravidanze in
            corso dell'edizione di ginecologia. La classe la dichiara il
            medico, qui si legge soltanto; il numero a destra e' la distanza
            dall'obiettivo di LDL, che e' quello su cui si puo' agire.

            La riga sta in `RigaPazienteARischio`, la stessa della pagina che
            si apre da "Vedi tutti": la colonna e' quell'elenco accorciato. */}
        <Card className="corioli-card">
          <CardHeader className="corioli-card-header flex justify-between items-center">
            <div className="dashboard-column-header-title">
              <HeartPulse className="text-brand-700 shrink-0" size={16} />
              <h3 className="text-base font-semibold text-gray-900">
                Pazienti a rischio
              </h3>
            </div>
            <Button
              size="sm"
              variant="light"
              color="primary"
              endContent={<ChevronRight size={16} />}
              onPress={() => navigate("/pazienti-a-rischio")}
            >
              Vedi tutti
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {stats.pazientiARischio.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {stats.pazientiARischio.map((voce) => (
                  <RigaPazienteARischio
                    key={voce.patientId}
                    voce={voce}
                    nome={voce.patientName}
                    onApri={() => navigate(`/patient-history/${voce.patientId}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center gap-2">
                <HeartPulse size={32} className="text-gray-200" />
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Nessun paziente da sorvegliare
                </p>
                <p
                  className="text-xs max-w-[240px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Compaiono qui i pazienti di classe alta o molto alta, e
                  chiunque sia sopra l&apos;obiettivo di LDL della sua classe.
                  La classe si dichiara nella visita.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Gruppi di ricerca */}
        {gruppiAbilitati && (
          <Card className="corioli-card">
            <CardHeader className="corioli-card-header flex justify-between items-center gap-2">
              <div className="dashboard-column-header-title min-w-0 flex items-center gap-2">
                <FlaskConical size={17} className="text-brand-700 shrink-0" />
                <h3 className="text-base font-semibold text-gray-900 truncate">
                  Gruppi di ricerca
                </h3>
              </div>
              <Button
                size="sm"
                variant="light"
                color="primary"
                endContent={<ChevronRight size={16} />}
                onPress={() => navigate("/gruppi-ricerca")}
              >
                Vedi tutti
              </Button>
            </CardHeader>
            <CardBody className="p-0">
              {statiGruppi.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {statiGruppi.slice(0, 6).map((g) => (
                    <div
                      key={g.nome}
                      className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer group"
                      onClick={() =>
                        navigate(`/gruppi-ricerca?gruppo=${encodeURIComponent(g.nome)}`)
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors truncate text-sm">
                          {g.nome}
                        </p>
                        <div className="text-xs text-gray-500 truncate flex items-center gap-1 flex-wrap mt-0.5">
                          <span>
                            {g.partecipanti === 1
                              ? "1 paziente"
                              : `${g.partecipanti} pazienti`}
                          </span>
                          {g.giorniAttivo != null && (
                            <>
                              <span className="text-gray-400">·</span>
                              <span>attivo da {formattaDurata(g.giorniAttivo)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ArrowRight
                        size={14}
                        className="text-gray-300 group-hover:text-brand-600 transition-colors flex-shrink-0"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-10 text-center gap-2">
                  <FlaskConical size={32} className="text-gray-200" />
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Nessun gruppo di ricerca
                  </p>
                  <p
                    className="text-xs max-w-[240px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Creane uno da Impostazioni o direttamente dalla scheda di un
                    paziente
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>

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
