import {
  Input,
  Button,
  DatePicker,
  Select,
  SelectItem,
  Card,
  CardBody,
  Divider,
  Spinner,
  Chip,
  Textarea,
} from "@nextui-org/react";
import {
  ChangeEvent,
  KeyboardEvent,
  useState,
  useEffect,
  useRef,
} from "react";
import { I18nProvider } from "@react-aria/i18n";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PatientService } from "../../services/OfflineServices";
import { PageHeader } from "../../components/PageHeader";
import { ExternalLink, Check, ChevronDown, CalendarPlus } from "lucide-react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useToast } from "../../contexts/ToastContext";
import { Breadcrumb } from "../../components/Breadcrumb";
import {
  useRegisterUnsavedChanges,
  useUnsavedChanges,
} from "../../contexts/UnsavedChangesContext";
import { calculateAge } from "../../utils/dateUtils";
import { formatPatientDisplayName } from "../../utils/patientDisplay";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import {
  MAX_HEIGHT_CM,
  MIN_BIRTH_YEAR,
  MIN_HEIGHT_CM,
  parseOptionalHeight,
  todayIsoDate,
  validateBirthDate,
} from "../../utils/formValidation";
import {
  decodeCfToPatientFields,
  isValidCodiceFiscaleFormat,
} from "../../utils/codiceFiscale";
import type { Patient } from "../../types/Storage";

const CF_DUPLICATE_DEBOUNCE_MS = 450;

type CfAutofillField = "birthday" | "birthplace" | "gender";

const EMPTY_CF_AUTOFILL: Record<CfAutofillField, boolean> = {
  birthday: false,
  birthplace: false,
  gender: false,
};

const baseLabelClassNames = { label: "text-gray-700 font-medium" };

function cfAutofillWrapperClass(autofilled: boolean) {
  return autofilled ? "cf-field-autofill w-full" : "w-full";
}

/**
 * Titolo di gruppo del form. Erano passi numerati 1-4 con un tondo colorato:
 * per un form che si compila in un minuto, e dove quasi tutto e' facoltativo,
 * la numerazione suggeriva una procedura che non c'e'.
 */
function StepHeader({ title }: { title: string }) {
  return <h3 className="mb-3 text-sm font-semibold text-default-700">{title}</h3>;
}

/** Invio (senza Maiusc): passa al campo successivo senza inviare il form. */
function focusFirstFocusable(container: HTMLElement | null) {
  if (!container) return;
  const sel =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  container.querySelector<HTMLElement>(sel)?.focus();
}

function handleEnterAdvance(
  e: KeyboardEvent,
  focusNext: () => void,
) {
  if (e.key !== "Enter" || e.shiftKey) return;
  const ne = e.nativeEvent;
  if ("isComposing" in ne && ne.isComposing) return;
  e.preventDefault();
  focusNext();
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthday: string;
  birthplace: string;
  cf: string;
  gender: string;
  address: string;
  bloodType: string;
  allergies: string;
  height: string;
}

