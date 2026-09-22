import {
  Input,
  Button,
  DatePicker,
  Select,
  SelectItem,
  Card,
  CardBody,
  CardHeader,
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
import dayjs from "dayjs";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PatientService } from "../../services/OfflineServices";
import { PageHeader } from "../../components/PageHeader";
import { UserPlus, Pencil, ExternalLink, Check, ChevronDown } from "lucide-react";
import { parseDate } from "@internationalized/date";
import { useToast } from "../../contexts/ToastContext";
import { Breadcrumb } from "../../components/Breadcrumb";
import {
  useRegisterUnsavedChanges,
  useUnsavedChanges,
} from "../../contexts/UnsavedChangesContext";
import { calculateAge } from "../../utils/dateUtils";
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

function StepHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="add-patient-step-badge" aria-hidden>
        {step}
      </span>
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
    </div>
  );
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
    } else if (cf) {
      setRegisterData((prevData) => ({ ...prevData, cf }));
    }
  }, [searchParams]);

  const loadPatientDataById = async (id: string) => {
    setIsLoading(true);
    try {
      const patient = await PatientService.getPatientById(id);
      if (patient) {
        setPatientId(patient.id);
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

  const handleDateChange = (date: any) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    clearCfAutofillFlag("birthday");
    if (date) {
      const formattedDate = dayjs(date.toString()).format("YYYY-MM-DD");
      const birthErr = validateBirthDate(formattedDate);
      if (birthErr) {
        setError(birthErr);
        return;
      }
      setRegisterData((prevData) => ({
        ...prevData,
        birthday: formattedDate,
      }));
    }
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
      } else {
        await PatientService.addPatient(payload);
        setHasUnsavedChanges(false);
        showToast(
          gruppoDaArruolare
            ? `Paziente aggiunto e arruolato in ${gruppoDaArruolare}`
            : "Paziente aggiunto con successo",
        );
      }
      navigate(
        gruppoDaArruolare
          ? `/gruppi-ricerca?gruppo=${encodeURIComponent(gruppoDaArruolare)}`
          : "/pazienti",
      );
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
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={isEditMode ? "Modifica Paziente" : "Aggiungi Nuovo Paziente"}
        subtitle={isEditMode ? "Modifica i dati del paziente selezionato" : "Inserisci i dati del paziente per aggiungerlo al sistema"}
        icon={isEditMode ? Pencil : UserPlus}
        iconColor={isEditMode ? "warning" : "primary"}
      />

      <Card className="shadow-lg border border-gray-100">
        <CardHeader className="pb-0 pt-6 px-6">
          <h2 className="text-xl font-semibold">Informazioni Paziente</h2>
        </CardHeader>
        <CardBody className="gap-6 p-6">
          {error && (
            <Card className="border-l-4 border-l-danger">
              <CardBody className="py-3">
                <p className="text-danger text-sm">{error}</p>
              </CardBody>
            </Card>
          )}

          {(() => {
            const items = [
              { label: "Dashboard", path: "/" },
              { label: "Pazienti", path: "/pazienti" },
              { label: isEditMode ? "Modifica paziente" : "Nuovo paziente" }
            ];
            return <Breadcrumb items={items} />;
          })()}

          <form onSubmit={handleRegistration} className="space-y-6">
            {hasUnsavedChanges && (
              <Chip size="sm" color="warning" variant="flat">Modifiche non salvate</Chip>
            )}
            {/* Step 1 — Codice fiscale */}
            <div>
              <StepHeader step={1} title="Codice Fiscale" />
              {cfDuplicatePatient && (
                <Card className="mb-3 border border-warning-400 bg-warning-50/80">
                  <CardBody className="flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-sm text-default-800">
                      Questo codice fiscale è già registrato:{" "}
                      <span className="font-semibold">
                        {cfDuplicatePatient.cognome} {cfDuplicatePatient.nome}
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
                  label={
                    isEditMode
                      ? "Codice fiscale (opzionale)"
                      : "Codice fiscale (opzionale) — inizia da qui"
                  }
                  placeholder="RSSMRA80A01H501U"
                  value={registerData.cf}
                  onChange={handleChange}
                  onKeyDown={(e) =>
                    handleEnterAdvance(e, () => refFirstName.current?.focus())
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
                    input: "uppercase font-mono tracking-wide",
                  }}
                  description={
                    isEditMode
                      ? "In modifica non applichiamo la decodifica automatica per non sovrascrivere i dati salvati."
                      : "Con un CF valido a 16 caratteri compiliamo automaticamente data di nascita, luogo (se noto), sesso e, se disponibili dall’anagrafe, nome e cognome."
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

            {/* Step 2 — Dati anagrafici */}
            <div>
              <StepHeader step={2} title="Dati Anagrafici" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="w-full">
                  <Input
                    ref={refFirstName}
                    name="firstName"
                    label="Nome (opzionale)"
                    placeholder="Inserisci il nome"
                    value={registerData.firstName}
                    onChange={handleChange}
                    onKeyDown={(e) =>
                      handleEnterAdvance(e, () => refLastName.current?.focus())
                    }
                    variant="bordered"
                    classNames={baseLabelClassNames}
                  />
                </div>
                <div className="w-full">
                  <Input
                    ref={refLastName}
                    name="lastName"
                    label="Cognome (opzionale)"
                    placeholder="Inserisci il cognome"
                    value={registerData.lastName}
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
                      label="Data di Nascita (opzionale)"
                      variant="bordered"
                      showMonthAndYearPickers
                      onChange={handleDateChange}
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
                          : undefined
                      }
                      classNames={baseLabelClassNames}
                    />
                    {registerData.birthday &&
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
                    label="Luogo di Nascita (opzionale)"
                    placeholder="Es. Roma, Milano..."
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
                    label="Genere (opzionale)"
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

            {/* Step 3 — Contatti */}
            <div>
              <StepHeader step={3} title="Contatti" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  ref={refEmail}
                  name="email"
                  type="email"
                  label="Email (opzionale)"
                  placeholder="esempio@email.com"
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
                  label="Telefono (opzionale)"
                  placeholder="3331234567"
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
                label="Indirizzo (opzionale)"
                placeholder="Via Roma 10, Milano"
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

            {/* Step 4 — Dati clinici (accordion) */}
            <div>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-default-200 bg-default-50 px-4 py-3 text-left transition-colors hover:bg-default-100"
                onClick={() => setClinicalDataOpen((open) => !open)}
                aria-expanded={clinicalDataOpen}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="add-patient-step-badge" aria-hidden>
                      4
                    </span>
                    <span className="text-lg font-medium text-gray-900">
                      Dati clinici (opzionale)
                    </span>
                  </div>
                  <p className="mt-1 pl-11 text-xs text-default-500">
                    Aggiungibili anche dopo dalla scheda paziente
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
                    label="Gruppo Sanguigno"
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
                  placeholder="170"
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
                label="Allergie / Intolleranze"
                placeholder="Elenca eventuali allergie a farmaci, alimenti, ecc."
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

            <p className="text-xs text-default-500 border-t border-default-100 pt-4">
              I campi in verde sono compilati automaticamente dal codice fiscale
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="add-patient-cancel-btn"
                onClick={() =>
                  guardAction(() =>
                    navigate(isEditMode ? "/pazienti" : "/"),
                  )
                }
              >
                ← Annulla
              </button>
              <Button
                ref={refSubmit}
                type="submit"
                color="primary"
                className="corioli-cta w-full sm:w-auto sm:min-w-[220px] shadow-md shadow-primary/20"
                isLoading={isLoading}
                isDisabled={isSubmitDisabled}
              >
                {isLoading
                  ? "Salvando..."
                  : isEditMode
                    ? "Aggiorna Paziente"
                    : "Salva Paziente"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}