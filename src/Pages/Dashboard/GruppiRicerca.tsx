import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  Input,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip,
} from "@nextui-org/react";
import {
  ArrowLeft,
  ArrowRight,
  FlaskConical,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { PatientService, PreferenceService } from "../../services/OfflineServices";
import type { AppartenenzaGruppo, Patient } from "../../types/Storage";
import { AppModal } from "../../components/AppModal";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import { PageHeader } from "../../components/PageHeader";
import { PageLoadingSkeleton } from "../../components/AppStartupSkeleton";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import { SearchIcon } from "../../components/navbar/SearchIcon";
import { calculateAge, todayIsoDate } from "../../utils/dateUtils";
import {
  MAX_GRUPPI_PER_PAZIENTE,
  MAX_GRUPPO_LEN,
  aggiungiGruppo,
  elencoGruppi,
  formattaDurata,
  giorniDa,
  gruppiDelPaziente,
  gruppoKey,
  normalizeRegistro,
  pazienteInGruppo,
  rimuoviGruppo,
  sanitizeGruppo,
  statoGruppi,
  validaNomeGruppo,
  type StatoGruppo,
} from "../../utils/gruppiRicerca";
import { formatPatientDisplayName } from "../../utils/patientDisplay";

/** Paziente arruolato in un progetto, con la sua data di ingresso. */
interface Arruolato {
  patient: Patient;
  dal?: string;
  giorni?: number;
}

/** Un progetto con i suoi arruolati, gia' filtrati dalla ricerca. */
interface Sezione {
  stato: StatoGruppo;
  arruolati: Arruolato[];
}

function iniziali(p: Patient): string {
  const n = (p.nome ?? "").trim();
  const c = (p.cognome ?? "").trim();
  const s = `${c[0] ?? ""}${n[0] ?? ""}`.toUpperCase();
  return s || "?";
}

function nomeCompleto(p: Patient): string {
  return formatPatientDisplayName(p) ?? "Senza nome";
}

/** Testo su cui lavora la ricerca: nome e codice fiscale. */
function testoRicerca(p: Patient): string {
  return `${nomeCompleto(p)} ${p.codiceFiscale ?? ""}`.toLowerCase();
}

/**
 * Pagina dedicata ai pazienti arruolati nei progetti di ricerca.
 *
 * Non è l'elenco pazienti con un filtro sopra: qui ci sono **solo** gli
 * arruolati, raggruppati per progetto, con da quanto ciascuno ne fa parte. Un
 * paziente che sta in due progetti compare sotto entrambi, che è il modo in cui
 * si guarda una coorte.
 *
 * Due livelli: l'elenco dei progetti e, aprendone uno, il progetto singolo
 * (`?gruppo=Nome`), che è anche il posto da cui si arruolano nuovi pazienti.
 */
export default function GruppiRicerca() {
  const navigate = useNavigate();
  /** `?gruppo=Nome` apre la pagina sul singolo progetto. */
  const [searchParams, setSearchParams] = useSearchParams();
  const soloGruppo = searchParams.get("gruppo");
  const [loading, setLoading] = useState(true);
  const [abilitati, setAbilitati] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [registro, setRegistro] = useState<string[]>([]);
  const [ricerca, setRicerca] = useState("");
  /** Creazione di un nuovo progetto dalla pagina, senza passare da Impostazioni. */
  const [creaOpen, setCreaOpen] = useState(false);
  const [nuovoNome, setNuovoNome] = useState("");
  const [erroreNome, setErroreNome] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** Arruolamento di piu' pazienti nello stesso progetto in un colpo solo. */
  const [gruppoTarget, setGruppoTarget] = useState<string | null>(null);
  const [ricercaCandidati, setRicercaCandidati] = useState("");
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [dataArruolamento, setDataArruolamento] = useState(todayIsoDate());
  const [arruolando, setArruolando] = useState(false);
  const [erroreArruolo, setErroreArruolo] = useState<string | null>(null);
  /** Paziente da togliere da un progetto, in attesa di conferma. */
  const [daRimuovere, setDaRimuovere] = useState<{
    patient: Patient;
    gruppo: string;
  } | null>(null);
  const [rimuovendo, setRimuovendo] = useState(false);
  const [erroreRimozione, setErroreRimozione] = useState<string | null>(null);
  /** Progetto da eliminare, in attesa di conferma. */
  const [daEliminare, setDaEliminare] = useState<StatoGruppo | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [erroreElimina, setErroreElimina] = useState<string | null>(null);

  useEffect(() => {
    const carica = async () => {
      setLoading(true);
      try {
        const [prefs, elenco] = await Promise.all([
          PreferenceService.getPreferences(),
          PatientService.getAllPatients(),
        ]);
        setAbilitati(Boolean(prefs?.gruppiRicercaEnabled));
        setRegistro(normalizeRegistro(prefs?.gruppiRicerca));
        setPatients(elenco);
      } catch (e) {
        console.error("Caricamento gruppi di ricerca non riuscito:", e);
      } finally {
        setLoading(false);
      }
    };
    void carica();
  }, []);

  const stati: StatoGruppo[] = useMemo(
    () => statoGruppi(registro, patients),
    [registro, patients],
  );

  /** Nomi gia' usati: registro delle preferenze piu' quelli in uso sui pazienti. */
  const gruppiDisponibili = useMemo(
    () => elencoGruppi(registro, patients),
    [registro, patients],
  );

  /**
   * Progetto aperto, risolto sul nome vero: nell'URL può esserci una grafia
   * diversa (maiuscole, spazi) oppure un nome che non esiste più.
   */
  const progettoAperto = useMemo(
    () =>
      soloGruppo
        ? (stati.find((s) => gruppoKey(s.nome) === gruppoKey(soloGruppo)) ?? null)
        : null,
    [soloGruppo, stati],
  );

  const entraNelProgetto = (nome: string) => {
    setRicerca("");
    setSearchParams({ gruppo: nome });
  };

  const tornaAiProgetti = () => {
    setRicerca("");
    setSearchParams({}, { replace: true });
  };

  const apriCrea = () => {
    setNuovoNome("");
    setErroreNome(null);
    setCreaOpen(true);
  };

  const chiudiCrea = () => {
    if (salvando) return;
    setCreaOpen(false);
    setErroreNome(null);
  };

  /**
   * Crea un progetto aggiungendone il nome al registro nelle preferenze.
   *
   * Rilegge le preferenze prima di salvare perche' `savePreferences` riscrive
   * l'intero oggetto: partire da quello su disco evita di cancellare modifiche
   * fatte altrove (per esempio in Impostazioni) mentre la pagina era aperta.
   */
  const creaGruppo = async () => {
    const nome = sanitizeGruppo(nuovoNome);
    const errore = validaNomeGruppo(nome, gruppiDisponibili);
    if (errore) {
      setErroreNome(errore);
      return;
    }
    setSalvando(true);
    try {
      const prefs = (await PreferenceService.getPreferences()) ?? {};
      const registroSuDisco = normalizeRegistro(prefs.gruppiRicerca);
      const erroreSuDisco = validaNomeGruppo(
        nome,
        elencoGruppi(registroSuDisco, patients),
      );
      if (erroreSuDisco) {
        setErroreNome(erroreSuDisco);
        return;
      }
      const aggiornato = [...registroSuDisco, nome];
      await PreferenceService.savePreferences({
        ...prefs,
        gruppiRicerca: aggiornato,
      });
      setRegistro(aggiornato);
      setCreaOpen(false);
      setNuovoNome("");
      setErroreNome(null);
    } catch (e) {
      console.error("Creazione gruppo non riuscita:", e);
      setErroreNome("Creazione non riuscita.");
    } finally {
      setSalvando(false);
    }
  };

  const apriAggiungi = (nome: string) => {
    setGruppoTarget(nome);
    setRicercaCandidati("");
    setSelezionati(new Set());
    setDataArruolamento(todayIsoDate());
    setErroreArruolo(null);
  };

  const chiudiAggiungi = () => {
    if (arruolando) return;
    setGruppoTarget(null);
    setErroreArruolo(null);
  };

  /** Pazienti non ancora nel progetto, in ordine alfabetico. */
  const candidati = useMemo(() => {
    if (!gruppoTarget) return [];
    const termine = ricercaCandidati.trim().toLowerCase();
    return patients
      .filter((p) => !pazienteInGruppo(p, gruppoTarget))
      .filter((p) => !termine || testoRicerca(p).includes(termine))
      .sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), "it-IT"));
  }, [patients, gruppoTarget, ricercaCandidati]);

  const commutaSelezione = (id: string) => {
    setSelezionati((prec) => {
      const next = new Set(prec);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Arruola nel progetto i pazienti selezionati.
   *
   * Un paziente per volta perche' `updatePatient` scrive un record alla volta:
   * se una scrittura fallisce a metà, quelle già andate a buon fine restano
   * valide, vengono riportate a schermo e tolte dalla selezione, così un nuovo
   * tentativo riparte dai soli pazienti mancanti.
   */
  const arruola = async () => {
    if (!gruppoTarget || selezionati.size === 0 || !dataArruolamento) return;
    setArruolando(true);
    setErroreArruolo(null);
    const salvati = new Map<string, AppartenenzaGruppo[]>();
    try {
      for (const p of patients.filter((x) => selezionati.has(x.id))) {
        const gruppi = aggiungiGruppo(
          gruppiDelPaziente(p),
          gruppoTarget,
          dataArruolamento,
        );
        await PatientService.updatePatient(p.id, {
          gruppiRicerca: gruppi,
          updatedAt: new Date().toISOString(),
        });
        salvati.set(p.id, gruppi);
      }
      setGruppoTarget(null);
    } catch (e) {
      console.error("Arruolamento non riuscito:", e);
      setErroreArruolo(
        salvati.size > 0
          ? `Arruolati ${salvati.size} pazienti, poi si è interrotto. Riprova con i restanti.`
          : "Arruolamento non riuscito.",
      );
    } finally {
      if (salvati.size > 0) {
        setPatients((prec) =>
          prec.map((p) =>
            salvati.has(p.id) ? { ...p, gruppiRicerca: salvati.get(p.id) } : p,
          ),
        );
        setSelezionati((prec) => {
          const next = new Set(prec);
          for (const id of salvati.keys()) next.delete(id);
          return next;
        });
      }
      setArruolando(false);
    }
  };

  /**
   * Toglie un paziente dal progetto.
   *
   * Del paziente non si perde nulla: sparisce l'appartenenza e con essa la
   * data di arruolamento, che riarruolandolo non torna indietro. Per questo il
   * gesto passa da una conferma invece di essere immediato.
   */
  const rimuoviDalProgetto = async () => {
    if (!daRimuovere) return;
    const { patient, gruppo } = daRimuovere;
    setRimuovendo(true);
    setErroreRimozione(null);
    try {
      const gruppi = rimuoviGruppo(gruppiDelPaziente(patient), gruppo);
      await PatientService.updatePatient(patient.id, {
        gruppiRicerca: gruppi,
        updatedAt: new Date().toISOString(),
      });
      setPatients((prec) =>
        prec.map((p) =>
          p.id === patient.id ? { ...p, gruppiRicerca: gruppi } : p,
        ),
      );
      setDaRimuovere(null);
    } catch (e) {
      console.error("Rimozione dal gruppo non riuscita:", e);
      setErroreRimozione("Rimozione non riuscita.");
    } finally {
      setRimuovendo(false);
    }
  };

  /**
   * Elimina un progetto.
   *
   * Prima toglie l'appartenenza a tutti i suoi pazienti, poi il nome dal
   * registro nelle preferenze. **L'ordine conta**: l'elenco dei gruppi e'
   * l'unione fra il registro e le appartenenze dei pazienti, quindi togliere
   * solo il registro lascerebbe il progetto a schermo, ricostruito dai
   * pazienti. Al contrario, se la scrittura delle preferenze non riesce resta
   * un progetto vuoto, che si rielimina senza danno.
   *
   * Un paziente per volta, come nell'arruolamento: se si interrompe a meta',
   * quelli gia' fatti restano tolti e un nuovo tentativo riparte dai restanti.
   */
  const eliminaGruppo = async () => {
    if (!daEliminare) return;
    const nome = daEliminare.nome;
    const key = gruppoKey(nome);
    setEliminando(true);
    setErroreElimina(null);
    const svuotati = new Map<string, AppartenenzaGruppo[]>();
    try {
      for (const p of patients.filter((x) => pazienteInGruppo(x, nome))) {
        const gruppi = rimuoviGruppo(gruppiDelPaziente(p), nome);
        await PatientService.updatePatient(p.id, {
          gruppiRicerca: gruppi,
          updatedAt: new Date().toISOString(),
        });
        svuotati.set(p.id, gruppi);
      }
      // Come in `creaGruppo`: si rilegge il registro da disco perche'
      // `savePreferences` riscrive l'intero oggetto.
      const prefs = (await PreferenceService.getPreferences()) ?? {};
      const aggiornato = normalizeRegistro(prefs.gruppiRicerca).filter(
        (g) => gruppoKey(g) !== key,
      );
      await PreferenceService.savePreferences({
        ...prefs,
        gruppiRicerca: aggiornato,
      });
      setRegistro(aggiornato);
      setDaEliminare(null);
      if (soloGruppo && gruppoKey(soloGruppo) === key) tornaAiProgetti();
    } catch (e) {
      console.error("Eliminazione gruppo non riuscita:", e);
      setErroreElimina(
        svuotati.size > 0
          ? `Tolti ${svuotati.size} pazienti dal progetto, poi si è interrotto. Riprova per completare.`
          : "Eliminazione non riuscita.",
      );
    } finally {
      if (svuotati.size > 0) {
        setPatients((prec) =>
          prec.map((p) =>
            svuotati.has(p.id) ? { ...p, gruppiRicerca: svuotati.get(p.id) } : p,
          ),
        );
      }
      setEliminando(false);
    }
  };

  /**
   * I progetti da mostrare, ciascuno con la sua coorte.
   *
   * Nell'elenco ci sono anche i progetti ancora vuoti, come scheda normale:
   * sono lavoro appena iniziato, non una nota a piè di pagina. Spariscono solo
   * quando c'è una ricerca in corso, che cerca fra gli arruolati e in un
   * progetto vuoto non può trovare nulla.
   */
  const sezioni: Sezione[] = useMemo(() => {
    const termine = ricerca.trim().toLowerCase();
    const tieniVuoti = !soloGruppo && !termine;
    return stati
      .filter((s) => !soloGruppo || gruppoKey(s.nome) === gruppoKey(soloGruppo))
      .map((stato) => {
        const key = gruppoKey(stato.nome);
        const arruolati: Arruolato[] = patients
          .map((p): Arruolato | null => {
            const g = gruppiDelPaziente(p).find((x) => gruppoKey(x.nome) === key);
            if (!g) return null;
            return {
              patient: p,
              dal: g.dal,
              giorni: g.dal ? giorniDa(g.dal) : undefined,
            };
          })
          .filter((a): a is Arruolato => a !== null)
          .filter((a) => !termine || testoRicerca(a.patient).includes(termine))
          // Prima gli arruolati da più tempo: è l'ordine con cui si legge una coorte.
          .sort((a, b) => (a.dal ?? "9999").localeCompare(b.dal ?? "9999"));
        return { stato, arruolati };
      })
      .filter((s) => s.arruolati.length > 0 || tieniVuoti);
  }, [stati, patients, ricerca, soloGruppo]);

  /** Pazienti distinti arruolati in almeno un progetto. */
  const totaleArruolati = useMemo(
    () => patients.filter((p) => gruppiDelPaziente(p).length > 0).length,
    [patients],
  );

  /** Progetti con almeno un paziente, senza risentire della ricerca. */
  const progettiAttivi = useMemo(
    () => stati.filter((s) => s.partecipanti > 0).length,
    [stati],
  );

  if (loading) {
    return <PageLoadingSkeleton variant="patient" />;
  }

  const azioni = (
    <>
      {abilitati && progettoAperto && (
        <Button
          color="primary"
          startContent={<UserPlus size={18} />}
          onPress={() => apriAggiungi(progettoAperto.nome)}
        >
          Aggiungi pazienti
        </Button>
      )}
      {abilitati && !soloGruppo && (
        <Button
          color="primary"
          startContent={<Plus size={18} />}
          onPress={apriCrea}
        >
          Nuovo gruppo
        </Button>
      )}
      {soloGruppo ? (
        <Button
          variant="flat"
          startContent={<ArrowLeft size={18} />}
          onPress={tornaAiProgetti}
        >
          Tutti i progetti
        </Button>
      ) : (
        <Button
          variant="flat"
          startContent={<Users size={18} />}
          onPress={() => navigate("/pazienti")}
        >
          Tutti i pazienti
        </Button>
      )}
    </>
  );

  const sottotitolo = !abilitati
    ? "Funzione non attiva"
    : progettoAperto
      ? `${progettoAperto.partecipanti} ${
          progettoAperto.partecipanti === 1
            ? "paziente arruolato"
            : "pazienti arruolati"
        }${
          progettoAperto.giorniAttivo != null
            ? ` · attivo da ${formattaDurata(progettoAperto.giorniAttivo)}`
            : ""
        }`
      : `${totaleArruolati} ${
          totaleArruolati === 1 ? "paziente arruolato" : "pazienti arruolati"
        } in ${progettiAttivi} ${progettiAttivi === 1 ? "progetto" : "progetti"}`;

  const campoRicerca = (
    <Input
      placeholder="Cerca fra gli arruolati per nome o codice fiscale"
      startContent={<SearchIcon />}
      value={ricerca}
      onValueChange={setRicerca}
      variant="bordered"
      isClearable
      onClear={() => setRicerca("")}
      classNames={{
        input: "text-base",
        inputWrapper: "h-12 border-default-200",
      }}
    />
  );

  /** Un progetto con la sua coorte. Nell'elenco l'intestazione ci entra dentro. */
  const renderSezione = ({ stato, arruolati }: Sezione) => (
    <Card key={stato.nome} className="corioli-card">
      <CardHeader
        className={`corioli-card-header flex justify-between items-center gap-2 ${
          progettoAperto
            ? ""
            : "cursor-pointer transition-colors hover:bg-gray-50 group/testata"
        }`}
        onClick={progettoAperto ? undefined : () => entraNelProgetto(stato.nome)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical size={17} className="text-brand-700 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate transition-colors group-hover/testata:text-brand-600">
              {stato.nome}
            </h3>
            <p className="text-xs text-default-500">
              {stato.partecipanti === 1
                ? "1 paziente"
                : `${stato.partecipanti} pazienti`}
              {stato.giorniAttivo != null && (
                <> · attivo da {formattaDurata(stato.giorniAttivo)}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Il conteggio c'e' gia' sotto il nome: il chip serve solo mentre si
              cerca, per dire quanti arruolati del progetto corrispondono. */}
          {arruolati.length !== stato.partecipanti && (
            <Chip
              size="sm"
              variant="flat"
              color={arruolati.length === 0 ? "default" : "secondary"}
            >
              {arruolati.length} {arruolati.length === 1 ? "trovato" : "trovati"}
            </Chip>
          )}
          {/* Il div ferma il click: l'intestazione, nell'elenco, apre il
              progetto, e un cestino che ci entra dentro sarebbe una trappola. */}
          <div onClick={(e) => e.stopPropagation()}>
            <Tooltip content="Elimina il progetto" size="sm">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="text-default-500 data-[hover=true]:text-danger"
                aria-label={`Elimina il progetto ${stato.nome}`}
                onPress={() => {
                  setErroreElimina(null);
                  setDaEliminare(stato);
                }}
              >
                <Trash2 size={15} />
              </Button>
            </Tooltip>
          </div>
          {!progettoAperto && (
            <ArrowRight
              size={14}
              className="text-gray-300 transition-colors group-hover/testata:text-brand-600"
            />
          )}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {arruolati.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5">
            <p className="text-sm text-default-500">
              Nessun paziente arruolato in questo progetto.
            </p>
            <Button
              size="sm"
              variant="flat"
              color="primary"
              startContent={<UserPlus size={15} />}
              onPress={() => apriAggiungi(stato.nome)}
            >
              Aggiungi pazienti
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {arruolati.map(({ patient, dal, giorni }) => (
            <div
              key={patient.id}
              className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => navigate(`/patient-history/${patient.id}`)}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar
                  name={iniziali(patient)}
                  size="sm"
                  color="default"
                  className="flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors truncate text-sm">
                    {nomeCompleto(patient)}
                    {calculateAge(patient.dataNascita) && (
                      <span className="text-default-500 font-normal ml-1">
                        ({calculateAge(patient.dataNascita)} anni)
                      </span>
                    )}
                  </p>
                  <div className="text-xs text-default-500 truncate flex items-center gap-1 flex-wrap mt-0.5">
                    {patient.codiceFiscale && (
                      <>
                        <CodiceFiscaleValue
                          value={patient.codiceFiscale}
                          generatedFromImport={Boolean(
                            patient.codiceFiscaleGenerato,
                          )}
                        />
                        <span className="text-default-300">·</span>
                      </>
                    )}
                    {dal ? (
                      <span>
                        arruolato il{" "}
                        {new Date(`${dal}T12:00:00`).toLocaleDateString("it-IT")}
                        {giorni != null && <> · da {formattaDurata(giorni)}</>}
                      </span>
                    ) : (
                      <span className="text-default-500">
                        data di arruolamento non registrata
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="flex items-center gap-1 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Tooltip content="Togli dal progetto" size="sm">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    className="text-default-500 data-[hover=true]:text-danger"
                    aria-label={`Togli ${nomeCompleto(patient)} dal progetto ${stato.nome}`}
                    onPress={() => {
                      setErroreRimozione(null);
                      setDaRimuovere({ patient, gruppo: stato.nome });
                    }}
                  >
                    <UserMinus size={15} />
                  </Button>
                </Tooltip>
                <ArrowRight
                  size={14}
                  className="text-gray-300 group-hover:text-brand-600 transition-colors"
                />
              </div>
            </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="corioli-page space-y-6">
      <PageHeader
        title={progettoAperto ? progettoAperto.nome : "Gruppi di ricerca"}
        subtitle={sottotitolo}
        actions={azioni}
      />

      {!abilitati ? (
        <Card className="corioli-card">
          <CardBody className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FlaskConical size={32} className="text-gray-200" />
            <p className="text-sm font-medium text-default-600">
              I gruppi di ricerca non sono attivi
            </p>
            <p className="text-xs text-default-500 max-w-[320px]">
              Attivali da Impostazioni per poter arruolare i pazienti nei tuoi
              progetti.
            </p>
            <Button
              size="sm"
              color="primary"
              variant="flat"
              className="mt-2"
              onPress={() => navigate("/settings")}
            >
              Vai alle impostazioni
            </Button>
          </CardBody>
        </Card>
      ) : soloGruppo && !progettoAperto ? (
        // Link vecchio o progetto eliminato: meglio dirlo che mostrare il vuoto.
        <Card className="corioli-card">
          <CardBody className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FlaskConical size={32} className="text-gray-200" />
            <p className="text-sm font-medium text-default-600">
              Progetto non trovato
            </p>
            <p className="text-xs text-default-500 max-w-[320px]">
              Il progetto &quot;{soloGruppo}&quot; non esiste più.
            </p>
            <Button
              size="sm"
              color="primary"
              variant="flat"
              className="mt-2"
              onPress={tornaAiProgetti}
            >
              Tutti i progetti
            </Button>
          </CardBody>
        </Card>
      ) : progettoAperto ? (
        <>
          {progettoAperto.partecipanti > 0 && campoRicerca}

          {sezioni.length === 0 ? (
            <Card className="corioli-card">
              <CardBody className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                {progettoAperto.partecipanti === 0 ? (
                  <>
                    <FlaskConical size={32} className="text-gray-200" />
                    <p className="text-sm font-medium text-default-600">
                      Nessun paziente in questo progetto
                    </p>
                    <p className="text-xs text-default-500 max-w-[320px]">
                      Arruola i primi pazienti: la data di arruolamento parte da
                      oggi e si corregge dalla scheda del paziente.
                    </p>
                    <Button
                      size="sm"
                      color="primary"
                      className="mt-2"
                      startContent={<UserPlus size={16} />}
                      onPress={() => apriAggiungi(progettoAperto.nome)}
                    >
                      Aggiungi pazienti
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-default-500">
                    Nessun arruolato corrisponde alla ricerca.
                  </p>
                )}
              </CardBody>
            </Card>
          ) : (
            sezioni.map(renderSezione)
          )}
        </>
      ) : (
        <>
          {totaleArruolati > 0 && campoRicerca}

          {sezioni.length === 0 ? (
            <Card className="corioli-card">
              <CardBody className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                {ricerca.trim() ? (
                  <p className="text-sm text-default-500">
                    Nessun arruolato corrisponde alla ricerca.
                  </p>
                ) : (
                  <>
                    <FlaskConical size={32} className="text-gray-200" />
                    <p className="text-sm font-medium text-default-600">
                      Nessun gruppo di ricerca
                    </p>
                    <p className="text-xs text-default-500 max-w-[320px]">
                      Crea il tuo primo progetto, poi arruolaci i pazienti.
                    </p>
                    <Button
                      size="sm"
                      color="primary"
                      className="mt-2"
                      startContent={<Plus size={16} />}
                      onPress={apriCrea}
                    >
                      Nuovo gruppo
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>
          ) : (
            sezioni.map(renderSezione)
          )}
        </>
      )}

      <AppModal isOpen={creaOpen} onClose={chiudiCrea} size="sm" placement="center">
        <ModalContent>
          <ModalHeader>Nuovo gruppo di ricerca</ModalHeader>
          <ModalBody>
            <Input
              autoFocus
              label="Nome del gruppo"
              placeholder="Es. Progetto SCORE2 2026"
              variant="bordered"
              maxLength={MAX_GRUPPO_LEN}
              value={nuovoNome}
              isInvalid={Boolean(erroreNome)}
              errorMessage={erroreNome ?? undefined}
              description={`${sanitizeGruppo(nuovoNome).length}/${MAX_GRUPPO_LEN} caratteri`}
              onValueChange={(v) => {
                setNuovoNome(v);
                setErroreNome(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void creaGruppo();
                }
              }}
            />
            <p className="text-xs text-default-500">
              Il gruppo nasce vuoto: aprilo per arruolare i pazienti.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={chiudiCrea} isDisabled={salvando}>
              Annulla
            </Button>
            <Button
              color="primary"
              isLoading={salvando}
              isDisabled={!sanitizeGruppo(nuovoNome)}
              onPress={() => void creaGruppo()}
            >
              Crea gruppo
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <ConfirmDangerModal
        isOpen={daRimuovere !== null}
        onClose={() => {
          setDaRimuovere(null);
          setErroreRimozione(null);
        }}
        title="Togli dal progetto"
        subtitle="La data di arruolamento non è recuperabile"
        confirmLabel="Togli dal progetto"
        isLoading={rimuovendo}
        onConfirm={() => void rimuoviDalProgetto()}
      >
        <p className="text-sm text-default-600">
          Vuoi togliere{" "}
          <strong>
            {daRimuovere ? nomeCompleto(daRimuovere.patient) : ""}
          </strong>{" "}
          da <strong>{daRimuovere?.gruppo}</strong>?
        </p>
        <p className="text-xs text-default-500">
          Il paziente e le sue visite restano in archivio: sparisce solo
          l&apos;appartenenza al progetto. Riarruolandolo la data di
          arruolamento riparte da capo.
        </p>
        {erroreRimozione && (
          <p className="text-xs text-danger">{erroreRimozione}</p>
        )}
      </ConfirmDangerModal>

      <ConfirmDangerModal
        isOpen={daEliminare !== null}
        onClose={() => {
          setDaEliminare(null);
          setErroreElimina(null);
        }}
        title="Elimina il progetto"
        confirmLabel="Elimina il progetto"
        isLoading={eliminando}
        onConfirm={() => void eliminaGruppo()}
      >
        <p className="text-sm text-default-600">
          Vuoi eliminare <strong>{daEliminare?.nome}</strong>?
        </p>
        <p className="text-xs text-default-500">
          {daEliminare && daEliminare.partecipanti > 0 ? (
            <>
              {daEliminare.partecipanti === 1
                ? "1 paziente verrà tolto"
                : `${daEliminare.partecipanti} pazienti verranno tolti`}{" "}
              dal progetto, insieme alle loro date di arruolamento. Pazienti e
              visite restano in archivio: si elimina il progetto, non la coorte.
            </>
          ) : (
            "Il progetto è vuoto: non ci sono arruolamenti da perdere."
          )}
        </p>
        {erroreElimina && <p className="text-xs text-danger">{erroreElimina}</p>}
      </ConfirmDangerModal>

      <AppModal
        isOpen={gruppoTarget !== null}
        onClose={chiudiAggiungi}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-0.5">
            <span>Aggiungi pazienti</span>
            <span className="text-xs font-normal text-default-500">
              {gruppoTarget}
            </span>
          </ModalHeader>
          <ModalBody className="gap-3">
            <Input
              autoFocus
              placeholder="Cerca per nome o codice fiscale"
              startContent={<SearchIcon />}
              variant="bordered"
              isClearable
              value={ricercaCandidati}
              onValueChange={setRicercaCandidati}
              onClear={() => setRicercaCandidati("")}
            />
            {/* Una sola data per tutti i selezionati: si corregge poi dalla
                scheda del singolo, dove il chip del gruppo la apre. */}
            <Input
              type="date"
              label="Arruolati il"
              labelPlacement="outside-left"
              variant="bordered"
              size="sm"
              max={todayIsoDate()}
              value={dataArruolamento}
              onValueChange={setDataArruolamento}
              className="max-w-[260px]"
              classNames={{ label: "text-xs text-default-500 shrink-0" }}
            />

            {/* La scorciatoia che mancava: da qui il paziente si crea e
                torna gia' arruolato, senza passare dall'elenco pazienti. */}
            <Button
              size="sm"
              variant="flat"
              className="self-start"
              startContent={<Plus size={15} />}
              onPress={() =>
                navigate(
                  `/add-patient?gruppo=${encodeURIComponent(gruppoTarget ?? "")}`,
                )
              }
            >
              Crea un paziente nuovo
            </Button>

            {candidati.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-sm text-default-500">
                  {ricercaCandidati.trim()
                    ? "Nessun paziente corrisponde alla ricerca."
                    : patients.length === 0
                      ? "Non ci sono pazienti in archivio."
                      : "Tutti i pazienti sono già in questo progetto."}
                </p>
                {patients.length === 0 && !ricercaCandidati.trim() && (
                  <Button
                    size="sm"
                    variant="flat"
                    startContent={<Plus size={16} />}
                    onPress={() => navigate("/add-patient")}
                  >
                    Aggiungi un paziente
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-default-200">
                {candidati.map((p) => {
                  const altri = gruppiDelPaziente(p);
                  const pieno = altri.length >= MAX_GRUPPI_PER_PAZIENTE;
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 p-3 ${
                        pieno
                          ? "opacity-50"
                          : "cursor-pointer transition-colors hover:bg-gray-50"
                      }`}
                    >
                      <Checkbox
                        size="sm"
                        isDisabled={pieno}
                        isSelected={selezionati.has(p.id)}
                        onValueChange={() => commutaSelezione(p.id)}
                        aria-label={`Arruola ${nomeCompleto(p)}`}
                      />
                      <Avatar
                        name={iniziali(p)}
                        size="sm"
                        color="default"
                        className="flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {nomeCompleto(p)}
                          {calculateAge(p.dataNascita) && (
                            <span className="ml-1 font-normal text-default-500">
                              ({calculateAge(p.dataNascita)} anni)
                            </span>
                          )}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-default-500">
                          {p.codiceFiscale && (
                            <CodiceFiscaleValue
                              value={p.codiceFiscale}
                              generatedFromImport={Boolean(
                                p.codiceFiscaleGenerato,
                              )}
                            />
                          )}
                          {pieno ? (
                            <span className="text-warning-600">
                              già in {MAX_GRUPPI_PER_PAZIENTE} gruppi
                            </span>
                          ) : (
                            altri.length > 0 && (
                              <span>
                                {altri.length === 1
                                  ? `già in ${altri[0].nome}`
                                  : `già in ${altri.length} gruppi`}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {erroreArruolo && (
              <p className="text-xs text-danger">{erroreArruolo}</p>
            )}
          </ModalBody>
          <ModalFooter className="items-center justify-between">
            <span className="text-xs text-default-500">
              {selezionati.size === 0
                ? "Nessun paziente selezionato"
                : `${selezionati.size} selezionati`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="light"
                onPress={chiudiAggiungi}
                isDisabled={arruolando}
              >
                Annulla
              </Button>
              <Button
                color="primary"
                isLoading={arruolando}
                isDisabled={selezionati.size === 0 || !dataArruolamento}
                onPress={() => void arruola()}
              >
                Arruola
              </Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </AppModal>
    </div>
  );
}