export default function AddPatient() {
  const [registerData, setRegisterData] = useState<RegisterData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthday: "",
    birthplace: "",
    cf: "",
    // Edizione generale: nessun genere preselezionato (in Corioli era "F").
    gender: "",
    address: "",
    bloodType: "",
    allergies: "",
    height: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Salvataggio tentato senza cognome e senza codice fiscale. */
  const [identitaMancante, setIdentitaMancante] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { guardAction } = useUnsavedChanges();
  useRegisterUnsavedChanges("add-patient", hasUnsavedChanges);
  const initialLoadDone = useRef(false);
  const lastDecodedCfRef = useRef<string | null>(null);
  const [cfDecoding, setCfDecoding] = useState(false);
  const [cfDuplicatePatient, setCfDuplicatePatient] = useState<Patient | null>(
    null,
  );
  const [cfDuplicateChecking, setCfDuplicateChecking] = useState(false);
  const [cfAutofilledFields, setCfAutofilledFields] =
    useState<Record<CfAutofillField, boolean>>(EMPTY_CF_AUTOFILL);
  const [clinicalDataOpen, setClinicalDataOpen] = useState(false);
  /** Nome come stava in archivio, per le briciole: non cambia mentre si scrive. */
  const [nomeInArchivio, setNomeInArchivio] = useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = useState(false);
  // L'errore della data di nascita si mostra solo fuori dal campo: mentre si
  // corregge l'anno (2005 -> 200 -> 2006) il valore di mezzo e' fuori
  // intervallo, ed e' normale.
  const [erroreDataNascitaVisibile, setErroreDataNascitaVisibile] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const registerDataCfRef = useRef(registerData.cf);
  registerDataCfRef.current = registerData.cf;
  const refCf = useRef<HTMLInputElement | null>(null);
  const refFirstName = useRef<HTMLInputElement | null>(null);
  const refLastName = useRef<HTMLInputElement | null>(null);
  const refBirthDateWrap = useRef<HTMLDivElement | null>(null);
  const refBirthplace = useRef<HTMLInputElement | null>(null);
  const refGenderSelectWrap = useRef<HTMLDivElement | null>(null);
  const refEmail = useRef<HTMLInputElement | null>(null);
  const refPhone = useRef<HTMLInputElement | null>(null);
  const refAddress = useRef<HTMLInputElement | null>(null);
  const refBloodSelectWrap = useRef<HTMLDivElement | null>(null);
  const refHeight = useRef<HTMLInputElement | null>(null);
  const refAllergies = useRef<HTMLTextAreaElement | null>(null);
  const refSubmit = useRef<HTMLButtonElement | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  /**
   * Progetto di ricerca da cui si e' arrivati, quando si e' arrivati da li'.
   * Solo in creazione: in modifica i gruppi si cambiano dai chip della scheda,
   * e sovrascriverli da un parametro nell'indirizzo cancellerebbe gli altri.
   */
  const gruppoDaArruolare =
    searchParams.get("mode") === "edit"
      ? null
      : (searchParams.get("gruppo")?.trim() || null);

  useEffect(() => {
    const cf = searchParams.get("cf");
    const id = searchParams.get("id");
    const mode = searchParams.get("mode");

    if (mode === "edit" && id) {
      setIsEditMode(true);
      loadPatientDataById(id);
    } else if (mode === "edit" && cf) {
      setIsEditMode(true);
      loadPatientDataByCf(cf);
    } else {
      // Dal pannello di ricerca arriva quello che il medico ha gia' scritto:
      // il codice fiscale, oppure cognome e nome. Non si riscrive due volte.
      const cognome = searchParams.get("cognome")?.trim();
      const nome = searchParams.get("nome")?.trim();
      if (cf || cognome || nome) {
        setRegisterData((prevData) => ({
          ...prevData,
          ...(cf ? { cf } : {}),
          ...(cognome ? { lastName: cognome } : {}),
          ...(nome ? { firstName: nome } : {}),
        }));
      }
    }
  }, [searchParams]);

  const loadPatientDataById = async (id: string) => {
    setIsLoading(true);
    try {
      const patient = await PatientService.getPatientById(id);
      if (patient) {
        setPatientId(patient.id);
        setNomeInArchivio(formatPatientDisplayName(patient));
        initialLoadDone.current = false;
        setRegisterData({
          firstName: patient.nome,
          lastName: patient.cognome,
          email: patient.email || "",
          phone: patient.telefono || "",
          birthday: patient.dataNascita,
          birthplace: patient.luogoNascita,
          cf: patient.codiceFiscale || "",
          gender: patient.sesso ?? "",
          address: patient.indirizzo || "",
          bloodType: patient.gruppoSanguigno || "",
          allergies: patient.allergie || "",
          height: patient.altezza != null ? String(patient.altezza) : "",
        });
      } else {
        setError("Paziente non trovato");
      }
    } catch (err) {
      console.error(err);
      setError("Errore nel caricamento dei dati del paziente");
    } finally {
      setIsLoading(false);
      setTimeout(() => { initialLoadDone.current = true; }, 200);
    }
  };

  const loadPatientDataByCf = async (cf: string) => {
    setIsLoading(true);
    try {
      const patient = await PatientService.getPatientByCF(cf);
      if (patient) {
        setPatientId(patient.id);
        setNomeInArchivio(formatPatientDisplayName(patient));
        initialLoadDone.current = false;
        setRegisterData({
          firstName: patient.nome,
          lastName: patient.cognome,
          email: patient.email || "",
          phone: patient.telefono || "",
          birthday: patient.dataNascita,
          birthplace: patient.luogoNascita,
          cf: patient.codiceFiscale || "",
          gender: patient.sesso ?? "",
          address: patient.indirizzo || "",
          bloodType: patient.gruppoSanguigno || "",
          allergies: patient.allergie || "",
          height: patient.altezza != null ? String(patient.altezza) : "",
        });
      } else {
        setError("Paziente non trovato");
      }
    } catch (err) {
      console.error(err);
      setError("Errore nel caricamento dei dati del paziente");
    } finally {
      setIsLoading(false);
      setTimeout(() => { initialLoadDone.current = true; }, 200);
    }
  };

  const clearCfAutofillFlag = (field: CfAutofillField) => {
    setCfAutofilledFields((prev) =>
      prev[field] ? { ...prev, [field]: false } : prev,
    );
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    const { name, value } = e.target;
    const next =
      name === "cf"
        ? value.toUpperCase().replace(/\s/g, "").slice(0, 16)
        : value;
    if (name === "cf") {
      setCfAutofilledFields(EMPTY_CF_AUTOFILL);
    } else if (name === "birthplace") {
      clearCfAutofillFlag(name);
    }
    setRegisterData((prevData) => ({ ...prevData, [name]: next }));
    if (error) setError(null);
  };

  const handleSelectChange = (name: string, value: string) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    if (name === "gender") clearCfAutofillFlag("gender");
    setRegisterData((prevData) => ({ ...prevData, [name]: value }));
    if (error) setError(null);
  };

  // Il valore si prende sempre, anche fuori intervallo. Scartarlo rimetteva
  // nel campo la data di prima: cancellando l'ultima cifra di 2005 l'anno
  // diventava 200, veniva rifiutato e il campo tornava a 2005, senza modo di
  // correggerlo. Il controllo lo fanno il campo stesso e il salvataggio.
  const handleDateChange = (date: CalendarDate | null) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    clearCfAutofillFlag("birthday");
    // CalendarDate.toString() e' gia' AAAA-MM-GG, anche per anni sotto il 1000.
    setRegisterData((prevData) => ({ ...prevData, birthday: date ? date.toString() : "" }));
    if (error) setError(null);
  };

  const validateEmail = (email: string) => {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  };

  useEffect(() => {
    if (isEditMode) return;

    const cf = registerData.cf.trim().toUpperCase();
    if (!isValidCodiceFiscaleFormat(cf)) {
      lastDecodedCfRef.current = null;
      setCfAutofilledFields(EMPTY_CF_AUTOFILL);
      return;
    }
    if (lastDecodedCfRef.current === cf) return;

    let cancelled = false;
    setCfDecoding(true);
    (async () => {
      try {
        const decoded = await decodeCfToPatientFields(cf);
        if (cancelled) return;
        lastDecodedCfRef.current = cf;
        if (initialLoadDone.current) setHasUnsavedChanges(true);
        setRegisterData((prev) => {
          const nextAutofill: Partial<Record<CfAutofillField, boolean>> = {};
          if (decoded.dataNascita) nextAutofill.birthday = true;
          if (
            decoded.luogoNascita &&
            decoded.luogoNascita !== "Non specificato"
          ) {
            nextAutofill.birthplace = true;
          }
          if (decoded.sesso) nextAutofill.gender = true;
          setCfAutofilledFields((flags) => ({ ...flags, ...nextAutofill }));
          return {
            ...prev,
            cf,
            birthday: decoded.dataNascita || prev.birthday,
            birthplace:
              decoded.luogoNascita &&
              decoded.luogoNascita !== "Non specificato"
                ? decoded.luogoNascita
                : prev.birthplace,
            gender: decoded.sesso || prev.gender,
          };
        });
      } catch {
        lastDecodedCfRef.current = null;
      } finally {
        if (!cancelled) setCfDecoding(false);
      }
    })();

    return () => {
      cancelled = true;
      setCfDecoding(false);
    };
  }, [registerData.cf, isEditMode]);

  useEffect(() => {
    const normalized = registerData.cf.trim().toUpperCase();
    if (!isValidCodiceFiscaleFormat(normalized)) {
      setCfDuplicatePatient(null);
      setCfDuplicateChecking(false);
      return;
    }

    let cancelled = false;
    const tid = setTimeout(async () => {
      setCfDuplicateChecking(true);
      const queried = normalized;
      try {
        const p = await PatientService.getPatientByCF(queried);
        if (cancelled) return;
        const latest = registerDataCfRef.current.trim().toUpperCase();
        if (latest !== queried || !isValidCodiceFiscaleFormat(latest)) {
          setCfDuplicatePatient(null);
          return;
        }
        if (isEditMode && patientId && p?.id === patientId) {
          setCfDuplicatePatient(null);
        } else {
          setCfDuplicatePatient(p ?? null);
        }
      } catch {
        if (!cancelled) setCfDuplicatePatient(null);
      } finally {
        setCfDuplicateChecking(false);
      }
    }, CF_DUPLICATE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [registerData.cf, isEditMode, patientId]);

  const handleRegistration = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIdentitaMancante(false);

    /**
     * Dove si va dopo il salvataggio: lo dice il pulsante premuto.
     *
     * "Salva e inizia visita" e' il caso comune, il paziente nuovo e' seduto
     * davanti al medico, ed e' anche quello dell'Invio (primo pulsante di
     * invio del form). Prima si tornava all'elenco e bisognava ritrovare il
     * paziente, aprirlo e premere "Nuova visita": e' il giro che il cardiologo
     * ha descritto come "ci metto un botto ad aggiungere un paziente". Con
     * "Salva" si apre la scheda del paziente appena creato.
     */
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const dopo: "visita" | "scheda" = submitter?.value === "scheda" ? "scheda" : "visita";

    // Un paziente senza cognome e senza codice fiscale non si ritrova piu':
    // la ricerca lavora su quei due. Il resto dell'anagrafica resta facoltativo.
    // Vale anche in modifica: e' lo stesso form, con le stesse regole.
    if (!registerData.lastName.trim() && !registerData.cf.trim()) {
      setIdentitaMancante(true);
      setError("Scrivi almeno il cognome o il codice fiscale: servono a ritrovare il paziente.");
      refLastName.current?.focus();
      return;
    }

    const cfNorm = registerData.cf.trim().toUpperCase();
    if (
      cfNorm &&
      isValidCodiceFiscaleFormat(cfNorm) &&
      cfDuplicatePatient &&
      (cfDuplicatePatient.codiceFiscale?.trim().toUpperCase() ?? "") === cfNorm
    ) {
      setError(
        "Questo codice fiscale è già assegnato a un altro paziente. Usa «Apri scheda paziente» sopra il campo oppure correggi il CF.",
      );
      return;
    }

    if (registerData.cf.trim() && !isValidCodiceFiscaleFormat(registerData.cf)) {
      setError("Codice fiscale non valido (formato: 16 caratteri)");
      return;
    }
    if (registerData.email.trim() && !validateEmail(registerData.email)) {
      setError("Email non valida");
      return;
    }
    if (registerData.birthday) {
      const birthErr = validateBirthDate(registerData.birthday);
      if (birthErr) {
        setErroreDataNascitaVisibile(true);
        setError(birthErr);
        return;
      }
    }
    if (registerData.height.trim()) {
      const h = parseOptionalHeight(registerData.height);
      if (h == null) {
        setError(`Altezza non valida (${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} cm)`);
        return;
      }
    }

    setIsLoading(true);

    try {
      const cfVal = registerData.cf.trim();
      // Senza scelta il sesso resta non indicato: prima veniva salvato "M", e
      // un dato inventato in anagrafica poi si stampa nel referto ed entra nei
      // calcoli che dipendono dal sesso.
      const sessoScelto: Patient["sesso"] =
        registerData.gender === "M" || registerData.gender === "F"
          ? registerData.gender
          : undefined;
      const payload = {
        ...(cfVal ? { codiceFiscale: cfVal.toUpperCase(), codiceFiscaleGenerato: false as const } : {}),
        nome: registerData.firstName.trim(),
        cognome: registerData.lastName.trim(),
        dataNascita: registerData.birthday || "",
        luogoNascita: registerData.birthplace.trim(),
        sesso: sessoScelto,
        email: registerData.email.trim() || undefined,
        telefono: registerData.phone.trim() || undefined,
        indirizzo: registerData.address.trim() || undefined,
        gruppoSanguigno: registerData.bloodType || undefined,
        allergie: registerData.allergies || undefined,
        altezza: registerData.height
          ? parseOptionalHeight(registerData.height)
          : undefined,
        // Arrivando da un progetto di ricerca il paziente ci entra subito.
        // Prima bisognava uscire, crearlo, tornare nel progetto e cercarlo:
        // tre passaggi per una cosa sola, ed e' il giro che il cardiologo ha
        // definito macchinoso provandolo.
        ...(gruppoDaArruolare
          ? {
              gruppiRicerca: [
                { nome: gruppoDaArruolare, dal: todayIsoDate() },
              ],
            }
          : {}),
      };
      if (isEditMode && patientId) {
        await PatientService.updatePatient(patientId, payload);
        setHasUnsavedChanges(false);
        showToast("Paziente aggiornato con successo");
        navigate(`/patient-history/${patientId}`);
        return;
      }
      const nuovo = await PatientService.addPatient(payload);
      setHasUnsavedChanges(false);
      showToast(
        gruppoDaArruolare
          ? `Paziente aggiunto e arruolato in ${gruppoDaArruolare}`
          : "Paziente aggiunto",
      );
      if (gruppoDaArruolare) {
        navigate(`/gruppi-ricerca?gruppo=${encodeURIComponent(gruppoDaArruolare)}`);
      } else if (dopo === "visita") {
        navigate(`/add-visit?patientId=${encodeURIComponent(nuovo.id)}`);
      } else {
        navigate(`/patient-history/${nuovo.id}`);
      }
    } catch (error: any) {
      console.error("Error saving patient:", error);
      setError(error?.message || "Errore durante il salvataggio del paziente.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isEditMode && patientId) initialLoadDone.current = true;
    else if (!searchParams.get("mode")) setTimeout(() => { initialLoadDone.current = true; }, 300);
  }, [isEditMode, patientId, searchParams]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const cfNormalized = registerData.cf.trim().toUpperCase();
  const cfHasInput = registerData.cf.trim().length > 0;
  const isCfValid = isValidCodiceFiscaleFormat(cfNormalized);
  const erroreDataNascita =
    erroreDataNascitaVisibile && registerData.birthday
      ? validateBirthDate(registerData.birthday)
      : null;
  const isSubmitDisabled =
    isLoading ||
    (!isEditMode &&
      cfHasInput &&
      (!isCfValid ||
        (!!cfDuplicatePatient &&
          (cfDuplicatePatient.codiceFiscale?.trim().toUpperCase() ?? "") ===
            cfNormalized)));

  if (isLoading && isEditMode && !patientId) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="corioli-page space-y-6 animate-in fade-in duration-500">
      <Breadcrumb
        items={
          isEditMode && patientId
            ? [
                { label: "Dashboard", path: "/" },
                { label: "Pazienti", path: "/pazienti" },
                { label: nomeInArchivio ?? "Paziente", path: `/patient-history/${patientId}` },
                { label: "Modifica" },
              ]
            : [
                { label: "Dashboard", path: "/" },
                { label: "Pazienti", path: "/pazienti" },
                { label: "Nuovo paziente" },
              ]
        }
      />
      <PageHeader
        title={isEditMode ? "Modifica paziente" : "Nuovo paziente"}
        subtitle={
          isEditMode
            ? undefined
            : "Basta il cognome o il codice fiscale: il resto si può aggiungere dopo."
        }
      />

      <Card className="shadow-sm border border-default-200">
        <CardBody className="gap-6 p-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleRegistration} className="space-y-6">
            {hasUnsavedChanges && (
              <Chip size="sm" color="warning" variant="flat">Modifiche non salvate</Chip>
            )}
            <div>
              <StepHeader title="Codice fiscale" />
              {cfDuplicatePatient && (
                <Card className="mb-3 border border-warning-400 bg-warning-50/80">
                  <CardBody className="flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-sm text-default-800">
                      Questo codice fiscale è già registrato:{" "}
                      <span className="font-semibold">
                        {formatPatientDisplayName(cfDuplicatePatient) ?? "senza nome"}
                      </span>
                      .
                    </p>
                    <Button
                      size="sm"
                      color="warning"
                      variant="solid"
                      className="shrink-0"
                      startContent={
                        <ExternalLink className="h-4 w-4" aria-hidden />
                      }
                      onPress={() =>
                        navigate(`/patient-history/${cfDuplicatePatient.id}`)
                      }
                    >
                      Apri scheda paziente
                    </Button>
                  </CardBody>
                </Card>
              )}
              {cfDuplicateChecking && !cfDuplicatePatient && (
                <div className="mb-2 flex items-center gap-2 text-xs text-default-500">
                  <Spinner size="sm" className="scale-75" />
                  Verifica presenza in anagrafica…
                </div>
              )}
              <div className="relative">
                <Input
                  ref={refCf}
                  name="cf"
                  autoFocus={!isEditMode}
                  label="Codice fiscale"
                  placeholder="16 caratteri"
                  value={registerData.cf}
                  onChange={handleChange}
                  onKeyDown={(e) =>
                    handleEnterAdvance(e, () => refLastName.current?.focus())
                  }
                  variant="bordered"
                  maxLength={16}
                  isInvalid={
                    cfHasInput &&
                    registerData.cf.trim().length === 16 &&
                    !isCfValid
                  }
                  errorMessage={
                    cfHasInput &&
                    registerData.cf.trim().length === 16 &&
                    !isCfValid
                      ? "Codice fiscale non valido (16 caratteri)"
                      : undefined
                  }
                  classNames={{
                    label: "text-gray-700 font-medium",
                    input: "uppercase font-mono tracking-wide placeholder:normal-case placeholder:font-sans placeholder:tracking-normal",
                  }}
                  description={
                    isEditMode
                      ? undefined
                      : "Dal CF si ricavano data e luogo di nascita e sesso."
                  }
                  endContent={
                    cfDecoding ? (
                      <Spinner size="sm" color="primary" className="scale-75" />
                    ) : isCfValid ? (
                      <Check
                        className="h-5 w-5 text-[#0F6E56]"
                        aria-label="Codice fiscale valido"
                      />
                    ) : null
                  }
                />
              </div>
            </div>

            <Divider />

            <div>
              <StepHeader title="Dati anagrafici" />
              {/* Prima il cognome: e' cosi' che il paziente si cerca e si
                  stampa ("ROSSI Mario"). */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="w-full">
                  <Input
                    ref={refLastName}
                    name="lastName"
                    label="Cognome"
                    // Il segnaposto vuoto tiene l'etichetta in alto anche a
                    // campo vuoto, come nei campi con data e tendina: senza,
                    // NextUI la mette grande al centro e la riga si sfalsa.
                    placeholder=" "
                    value={registerData.lastName}
                    onChange={handleChange}
                    onKeyDown={(e) =>
                      handleEnterAdvance(e, () => refFirstName.current?.focus())
                    }
                    variant="bordered"
                    isInvalid={identitaMancante && !registerData.lastName.trim()}
                    classNames={baseLabelClassNames}
                  />
                </div>
                <div className="w-full">
                  <Input
                    ref={refFirstName}
                    name="firstName"
                    label="Nome"
                    placeholder=" "
                    value={registerData.firstName}
                    onChange={handleChange}
                    onKeyDown={(e) =>
                      handleEnterAdvance(e, () =>
                        focusFirstFocusable(refBirthDateWrap.current),
                      )
                    }
                    variant="bordered"
                    classNames={baseLabelClassNames}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <I18nProvider locale="it-IT">
                  <div
                    ref={refBirthDateWrap}
                    className={cfAutofillWrapperClass(cfAutofilledFields.birthday)}
                  >
                    <DatePicker
                      label="Data di nascita"
                      variant="bordered"
                      showMonthAndYearPickers
                      onChange={handleDateChange}
                      onFocus={() => setErroreDataNascitaVisibile(false)}
                      onBlur={() => setErroreDataNascitaVisibile(true)}
                      isInvalid={Boolean(erroreDataNascita)}
                      errorMessage={erroreDataNascita ?? undefined}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.shiftKey) return;
                        const ne = e.nativeEvent;
                        if ("isComposing" in ne && ne.isComposing) return;
                        const t = e.target as HTMLElement;
                        if (t.closest('[role="dialog"], [role="grid"]')) return;
                        e.preventDefault();
                        refBirthplace.current?.focus();
                      }}
                      maxValue={parseDate(todayIsoDate())}
                      minValue={parseDate(`${MIN_BIRTH_YEAR}-01-01`)}
                      value={
                        registerData.birthday &&
                        /^\d{4}-\d{2}-\d{2}$/.test(registerData.birthday)
                          ? parseDate(registerData.birthday)
                          : null
                      }
                      classNames={baseLabelClassNames}
                    />
                    {registerData.birthday &&
                      !validateBirthDate(registerData.birthday) &&
                      calculateAge(registerData.birthday) != null && (
                        <p className="text-sm text-default-500 mt-1">
                          Età: {calculateAge(registerData.birthday)} anni
                        </p>
                      )}
                  </div>
                </I18nProvider>
                <div
                  className={cfAutofillWrapperClass(cfAutofilledFields.birthplace)}
                >
                  <Input
                    ref={refBirthplace}
                    name="birthplace"
                    label="Luogo di nascita"
                    placeholder=" "
                    value={registerData.birthplace}
                    onChange={handleChange}
                    onKeyDown={(e) =>
                      handleEnterAdvance(e, () =>
                        focusFirstFocusable(refGenderSelectWrap.current),
                      )
                    }
                    variant="bordered"
                    classNames={baseLabelClassNames}
                  />
                </div>
                <div
                  ref={refGenderSelectWrap}
                  className={cfAutofillWrapperClass(cfAutofilledFields.gender)}
                >
                  <Select
                    label="Sesso"
                    placeholder="Non indicato"
                    variant="bordered"
                    selectedKeys={
                      registerData.gender ? [registerData.gender] : []
                    }
                    onSelectionChange={(keys) =>
                      handleSelectChange(
                        "gender",
                        Array.from(keys)[0] as string,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.shiftKey) return;
                      const ne = e.nativeEvent;
                      if ("isComposing" in ne && ne.isComposing) return;
                      const t = e.target as HTMLElement;
                      if (t.closest('[role="listbox"]')) return;
                      e.preventDefault();
                      refEmail.current?.focus();
                    }}
                    classNames={baseLabelClassNames}
                  >
                    {/* "Non indicato" e' una scelta possibile, non l'assenza
                        di scelta: serve anche a togliere un sesso messo per
                        sbaglio, che una tendina a due voci non lascia piu'
                        riportare a vuoto. */}
                    <SelectItem key="-" value="-">Non indicato</SelectItem>
                    <SelectItem key="M" value="M">Maschio</SelectItem>
                    <SelectItem key="F" value="F">Femmina</SelectItem>
                  </Select>
                </div>
              </div>
            </div>

            <Divider />

            <div>
              <StepHeader title="Contatti" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  ref={refEmail}
                  name="email"
                  type="email"
                  label="Email"
                  placeholder=" "
                  value={registerData.email}
                  onChange={handleChange}
                  onKeyDown={(e) =>
                    handleEnterAdvance(e, () => refPhone.current?.focus())
                  }
                  variant="bordered"
                  classNames={{ label: "text-gray-700 font-medium" }}
                />
                <Input
                  ref={refPhone}
                  name="phone"
                  label="Telefono"
                  placeholder=" "
                  value={registerData.phone}
                  onChange={handleChange}
                  onKeyDown={(e) =>
                    handleEnterAdvance(e, () => refAddress.current?.focus())
                  }
                  variant="bordered"
                  classNames={{ label: "text-gray-700 font-medium" }}
                />
              </div>
              <Input
                ref={refAddress}
                name="address"
                label="Indirizzo"
                placeholder=" "
                value={registerData.address}
                onChange={handleChange}
                onKeyDown={(e) =>
                  handleEnterAdvance(e, () => {
                    if (clinicalDataOpen) {
                      focusFirstFocusable(refBloodSelectWrap.current);
                    } else {
                      refSubmit.current?.focus();
                    }
                  })
                }
                variant="bordered"
                className="mt-4"
                classNames={{ label: "text-gray-700 font-medium" }}
              />
            </div>

            <Divider />

            <div>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-default-200 bg-default-50 px-4 py-3 text-left transition-colors hover:bg-default-100"
                onClick={() => setClinicalDataOpen((open) => !open)}
                aria-expanded={clinicalDataOpen}
              >
                <div>
                  <span className="text-sm font-semibold text-default-700">
                    Dati clinici
                  </span>
                  <p className="mt-0.5 text-xs text-default-600">
                    Altezza, gruppo sanguigno, allergie: si aggiungono anche dopo
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-default-500 clinical-accordion-chevron ${
                    clinicalDataOpen ? "clinical-accordion-chevron--open" : ""
                  }`}
                  aria-hidden
                />
              </button>
              {clinicalDataOpen && (
              <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div ref={refBloodSelectWrap} className="w-full">
                  <Select
                    label="Gruppo sanguigno"
                    placeholder="Seleziona"
                    variant="bordered"
                    selectedKeys={
                      registerData.bloodType ? [registerData.bloodType] : []
                    }
                    onSelectionChange={(keys) =>
                      handleSelectChange("bloodType", Array.from(keys)[0] as string)
                    }
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.shiftKey) return;
                      const ne = e.nativeEvent;
                      if ("isComposing" in ne && ne.isComposing) return;
                      const t = e.target as HTMLElement;
                      if (t.closest('[role="listbox"]')) return;
                      e.preventDefault();
                      refHeight.current?.focus();
                    }}
                    classNames={{ label: "text-gray-700 font-medium" }}
                  >
                    {[
                      "A+",
                      "A-",
                      "B+",
                      "B-",
                      "AB+",
                      "AB-",
                      "0+",
                      "0-",
                      "Non noto",
                    ].map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
                <Input
                  ref={refHeight}
                  name="height"
                  type="number"
                  label="Altezza (cm)"
                  placeholder=" "
                  value={registerData.height}
                  onChange={handleChange}
                  onKeyDown={(e) =>
                    handleEnterAdvance(e, () => refAllergies.current?.focus())
                  }
                  variant="bordered"
                  min={MIN_HEIGHT_CM}
                  max={MAX_HEIGHT_CM}
                  classNames={{ label: "text-gray-700 font-medium" }}
                  description="Usata nella visita per calcolare il BMI insieme al peso rilevato"
                />
              </div>
              <Textarea
                ref={refAllergies}
                name="allergies"
                label="Allergie e intolleranze"
                placeholder=" "
                value={registerData.allergies}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  const ne = e.nativeEvent;
                  if ("isComposing" in ne && ne.isComposing) return;
                  e.preventDefault();
                  refSubmit.current?.focus();
                }}
                variant="bordered"
                minRows={2}
                classNames={{ label: "text-gray-700 font-medium" }}
              />
              </div>
              )}
            </div>

            {Object.values(cfAutofilledFields).some(Boolean) && (
              <p className="flex items-center gap-2 text-xs text-default-600">
                <Check className="h-4 w-4 text-[#0F6E56]" aria-hidden />
                I campi evidenziati in verde sono stati ricavati dal codice fiscale:
                controllali.
              </p>
            )}

            {/* Il primo pulsante di invio e' quello dell'Invio: per questo
                "Salva e inizia visita" viene prima nel DOM e la riga e'
                invertita a schermo. */}
            <div className="flex flex-col gap-3 border-t border-default-100 pt-5 sm:flex-row-reverse sm:items-center">
              <Button
                ref={refSubmit}
                type="submit"
                value={isEditMode ? "scheda" : "visita"}
                color="primary"
                className="corioli-cta w-full sm:w-auto sm:min-w-[200px]"
                isLoading={isLoading}
                isDisabled={isSubmitDisabled}
                startContent={
                  !isLoading && !isEditMode ? <CalendarPlus size={16} /> : undefined
                }
              >
                {isEditMode ? "Salva modifiche" : "Salva e inizia visita"}
              </Button>
              {!isEditMode && (
                <Button
                  type="submit"
                  value="scheda"
                  variant="bordered"
                  className="w-full sm:w-auto"
                  isDisabled={isLoading || isSubmitDisabled}
                >
                  Salva
                </Button>
              )}
              <button
                type="button"
                className="add-patient-cancel-btn"
                onClick={() =>
                  guardAction(() =>
                    navigate(isEditMode && patientId ? `/patient-history/${patientId}` : "/"),
                  )
                }
              >
                Annulla
              </button>
              {/* In fondo a sinistra, lontano dal salvataggio e in testo: e'
                  l'azione che non si torna indietro, e la conferma resta. */}
              {isEditMode && patientId && (
                <button
                  type="button"
                  className="text-sm font-medium text-danger-600 hover:underline sm:mr-auto"
                  onClick={() => setConfermaElimina(true)}
                >
                  Elimina paziente
                </button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      <ConfirmDangerModal
        isOpen={confermaElimina}
        onClose={() => {
          if (!eliminando) setConfermaElimina(false);
        }}
        title="Elimina paziente"
        confirmLabel="Elimina paziente"
        isLoading={eliminando}
        onConfirm={async () => {
          if (!patientId) return;
          setEliminando(true);
          try {
            await PatientService.deletePatient(patientId);
            setHasUnsavedChanges(false);
            setConfermaElimina(false);
            showToast("Paziente eliminato");
            navigate("/pazienti");
          } catch (err) {
            console.error("Errore eliminazione paziente:", err);
            setError("Errore durante l'eliminazione del paziente.");
            setConfermaElimina(false);
          } finally {
            setEliminando(false);
          }
        }}
      >
        <p className="text-sm text-default-600">
          Verranno eliminate anche tutte le visite di{" "}
          <span className="font-semibold">{nomeInArchivio ?? "questo paziente"}</span>.
        </p>
      </ConfirmDangerModal>
    </div>
  );
}