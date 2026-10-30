import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip,
} from "@nextui-org/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  FilePlus2,
  FileSignature,
  FileText,
  Loader2,
  Maximize2,
  MousePointerClick,
  Paintbrush,
  Pencil,
  Pill,
  Printer,
  Redo2,
  Star,
  Stethoscope,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { AppModal, MODAL_SCHERMO_INTERO } from "../../components/AppModal";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import { AnteprimaModello, type ParteModello } from "../../components/modelliStampa/AnteprimaModello";
import { PannelloModello, type CambiaModello } from "../../components/modelliStampa/PannelloModello";
import { StrumentiZona } from "../../components/modelliStampa/StrumentiZona";
import { caricaLatoNellaPagina } from "../../components/modelliStampa/immagini";
import { coloreCss } from "../../components/modelliStampa/colori";
import { SceltaVariante } from "../../components/modelliStampa/stiliPronti";
import { useToast } from "../../contexts/ToastContext";
import { DoctorService, ModelliStampaService, PreferenceService } from "../../services/OfflineServices";
import { PdfService, type DocumentoImpaginato, type ZonaStampa } from "../../services/PdfService";
import {
  CERTIFICATO_ESEMPIO,
  PAZIENTE_ESEMPIO,
  RICETTA_ESEMPIO,
  RICHIESTA_ESEMPIO,
  VISITA_ESEMPIO,
} from "../../data/esempiStampa";
import {
  DOCUMENTI_STAMPA,
  NOMI_DOCUMENTO,
  NOMI_VARIANTE,
  STILI_PRONTI,
  applicaAspetto,
  copiaAspetto,
  duplicaModello,
  eModelloPronto,
  ePredefinito,
  fileModelli,
  leggiFileModelli,
  modelloInUso,
  modelloPredefinito,
  modelloPronto,
  nomeFileModelli,
  nomeUnivoco,
  prontoDi,
  ripiegoDopoEliminazione,
  stileProntoDi,
  titoloPredefinitoSezione,
  usaStileProntoOvunque,
  type StilePronto,
  type Variante,
} from "../../utils/modelliStampa";
import type {
  ArchivioModelliStampa,
  Doctor,
  DocumentoStampa,
  ModelloStampa,
  SezioneReferto,
} from "../../types/Storage";

/**
 * Editor dei modelli di stampa.
 *
 * A sinistra il PDF vero, rifatto a ogni modifica con il paziente di prova e
 * il profilo del medico; toccando una parte del foglio compare li' una barra
 * con le modifiche piu' comuni, e a destra le sue impostazioni complete.
 *
 * Si salva da solo: ogni modifica finisce nell'archivio mezzo secondo dopo, e
 * Annulla e Ripeti (Ctrl+Z, Ctrl+Y) bastano a tornare indietro. Prima c'erano
 * Salva, Scarta e una domanda a ogni cambio di modello con modifiche aperte:
 * tre concetti in piu' per un medico che voleva solo cambiare un colore
 * (Pablo, 22 ottobre 2026: "piu' semplice e intuitivo l'editing").
 *
 * I modelli di Corioli (il predefinito e quelli pronti, vedi `STILI_PRONTI`)
 * non si modificano: alla prima modifica ne nasce una copia, che diventa
 * quella in uso se il documento usava quello da cui e' nata o non aveva
 * ancora un modello.
 */

const ICONE_DOCUMENTO: Record<DocumentoStampa, LucideIcon> = {
  referto: Stethoscope,
  ricetta: Pill,
  certificato: FileSignature,
  richiestaEsame: FileText,
};

/** "i referti", "le ricette"...: per le frasi che parlano dei documenti. */
const DOCUMENTI_PLURALE: Record<DocumentoStampa, string> = {
  referto: "i referti",
  ricetta: "le ricette",
  certificato: "i certificati",
  richiestaEsame: "le richieste di esame",
};

/** "per i referti", "per le ricette"...: per i pulsanti e i messaggi. */
const PER_DOCUMENTO: Record<DocumentoStampa, string> = {
  referto: "per i referti",
  ricetta: "per le ricette",
  certificato: "per i certificati",
  richiestaEsame: "per le richieste di esame",
};

/** Una pillola dell'elenco dei modelli: aperta, in uso, o nessuna delle due. */
function Pillola({
  aperta,
  inUso,
  onClick,
  children,
  distintivo = "in uso",
}: {
  aperta: boolean;
  inUso: boolean;
  onClick?: () => void;
  children: ReactNode;
  /** Il testo del distintivo "in uso", quando serve dire di piu'. */
  distintivo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aperta}
      className={[
        "inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-[15px] transition-colors",
        aperta
          ? "border-2 border-brand-600 bg-brand-50 font-semibold text-brand-800"
          : "border-2 border-default-200 bg-white font-medium text-default-700 hover:border-default-400",
      ].join(" ")}
    >
      {inUso && <Star size={16} className="fill-current text-amber-500" aria-label="In uso" />}
      {children}
      {inUso && <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">{distintivo}</span>}
    </button>
  );
}

type Vista = "modelli" | "personalizza";

const VISTE: { id: Vista; nome: string }[] = [
  { id: "modelli", nome: "Modelli" },
  { id: "personalizza", nome: "Personalizza" },
];

/** Mezzo secondo dopo l'ultima modifica il modello si salva. */
const ATTESA_SALVATAGGIO = 450;

function scaricaFile(contenuto: string, nome: string) {
  const blob = new Blob([contenuto], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Il documento di prova impaginato col modello dato (vedi `data/esempiStampa`). */
async function impaginaEsempio(
  m: ModelloStampa, doctor: Doctor | null, conZone: boolean,
): Promise<DocumentoImpaginato | undefined> {
  switch (m.documento) {
    case "referto":
      return PdfService.impaginaVisita(PAZIENTE_ESEMPIO, VISITA_ESEMPIO, { modello: m }, conZone);
    case "ricetta":
      return PdfService.impaginaRicetta(PAZIENTE_ESEMPIO, RICETTA_ESEMPIO, doctor, m, conZone);
    case "certificato":
      return PdfService.impaginaCertificato(PAZIENTE_ESEMPIO, CERTIFICATO_ESEMPIO, doctor, m, conZone);
    default:
      return PdfService.impaginaRichiestaEsame(PAZIENTE_ESEMPIO, RICHIESTA_ESEMPIO, doctor, m, conZone);
  }
}

function inUnCampo(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

type Storia = {
  passato: ModelloStampa[];
  futuro: ModelloStampa[];
  chiave?: string;
  quando: number;
};

type StatoSalvataggio = "salvato" | "in-corso" | "errore";

export default function ModelliStampa() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [parametri, setParametri] = useSearchParams();
  const documentoIniziale = parametri.get("documento") as DocumentoStampa | null;

  const [documento, setDocumento] = useState<DocumentoStampa>(
    documentoIniziale && DOCUMENTI_STAMPA.includes(documentoIniziale) ? documentoIniziale : "referto",
  );
  const [archivio, setArchivioStato] = useState<ArchivioModelliStampa>({ modelli: [], inUso: {} });
  const archivioRef = useRef(archivio);
  const [caricato, setCaricato] = useState(false);
  const [bozza, setBozzaStato] = useState<ModelloStampa>(() => modelloPredefinito(documento));
  const bozzaRef = useRef(bozza);
  const storia = useRef<Storia>({ passato: [], futuro: [], quando: 0 });
  const [, setVersioneStoria] = useState(0);
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>("salvato");

  const [parte, setParte] = useState<ParteModello>("pagina");
  /**
   * Cosa mostra la colonna di destra: la scelta del modello o le sue
   * impostazioni. Erano una sotto l'altra, una colonna di oltre due metri
   * da scorrere per arrivare alle modifiche.
   */
  const [vista, setVista] = useState<Vista>("modelli");
  const [sezioneAttiva, setSezioneAttiva] = useState<SezioneReferto | null>(null);
  const [anteprima, setAnteprima] = useState<DocumentoImpaginato | null>(null);
  const [pagina, setPagina] = useState(1);
  const [inAggiornamento, setInAggiornamento] = useState(false);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);

  const [daImportare, setDaImportare] = useState<{ modelli: ModelloStampa[]; scartati: number } | null>(null);
  const [daEliminare, setDaEliminare] = useState<ModelloStampa | null>(null);
  const [confermaTutti, setConfermaTutti] = useState(false);
  /** La versione dei modelli pronti che si apre dalle pillole, se ne e' aperto uno del medico. */
  const [variantePronti, setVariantePronti] = useState<Variante>("colore");
  const [schermoIntero, setSchermoIntero] = useState<string | null>(null);
  const [inStampa, setInStampa] = useState(false);
  const inputImporta = useRef<HTMLInputElement>(null);
  /** La colonna di destra, che sulle finestre larghe scorre da sola. */
  const colonnaDestra = useRef<HTMLDivElement>(null);
  /** La barra del modello aperto, ferma in cima alla colonna di destra. */
  const barraModello = useRef<HTMLDivElement>(null);
  /**
   * Quanto e' alta: quello che la colonna fa salire in vista (una sezione del
   * referto, il pannello) si ferma sotto di lei invece di finirle dietro.
   */
  const [altezzaBarra, setAltezzaBarra] = useState(0);
  useEffect(() => {
    const el = barraModello.current;
    if (!el) return;
    const osservatore = new ResizeObserver(() => setAltezzaBarra(el.offsetHeight));
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, []);

  const aggiornaArchivio = useCallback((a: ArchivioModelliStampa) => {
    archivioRef.current = a;
    setArchivioStato(a);
  }, []);

  const setBozza = useCallback((m: ModelloStampa, azzeraStoria = false) => {
    bozzaRef.current = m;
    setBozzaStato(m);
    if (azzeraStoria) {
      storia.current = { passato: [], futuro: [], quando: 0 };
      setVersioneStoria((v) => v + 1);
    }
  }, []);

  // ── Caricamento ────────────────────────────────────────────────────────────
  useEffect(() => {
    void caricaLatoNellaPagina();
    void (async () => {
      const [a, d, p] = await Promise.all([
        ModelliStampaService.getArchivio(),
        DoctorService.getDoctor(),
        PreferenceService.getPreferences(),
      ]);
      aggiornaArchivio(a);
      setDoctor(d);
      setPrefs(p);
      const inUso = modelloInUso(a, documento);
      const pronto = prontoDi(inUso);
      if (pronto) setVariantePronti(pronto.variante);
      setBozza(structuredClone(inUso), true);
      // Chi ha gia' un modello suo apre l'editor per cambiarlo; chi usa
      // ancora uno di Corioli, per sceglierne uno.
      setVista(pronto ? "modelli" : "personalizza");
      setCaricato(true);
    })();
    // Solo all'apertura: dopo, documento e modello li cambia chi usa la pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Salvataggio automatico ─────────────────────────────────────────────────
  /**
   * Le scritture dell'archivio in fila: due salvataggi ravvicinati (una
   * modifica e subito un cambio di modello) leggerebbero lo stesso archivio e
   * il secondo cancellerebbe il primo.
   */
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const inFila = useCallback(<T,>(lavoro: () => Promise<T>): Promise<T> => {
    const turno = fila.current.then(lavoro, lavoro);
    fila.current = turno.catch(() => undefined);
    return turno;
  }, []);
  const attesa = useRef<number | null>(null);
  /** Modelli appena eliminati: un salvataggio rimasto in coda non li fa risorgere. */
  const eliminati = useRef(new Set<string>());
  /**
   * Copie nate modificando il modello di Corioli in uso: prendono il suo
   * posto. Chi ha scelto "Moderno" alla prima configurazione e ci cambia il
   * colore vuole vedere il colore nuovo sui suoi referti.
   */
  const prendonoIlPosto = useRef(new Set<string>());

  const scriviModello = useCallback((m: ModelloStampa) => inFila(async (): Promise<boolean> => {
    if (eModelloPronto(m) || eliminati.current.has(m.id)) return true;
    setSalvataggio("in-corso");
    const a = archivioRef.current;
    const ora = new Date().toISOString();
    const daSalvare: ModelloStampa = { ...m, creatoIl: m.creatoIl || ora, aggiornatoIl: ora };
    const esiste = a.modelli.some((x) => x.id === m.id);
    const modelli = esiste
      ? a.modelli.map((x) => (x.id === m.id ? daSalvare : x))
      : [...a.modelli, daSalvare];
    // Il primo modello fatto per un documento diventa quello in uso: chi lo ha
    // appena creato lo vuole vedere sui suoi fogli, non cercare dove si accende.
    const primo = !esiste && (!a.inUso[m.documento] || prendonoIlPosto.current.has(m.id));
    const inUso = primo ? { ...a.inUso, [m.documento]: m.id } : a.inUso;
    try {
      aggiornaArchivio(await ModelliStampaService.salvaArchivio({ modelli, inUso }));
      setSalvataggio("salvato");
      if (!esiste) {
        const nome = m.nome.trim() || "Il mio modello";
        showToast(
          primo
            ? `Creato «${nome}», in uso ${PER_DOCUMENTO[m.documento]}. Le modifiche si salvano da sole.`
            : `Creato «${nome}». Le modifiche si salvano da sole.`,
        );
      }
      return true;
    } catch (e) {
      console.error("Salvataggio del modello non riuscito", e);
      setSalvataggio("errore");
      showToast("Il modello non si è salvato. Riprova.", "error");
      return false;
    }
  }), [aggiornaArchivio, inFila, showToast]);

  const salvaPiuTardi = useCallback(() => {
    if (attesa.current != null) window.clearTimeout(attesa.current);
    attesa.current = window.setTimeout(() => {
      attesa.current = null;
      void scriviModello(bozzaRef.current);
    }, ATTESA_SALVATAGGIO);
  }, [scriviModello]);

  /** Salva subito quello che aspettava, e aspetta che la fila sia vuota. */
  const salvaOra = useCallback(async (): Promise<void> => {
    if (attesa.current != null) {
      window.clearTimeout(attesa.current);
      attesa.current = null;
      await scriviModello(bozzaRef.current);
      return;
    }
    await fila.current;
  }, [scriviModello]);

  // Uscendo dalla pagina si salva quello che stava per salvarsi.
  const scriviModelloRef = useRef(scriviModello);
  scriviModelloRef.current = scriviModello;
  useEffect(() => () => {
    if (attesa.current != null) {
      window.clearTimeout(attesa.current);
      void scriviModelloRef.current(bozzaRef.current);
    }
  }, []);

  // ── Modifiche e storia ─────────────────────────────────────────────────────
  const nomiDi = useCallback(
    (d: DocumentoStampa) => archivioRef.current.modelli.filter((m) => m.documento === d).map((m) => m.nome),
    [],
  );

  const cambia: CambiaModello = useCallback((modifica, chiave) => {
    const prima = bozzaRef.current;
    // I modelli di Corioli non si toccano: la prima modifica apre un modello
    // nuovo. Nella storia entra la copia com'era, cosi' Annulla resta nel
    // modello nuovo invece di tornare a quello di Corioli.
    const diCorioli = eModelloPronto(prima);
    const base = diCorioli ? duplicaModello(prima, nomiDi(prima.documento)) : prima;
    if (diCorioli && modelloInUso(archivioRef.current, prima.documento).id === prima.id) {
      prendonoIlPosto.current.add(base.id);
    }
    const dopo = structuredClone(base);
    modifica(dopo);
    const s = storia.current;
    const ora = Date.now();
    // I tasti dello stesso campo si annullano insieme, non una lettera alla volta.
    const insieme = !diCorioli && chiave && s.chiave === chiave && ora - s.quando < 1500;
    if (diCorioli) {
      s.passato = [base];
    } else if (!insieme) {
      s.passato.push(prima);
      if (s.passato.length > 80) s.passato.shift();
    }
    s.futuro = [];
    s.chiave = chiave;
    s.quando = ora;
    setBozza(dopo);
    setVersioneStoria((v) => v + 1);
    salvaPiuTardi();
  }, [nomiDi, salvaPiuTardi, setBozza]);

  const annulla = useCallback(() => {
    const s = storia.current;
    const precedente = s.passato.pop();
    if (!precedente) return;
    s.futuro.push(bozzaRef.current);
    s.chiave = undefined;
    setBozza(precedente);
    setVersioneStoria((v) => v + 1);
    salvaPiuTardi();
  }, [salvaPiuTardi, setBozza]);

  const ripeti = useCallback(() => {
    const s = storia.current;
    const successivo = s.futuro.pop();
    if (!successivo) return;
    s.passato.push(bozzaRef.current);
    s.chiave = undefined;
    setBozza(successivo);
    setVersioneStoria((v) => v + 1);
    salvaPiuTardi();
  }, [salvaPiuTardi, setBozza]);

  /** Un nome vuoto o gia' usato si sistema quando si esce dal campo. */
  const sistemaNome = () => {
    const m = bozzaRef.current;
    if (eModelloPronto(m)) return;
    const altri = archivioRef.current.modelli
      .filter((x) => x.documento === m.documento && x.id !== m.id)
      .map((x) => x.nome);
    const giusto = nomeUnivoco(m.nome.trim() || "Il mio modello", altri);
    if (giusto !== m.nome) cambia((x) => { x.nome = giusto; });
  };

  // ── Documenti e modelli ────────────────────────────────────────────────────
  const apriModello = useCallback(async (m: ModelloStampa) => {
    await salvaOra();
    // Aprendo uno dei propri modelli, le pillole dei modelli pronti restano
    // nella versione dell'ultimo aperto.
    const p = prontoDi(m);
    if (p) setVariantePronti(p.variante);
    setBozza(structuredClone(m), true);
    setPagina(1);
    setSezioneAttiva(null);
  }, [salvaOra, setBozza]);

  const scegliDocumento = async (d: DocumentoStampa) => {
    if (d === documento) return;
    await salvaOra();
    setDocumento(d);
    setParametri({ documento: d }, { replace: true });
    await apriModello(modelloInUso(archivioRef.current, d));
    if (parte === "sezioni" && d !== "referto") setParte("pagina");
  };

  const usaModello = async (m: ModelloStampa) => {
    await salvaOra();
    await inFila(async () => {
      const a = archivioRef.current;
      const inUso = { ...a.inUso };
      if (ePredefinito(m)) delete inUso[m.documento];
      else inUso[m.documento] = m.id;
      aggiornaArchivio(await ModelliStampaService.salvaArchivio({ ...a, inUso }));
    });
    showToast(`«${m.nome}» è in uso ${PER_DOCUMENTO[m.documento]}`);
  };

  /** Un modello pronto, cosi' com'e': si guarda, si usa, o si cambia in una copia. */
  const apriPronto = (stile: StilePronto, variante: Variante) => {
    void apriModello(modelloPronto(stile, variante, documento));
  };

  /**
   * Colori, carattere e forme di un modello pronto sul modello del medico
   * aperto: testi, logo, intestazione e firma restano i suoi. Stava nella
   * scheda Aspetto, con le miniature degli stili; ora e' un menu accanto ai
   * modelli pronti, che si scelgono in un posto solo.
   */
  const applicaStilePronto = (stile: StilePronto, variante: Variante) => {
    if (eModelloPronto(bozzaRef.current)) return;
    cambia((x) => applicaAspetto(x, stile[variante]));
  };

  /** Il modello pronto aperto per tutti e quattro i documenti. */
  const usaProntoOvunque = async () => {
    const p = prontoDi(bozzaRef.current);
    if (!p) return;
    await salvaOra();
    await inFila(async () => {
      aggiornaArchivio(
        await ModelliStampaService.salvaArchivio(usaStileProntoOvunque(archivioRef.current, p.stile, p.variante)),
      );
    });
    showToast(`Tutti i documenti escono con «${p.stile.nome} ${NOMI_VARIANTE[p.variante]}»`);
  };

  /** Un modello nuovo parte da quello di Corioli, qualunque sia quello aperto. */
  const nuovoModello = async () => {
    await salvaOra();
    const m = duplicaModello(modelloPredefinito(documento), nomiDi(documento), "Il mio modello");
    setBozza(m, true);
    setParte("pagina");
    setVista("personalizza");
    setPagina(1);
    await scriviModello(m);
  };

  /** La copia del modello aperto, accanto all'originale. */
  const duplica = async () => {
    await salvaOra();
    const corrente = bozzaRef.current;
    const copia = duplicaModello(
      corrente, nomiDi(corrente.documento), eModelloPronto(corrente) ? "Il mio modello" : undefined,
    );
    setBozza(copia, true);
    setVista("personalizza");
    await scriviModello(copia);
  };

  const elimina = async (m: ModelloStampa) => {
    // Un salvataggio in attesa del modello che si elimina non deve farlo risorgere.
    if (bozzaRef.current.id === m.id && attesa.current != null) {
      window.clearTimeout(attesa.current);
      attesa.current = null;
    }
    eliminati.current.add(m.id);
    await inFila(async () => {
      const a = archivioRef.current;
      const modelli = a.modelli.filter((x) => x.id !== m.id);
      const inUso = { ...a.inUso };
      if (inUso[m.documento] === m.id) {
        const ripiego = ripiegoDopoEliminazione(a, m.documento);
        if (ePredefinito(ripiego)) delete inUso[m.documento];
        else inUso[m.documento] = ripiego.id;
      }
      aggiornaArchivio(await ModelliStampaService.salvaArchivio({ modelli, inUso }));
    });
    setDaEliminare(null);
    setBozza(structuredClone(modelloInUso(archivioRef.current, documento)), true);
    showToast(`Modello «${m.nome}» eliminato`);
  };

  /**
   * Porta aspetto e carta intestata del modello aperto sugli altri documenti:
   * sui loro modelli in uso, o su un modello nuovo dove usano quello di
   * Corioli. Chi fa il suo referto vuole la stessa carta per la ricetta, senza
   * rifare logo, colori e intestazione tre volte.
   */
  const applicaATutti = async () => {
    setConfermaTutti(false);
    await salvaOra();
    const origine = bozzaRef.current;
    await inFila(async () => {
      const a = archivioRef.current;
      const modelli = [...a.modelli];
      const inUso = { ...a.inUso };
      const ora = new Date().toISOString();
      for (const d of DOCUMENTI_STAMPA) {
        if (d === origine.documento) continue;
        const esistente = modelli.find((x) => x.id === inUso[d] && x.documento === d);
        const destinazione = esistente
          ? structuredClone(esistente)
          : duplicaModello(
            modelloPredefinito(d),
            modelli.filter((x) => x.documento === d).map((x) => x.nome),
            origine.nome,
          );
        copiaAspetto(origine, destinazione);
        destinazione.aggiornatoIl = ora;
        const i = modelli.findIndex((x) => x.id === destinazione.id);
        if (i >= 0) modelli[i] = destinazione;
        else modelli.push(destinazione);
        inUso[d] = destinazione.id;
      }
      aggiornaArchivio(await ModelliStampaService.salvaArchivio({ modelli, inUso }));
    });
    const altri = DOCUMENTI_STAMPA.filter((d) => d !== origine.documento).map((d) => NOMI_DOCUMENTO[d]);
    showToast(`${altri.join(", ")}: ora hanno lo stesso aspetto`);
  };

  /** Le impostazioni, alla sezione giusta: quello che aspettava di salvarsi si salva uscendo. */
  const vaiImpostazioni = (sezione: string) => {
    navigate(`/settings?sezione=${sezione}`);
  };

  /**
   * Stampa di prova: il documento di esempio senza le zone e senza la foto
   * della carta prestampata, come uscira' davvero. Serve soprattutto a
   * controllare su un foglio vero che il testo non finisca sull'intestazione.
   */
  const stampaDiProva = async () => {
    setInStampa(true);
    try {
      const doc = await impaginaEsempio(bozzaRef.current, doctor, false);
      if (!doc) return;
      const api = (window as unknown as {
        electronAPI?: { openPdfForPrint?: (b64: string) => Promise<unknown> };
      }).electronAPI;
      if (api?.openPdfForPrint) {
        await api.openPdfForPrint(await blobToBase64(doc.blob));
        showToast("Stampa di prova aperta: stampala dal visualizzatore.");
      } else {
        const url = URL.createObjectURL(doc.blob);
        window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      console.error("Stampa di prova non riuscita", e);
      showToast("La stampa di prova non si è aperta. Riprova.", "error");
    } finally {
      setInStampa(false);
    }
  };

  const apriSchermoIntero = () => {
    if (!anteprima) return;
    setSchermoIntero(URL.createObjectURL(anteprima.blob));
  };
  const chiudiSchermoIntero = () => {
    setSchermoIntero((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  };

  // ── Importa ed esporta ─────────────────────────────────────────────────────
  const versioneApp = import.meta.env?.VITE_APP_VERSION;

  const esporta = (modelli: ModelloStampa[]) => {
    if (modelli.length === 0) return;
    scaricaFile(fileModelli(modelli, versioneApp), nomeFileModelli(modelli));
  };

  const leggiImportazione = async (file: File | undefined) => {
    if (!file) return;
    const letto = leggiFileModelli(await file.text());
    if (!letto.ok) {
      showToast(letto.errore, "error");
      return;
    }
    setDaImportare({ modelli: letto.modelli, scartati: letto.scartati });
  };

  const confermaImportazione = async () => {
    if (!daImportare) return;
    const importati = daImportare.modelli;
    setDaImportare(null);
    await salvaOra();
    await inFila(async () => {
      const a = archivioRef.current;
      const modelli = [...a.modelli];
      for (const m of importati) {
        const nomi = modelli.filter((x) => x.documento === m.documento).map((x) => x.nome);
        modelli.push({ ...m, nome: nomeUnivoco(m.nome, nomi) });
      }
      aggiornaArchivio(await ModelliStampaService.salvaArchivio({ ...a, modelli }));
    });
    const primo = archivioRef.current.modelli.find((x) => x.id === importati[0].id);
    if (primo) {
      setDocumento(primo.documento);
      setParametri({ documento: primo.documento }, { replace: true });
      await apriModello(primo);
    }
    showToast(importati.length === 1 ? "Modello importato" : `${importati.length} modelli importati`);
  };

  // ── Anteprima ──────────────────────────────────────────────────────────────
  const richiesta = useRef(0);
  useEffect(() => {
    if (!caricato) return;
    const numero = ++richiesta.current;
    setInAggiornamento(true);
    const attesaAnteprima = window.setTimeout(() => {
      void (async () => {
        try {
          const risultato = await impaginaEsempio(bozzaRef.current, doctor, true);
          if (numero !== richiesta.current || !risultato) return;
          setAnteprima(risultato);
          setPagina((p) => Math.min(p, risultato.pagine));
        } catch (e) {
          console.error("Anteprima del modello non generata", e);
        } finally {
          if (numero === richiesta.current) setInAggiornamento(false);
        }
      })();
    }, 220);
    return () => window.clearTimeout(attesaAnteprima);
  }, [bozza, doctor, caricato]);

  // Una sezione scelta nel pannello porta l'anteprima alla sua pagina.
  useEffect(() => {
    if (!sezioneAttiva || !anteprima) return;
    const zona = anteprima.zone.find((z) => z.zona === "sezione" && z.sezione === sezioneAttiva);
    if (zona && zona.pagina !== pagina) setPagina(zona.pagina);
    // Solo quando cambia la sezione scelta, non a ogni anteprima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sezioneAttiva]);

  const mostraPannello = () => {
    setVista("personalizza");
    window.setTimeout(() => {
      const pannello = document.getElementById("pannello-modello");
      const colonna = colonnaDestra.current;
      if (!pannello) return;
      // Sulle finestre larghe la colonna di destra scorre da sola: il pannello
      // sale fin sotto la barra del modello, cosi' le impostazioni della parte
      // toccata si vedono dal primo rigo anche se sopra c'era la scelta del
      // modello. Sulle strette scorre la pagina, e il pannello si sposta solo
      // se e' finito sopra.
      if (colonna && colonna.scrollHeight > colonna.clientHeight) {
        const sotto = colonna.getBoundingClientRect().top + (barraModello.current?.offsetHeight ?? 0) + 12;
        const scarto = pannello.getBoundingClientRect().top - sotto;
        if (Math.abs(scarto) > 4) colonna.scrollBy({ top: scarto, behavior: "smooth" });
      } else if (pannello.getBoundingClientRect().top < 0) {
        pannello.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 50);
  };

  const scegliDallAnteprima = (p: ParteModello, sezione?: SezioneReferto) => {
    setVista("personalizza");
    setParte(p);
    setSezioneAttiva(sezione ?? null);
    if (sezione) {
      window.setTimeout(() => {
        document.getElementById(`sezione-modello-${sezione}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 80);
      return;
    }
    // Toccata una parte del foglio, il pannello deve mostrarne l'inizio: se si
    // era scesi in fondo a un'altra scheda, le impostazioni nuove
    // comincerebbero fuori dallo schermo.
    mostraPannello();
  };

  // ── Scorciatoie ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        // Si salva gia' da solo: Ctrl+S lo fa subito, per chi ha l'abitudine.
        e.preventDefault();
        void salvaOra();
        return;
      }
      // Dentro un campo Ctrl+Z annulla le lettere, come ovunque.
      if (inUnCampo(e.target)) return;
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        annulla();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        ripeti();
      }
    };
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [annulla, ripeti, salvaOra]);

  // ── Disegno ────────────────────────────────────────────────────────────────
  const mieiModelli = archivio.modelli.filter((m) => m.documento === documento);
  const idInUso = modelloInUso(archivio, documento).id;
  const prontoInUso = prontoDi({ id: idInUso, documento });
  const bozzaInUso = bozza.id === idInUso;
  const pronto = prontoDi(bozza);
  const diCorioli = pronto !== undefined;
  const varianteAperta = pronto?.variante ?? variantePronti;
  // Lo stile pronto da cui viene l'aspetto del modello aperto, se non e' stato cambiato.
  const stileAperto = stileProntoDi(bozza);
  // Gia' tutti i documenti con questo modello pronto: niente da proporre.
  const prontoOvunque = pronto !== undefined && DOCUMENTI_STAMPA.every((d) => {
    const p = prontoDi(modelloInUso(archivio, d));
    return p?.stile.id === pronto.stile.id && p.variante === pronto.variante;
  });
  const profiloVuoto = caricato && !`${doctor?.nome ?? ""}${doctor?.cognome ?? ""}`.trim();
  const nomeDoppio = useMemo(
    () => !diCorioli && archivio.modelli.some(
      (m) => m.documento === bozza.documento && m.id !== bozza.id &&
        m.nome.trim().toLowerCase() === bozza.nome.trim().toLowerCase(),
    ),
    [archivio, bozza, diCorioli],
  );
  const fotoSoloAnteprima =
    bozza.intestazione.cartaIntestata && !bozza.intestazione.sfondoInStampa && Boolean(bozza.intestazione.sfondo);
  const nomeSezione = (id: SezioneReferto) =>
    bozza.sezioni.find((s) => s.id === id)?.titolo.trim() || titoloPredefinitoSezione(id);
  const strumenti = (z: ZonaStampa) => (
    <StrumentiZona
      zona={z}
      modello={bozza}
      onCambia={cambia}
      onAltreOpzioni={mostraPannello}
    />
  );

  /** La vista scelta a mano: la colonna riparte dall'alto. */
  const scegliVista = (v: Vista) => {
    setVista(v);
    colonnaDestra.current?.scrollTo({ top: 0 });
  };

  /** Il nome del modello con cui esce un documento, come lo dicono le pillole. */
  const nomeInUso = (d: DocumentoStampa) => {
    const m = modelloInUso(archivio, d);
    const p = prontoDi(m);
    return p ? `${p.stile.nome} ${NOMI_VARIANTE[p.variante]}` : m.nome;
  };

  // Se il modello aperto e' quello con cui esce il documento, o il pulsante
  // per farlo diventare.
  const statoUso = bozzaInUso ? (
    <span className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-amber-50 px-3 text-[15px] font-semibold text-amber-800 ring-1 ring-amber-200">
      <Star size={16} className="fill-current text-amber-500" aria-hidden />
      In uso {PER_DOCUMENTO[documento]}
    </span>
  ) : (
    <Button
      color="primary"
      startContent={<CheckCircle2 size={18} />}
      onPress={() => void usaModello(bozzaRef.current)}
      title={`Adesso ${DOCUMENTI_PLURALE[documento]} escono con «${nomeInUso(documento)}»`}
    >
      Usa {PER_DOCUMENTO[documento]}
    </Button>
  );

  return (
    <div className="corioli-page">
      <input
        ref={inputImporta}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void leggiImportazione(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {/* In cima il titolo e il documento; sotto due colonne ferme: a
          sinistra il foglio, sempre intero e sempre visibile, a destra tutto
          quello che si cambia, in una colonna che scorre da sola (Pablo, 29
          ottobre 2026: "a sinistra deve essere sempre visibile il template...
          a destra le varie modifiche"; il documento "lo lascerei in alto").

          Da `lg` la pagina e' alta quanto la finestra meno la navbar e non
          scorre: scorre solo la colonna di destra. Sulle finestre strette le
          colonne si impilano e torna a scorrere la pagina. */}
      <div className="flex flex-col gap-4 lg:-mb-5 lg:-mt-3 lg:h-[calc(100vh_-_var(--barra-finestra)_-_8.5rem)]">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 lg:shrink-0">
          <div className="min-w-0">
            <PageHeader icon={Printer} title="Modelli di stampa" />
          </div>
          {/* Il documento: la scelta che contiene tutte le altre, per questo
              in cima e scura. Le parti del documento, piu' sotto, hanno un
              contorno chiaro. */}
          <div
            className="grid w-full grid-cols-2 gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-default-200 sm:grid-cols-4 lg:w-auto lg:flex-1 xl:flex-none"
            role="tablist"
            aria-label="Documento"
          >
            {DOCUMENTI_STAMPA.map((d) => {
              const Icona = ICONE_DOCUMENTO[d];
              const scelto = d === documento;
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={scelto}
                  onClick={() => void scegliDocumento(d)}
                  title={`${DOCUMENTI_PLURALE[d].replace(/^./, (c) => c.toUpperCase())} escono con «${nomeInUso(d)}»`}
                  className={[
                    "flex min-h-[48px] min-w-0 items-center justify-center gap-2.5 rounded-xl px-3 py-2 text-base transition-colors xl:min-w-[9.5rem] xl:px-4",
                    scelto
                      ? "bg-slate-800 font-semibold text-white shadow-md"
                      : "font-medium text-default-700 hover:bg-default-100",
                  ].join(" ")}
                >
                  <Icona size={20} className="shrink-0" />
                  {/* Accanto al titolo anche fra 1024 e 1280 pixel: li' "Richiesta
                      di esame" non ci sta, e andando a capo le schede
                      toglievano una riga di altezza al foglio. */}
                  {d === "richiestaEsame" ? (
                    <>
                      <span className="truncate xl:hidden">Richiesta</span>
                      <span className="hidden truncate xl:inline">{NOMI_DOCUMENTO[d]}</span>
                    </>
                  ) : (
                    <span className="truncate">{NOMI_DOCUMENTO[d]}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_500px]">
          <section
            aria-label="Anteprima del documento"
            className="flex h-[calc(100vh_-_var(--barra-finestra)_-_8.5rem)] min-h-[520px] min-w-0 flex-col rounded-2xl bg-slate-100/90 p-3 ring-1 ring-default-200 lg:h-full lg:min-h-0"
          >
            <AnteprimaModello
              documento={anteprima}
              pagina={pagina}
              onPagina={setPagina}
              parteAttiva={parte}
              sezioneAttiva={sezioneAttiva}
              onScegli={scegliDallAnteprima}
              nomeSezione={nomeSezione}
              inAggiornamento={inAggiornamento}
              strumenti={strumenti}
              avviso={fotoSoloAnteprima
                ? "La foto della tua carta intestata si vede solo qui: in stampa esce solo il testo."
                : undefined}
              azioni={(disposizione) => {
                // Nella colonnina stretta solo icone: il nome compare passandoci sopra.
                const icone = disposizione === "icone";
                return (
                  <div className={disposizione === "sotto" ? "flex gap-2" : "flex flex-col gap-2"}>
                    <Tooltip content="Schermo intero" placement="right" isDisabled={!icone}>
                      <Button
                        isIconOnly={icone}
                        fullWidth={disposizione === "colonna"}
                        variant="flat"
                        className="bg-white shadow-sm"
                        aria-label="Schermo intero"
                        startContent={icone ? undefined : <Maximize2 size={18} />}
                        onPress={apriSchermoIntero}
                        isDisabled={!anteprima}
                      >
                        {icone ? <Maximize2 size={18} /> : "Schermo intero"}
                      </Button>
                    </Tooltip>
                    <Tooltip content="Stampa di prova" placement="right" isDisabled={!icone}>
                      <Button
                        isIconOnly={icone}
                        fullWidth={disposizione === "colonna"}
                        variant="flat"
                        color="primary"
                        aria-label="Stampa di prova"
                        startContent={icone ? undefined : <Printer size={18} />}
                        onPress={() => void stampaDiProva()}
                        isLoading={inStampa}
                        title={icone ? undefined : "Stampa il documento di prova su un foglio vero"}
                      >
                        {icone ? <Printer size={18} /> : "Stampa di prova"}
                      </Button>
                    </Tooltip>
                  </div>
                );
              }}
              // Il modo piu' comodo di lavorare, detto accanto al foglio: stava
              // in fondo al pannello, dove non lo vedeva nessuno. Breve: quando
              // sta sotto, ogni riga in piu' rimpicciolisce il foglio.
              nota={
                <p className="flex min-w-0 items-start gap-2 text-sm leading-snug">
                  <MousePointerClick size={18} className="shrink-0 text-brand-600" aria-hidden />
                  <span>
                    <span className="font-medium text-gray-800">Tocca una parte del foglio per cambiarla.</span>{" "}
                    <span className="text-default-500">La paziente è inventata; intestazione e firma sono le tue.</span>
                  </span>
                </p>
              }
            />
          </section>

          <div
            ref={colonnaDestra}
            className="corioli-scroll min-w-0 space-y-4 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pr-2"
            style={{ scrollPaddingTop: altezzaBarra + 12 }}
          >
            {profiloVuoto && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-default-50 px-4 py-3 ring-1 ring-default-200">
                <p className="text-sm text-default-700">
                  Il tuo profilo è vuoto: nell&apos;anteprima l&apos;intestazione resta quasi bianca.
                </p>
                <Button
                  variant="flat"
                  startContent={<UserRound size={18} />}
                  onPress={() => vaiImpostazioni("impostazioni-profilo")}
                >
                  Completa il profilo
                </Button>
              </div>
            )}

            {/* Il modello aperto, ferma in cima mentre si scorre: come si
                chiama, se e' quello con cui escono i documenti (e il pulsante
                per farlo diventare), Annulla, Ripeti e il salvataggio. "Usa per
                i referti" stava in fondo al riquadro dei modelli, fra Duplica
                ed Elimina, ed era la cosa piu' importante da fare dopo aver
                scelto. */}
            <div
              ref={barraModello}
              className="sticky top-[calc(var(--barra-finestra)_+_6.5rem)] z-20 space-y-3 rounded-xl border border-default-200 bg-white p-4 shadow-md lg:top-0"
            >
              {/* Bassa, perche' resta sempre davanti: nome e stato su una riga,
                  sotto la vista della colonna e, sui modelli del medico,
                  Annulla, Ripeti e salvataggio. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {pronto ? (
                  <p className="min-w-0 flex-1 truncate text-xl font-semibold text-gray-900">
                    {pronto.stile.nome} {NOMI_VARIANTE[pronto.variante]}
                  </p>
                ) : (
                  <Input
                    size="lg"
                    aria-label="Nome del modello"
                    placeholder="Per esempio: Studio di Pisa"
                    startContent={<Pencil size={18} className="shrink-0 text-default-400" aria-hidden />}
                    value={bozza.nome}
                    onValueChange={(v) => cambia((x) => { x.nome = v; }, "nome")}
                    onBlur={sistemaNome}
                    description={
                      nomeDoppio
                        ? "C'è già un modello con questo nome: uscendo dal campo gli aggiungo un numero."
                        : undefined
                    }
                    className="min-w-[12rem] flex-1"
                    classNames={{
                      input: "text-lg font-semibold",
                      description: "text-sm text-warning-700",
                    }}
                  />
                )}
                {statoUso}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[15rem] flex-1 rounded-xl bg-default-100 p-1" role="tablist" aria-label="Cosa fare">
                  {VISTE.map((v) => {
                    const scelta = vista === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="tab"
                        aria-selected={scelta}
                        onClick={() => scegliVista(v.id)}
                        className={[
                          "min-h-[40px] flex-1 rounded-lg px-3 text-[15px] font-semibold transition-colors",
                          scelta ? "bg-white text-gray-900 shadow-sm" : "text-default-600 hover:text-gray-900",
                        ].join(" ")}
                      >
                        {v.nome}
                      </button>
                    );
                  })}
                </div>
                {!diCorioli && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      isIconOnly
                      variant="flat"
                      aria-label="Annulla"
                      title="Annulla (Ctrl+Z)"
                      isDisabled={storia.current.passato.length === 0}
                      onPress={annulla}
                    >
                      <Undo2 size={20} />
                    </Button>
                    <Button
                      isIconOnly
                      variant="flat"
                      aria-label="Ripeti"
                      title="Ripeti (Ctrl+Y)"
                      isDisabled={storia.current.futuro.length === 0}
                      onPress={ripeti}
                    >
                      <Redo2 size={20} />
                    </Button>
                    <span className="ml-1 inline-flex items-center gap-1.5 text-sm font-medium" aria-live="polite">
                      {salvataggio === "errore" ? (
                        <>
                          <AlertTriangle size={16} className="text-danger" />
                          <span className="text-danger-700">Non salvato</span>
                          <Button size="sm" variant="flat" color="danger" onPress={() => void scriviModello(bozzaRef.current)}>
                            Riprova
                          </Button>
                        </>
                      ) : salvataggio === "in-corso" ? (
                        <span className="inline-flex items-center gap-1.5 text-default-500">
                          <Loader2 size={16} className="animate-spin" /> Salvo…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-default-500">
                          <CheckCircle2 size={16} className="text-brand-600" /> Salvato
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* La scelta del modello: quelli di Corioli e quelli del medico,
                e cosa si puo' fare con quello aperto. */}
            {vista === "modelli" && (
              <section className="corioli-card space-y-4 p-4" aria-label="Modelli">
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold text-default-600">Modelli pronti</span>
                    {/* Con un modello pronto aperto passa all'altra versione; con
                        uno del medico sceglie quella dei pallini e del menu sotto. */}
                    <SceltaVariante
                      valore={varianteAperta}
                      onScegli={(v) => {
                        if (pronto) {
                          if (v !== pronto.variante) apriPronto(pronto.stile, v);
                        } else {
                          setVariantePronti(v);
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {STILI_PRONTI.map((st) => (
                      <Pillola
                        key={st.id}
                        aperta={pronto?.stile.id === st.id}
                        inUso={prontoInUso?.stile.id === st.id}
                        distintivo={prontoInUso && prontoInUso.variante !== varianteAperta
                          ? `in uso ${NOMI_VARIANTE[prontoInUso.variante]}`
                          : "in uso"}
                        onClick={() => pronto?.stile.id !== st.id && apriPronto(st, varianteAperta)}
                      >
                        <span
                          className="block h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                          style={{ background: coloreCss(st[varianteAperta].colore) }}
                          aria-hidden
                        />
                        {st.nome}
                      </Pillola>
                    ))}
                  </div>
                  {!diCorioli && (
                    <Dropdown placement="bottom-start">
                      <DropdownTrigger>
                        <Button
                          variant="flat"
                          className="mt-3"
                          startContent={<Paintbrush size={18} />}
                          title="Colori, carattere e forme di un modello pronto su questo modello: testi, logo e firma restano"
                        >
                          Dai a questo modello lo stile di…
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="Stile da dare al modello aperto"
                        itemClasses={{ title: "text-base font-medium", description: "text-sm" }}
                        onAction={(k) => {
                          const st = STILI_PRONTI.find((x) => x.id === String(k));
                          if (st) applicaStilePronto(st, varianteAperta);
                        }}
                      >
                        {STILI_PRONTI.map((st) => (
                          <DropdownItem
                            key={st.id}
                            description={st.descrizione}
                            startContent={
                              <span
                                className="block h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                                style={{ background: coloreCss(st[varianteAperta].colore) }}
                                aria-hidden
                              />
                            }
                            endContent={stileAperto?.stile.id === st.id && stileAperto.variante === varianteAperta
                              ? <CheckCircle2 size={18} className="text-brand-600" aria-label="Lo stile di adesso" />
                              : null}
                          >
                            {st.nome} {NOMI_VARIANTE[varianteAperta]}
                          </DropdownItem>
                        ))}
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>

                <div className="border-t border-default-200 pt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold text-default-600">I tuoi modelli</span>
                    <div className="flex items-center gap-1">
                      <Button variant="light" startContent={<Upload size={18} />} onPress={() => inputImporta.current?.click()}>
                        Importa
                      </Button>
                      {archivio.modelli.length > 0 && (
                        <Button variant="light" startContent={<Download size={18} />} onPress={() => esporta(archivio.modelli)}>
                          Esporta tutti
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {mieiModelli.map((m) => {
                      const aperta = m.id === bozza.id;
                      return (
                        <Pillola key={m.id} aperta={aperta} inUso={m.id === idInUso} onClick={() => !aperta && void apriModello(m)}>
                          <span className="max-w-[15rem] truncate" title={m.nome}>
                            {aperta ? bozza.nome || m.nome : m.nome}
                          </span>
                        </Pillola>
                      );
                    })}
                    {/* Il modello appena nato da una modifica a uno di Corioli: si sta
                        salvando, e l'archivio lo vede mezzo secondo dopo. */}
                    {!diCorioli && !archivio.modelli.some((m) => m.id === bozza.id) && (
                      <Pillola aperta inUso={false}>
                        <span className="max-w-[15rem] truncate">{bozza.nome || "Il mio modello"}</span>
                      </Pillola>
                    )}
                    <Button
                      variant="flat"
                      size="lg"
                      startContent={<FilePlus2 size={18} />}
                      onPress={() => void nuovoModello()}
                      title="Un modello nuovo, a partire da quello di Corioli"
                    >
                      Nuovo modello
                    </Button>
                  </div>
                  {mieiModelli.length === 0 && diCorioli && (
                    <p className="mt-2 text-sm text-default-500">
                      Cambia qualcosa in un modello pronto: ne nasce uno tuo.
                    </p>
                  )}
                </div>

                {/* Quello che si fa col modello aperto, oltre a usarlo (in cima). */}
                <div className="flex flex-wrap items-center gap-2 border-t border-default-200 pt-4">
                  <span className="mr-1 text-[15px] font-semibold text-default-600">Il modello aperto</span>
                  <Button
                    variant="flat"
                    startContent={<Copy size={18} />}
                    onPress={() => void duplica()}
                    title="Una copia di questo modello, da cambiare senza toccare l'originale"
                  >
                    Duplica
                  </Button>
                  {!diCorioli && (
                    <>
                      <Button variant="flat" startContent={<Download size={18} />} onPress={() => esporta([bozza])}>
                        Esporta
                      </Button>
                      <Button
                        variant="flat"
                        color="danger"
                        startContent={<Trash2 size={18} />}
                        onPress={() => setDaEliminare(bozza)}
                      >
                        Elimina
                      </Button>
                    </>
                  )}
                </div>
                {/* Il passo dopo la scelta: senza, chi apriva un modello pronto non
                    sapeva da dove cominciare a cambiarlo. */}
                <Button
                  fullWidth
                  size="lg"
                  color="primary"
                  variant="flat"
                  endContent={<ArrowRight size={18} />}
                  onPress={() => scegliVista("personalizza")}
                >
                  {diCorioli ? "Personalizza questo modello" : "Cambia questo modello"}
                </Button>
              </section>
            )}

            {vista === "personalizza" && (
              <section
                id="pannello-modello"
                className="corioli-card scroll-mt-[calc(var(--barra-finestra)_+_15rem)] p-5 lg:scroll-mt-0"
                aria-label="Personalizza"
              >
                {diCorioli && (
                  <p className="mb-4 rounded-xl bg-brand-50/70 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-200">
                    <span className="font-semibold">È un modello pronto.</span> Cambia quello che vuoi: alla prima
                    modifica ne nasce una copia tua, che si salva da sola.
                  </p>
                )}
                <PannelloModello
                  modello={bozza}
                  onCambia={cambia}
                  parte={parte}
                  onParte={(p) => { setParte(p); setSezioneAttiva(null); }}
                  sezioneAttiva={sezioneAttiva}
                  onSezioneAttiva={setSezioneAttiva}
                  doctor={doctor}
                  spentoInImpostazioni={{
                    telefono: prefs?.showDoctorPhoneInPdf === false,
                    email: prefs?.showDoctorEmailInPdf === false,
                    firmaReferto: prefs?.firmaSulReferto === false,
                  }}
                  onErrore={(msg) => showToast(msg, "error")}
                  onVaiImpostazioni={vaiImpostazioni}
                  onApplicaATutti={diCorioli ? undefined : () => setConfermaTutti(true)}
                  onUsaPerTutti={diCorioli && !prontoOvunque ? () => void usaProntoOvunque() : undefined}
                />
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Il PDF di prova nel visualizzatore, per guardarlo da vicino. */}
      <AppModal
        isOpen={schermoIntero != null}
        onClose={chiudiSchermoIntero}
        size="full"
        classNames={{ base: MODAL_SCHERMO_INTERO }}
      >
        <ModalContent className="flex flex-col">
          <ModalHeader className="text-lg font-semibold">
            Anteprima di «{bozza.nome}»
          </ModalHeader>
          <ModalBody className="flex min-h-0 flex-1 flex-col pb-6">
            {schermoIntero && (
              <iframe
                src={schermoIntero}
                title="Anteprima del modello a schermo intero"
                className="min-h-0 w-full flex-1 rounded-lg border border-default-300 bg-white"
              />
            )}
          </ModalBody>
        </ModalContent>
      </AppModal>

      {/* Stesso aspetto per tutti i documenti: dice cosa cambia prima di farlo. */}
      <AppModal isOpen={confermaTutti} onClose={() => setConfermaTutti(false)} placement="center" backdrop="blur" size="lg">
        <ModalContent>
          <ModalHeader className="text-lg font-semibold">Stesso aspetto per tutti i documenti</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-base text-gray-700">
              {DOCUMENTI_STAMPA.filter((d) => d !== documento).map((d) => NOMI_DOCUMENTO[d]).join(", ")}{" "}
              prenderanno da «{bozza.nome}» colori, carattere, stile, intestazione con logo e carta
              intestata, firma e testo del piè di pagina.
            </p>
            <p className="text-sm text-default-600">
              Restano di ogni documento il titolo, i titoletti del testo, i dati del paziente e il formato
              del foglio. Dove si usa il modello di Corioli nasce un modello nuovo, in uso da subito.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button size="lg" variant="flat" onPress={() => setConfermaTutti(false)}>
              Annulla
            </Button>
            <Button size="lg" color="primary" startContent={<Copy size={18} />} onPress={() => void applicaATutti()}>
              Applica a tutti
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      {/* Conferma dell'importazione: cosa c'e' nel file. */}
      <AppModal isOpen={daImportare != null} onClose={() => setDaImportare(null)} placement="center" backdrop="blur" size="lg">
        <ModalContent>
          <ModalHeader className="text-lg font-semibold">Importa modelli di stampa</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-base text-gray-700">
              {daImportare?.modelli.length === 1 ? "Nel file c'è questo modello:" : "Nel file ci sono questi modelli:"}
            </p>
            <ul className="space-y-2">
              {daImportare?.modelli.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-xl border border-default-200 px-4 py-3">
                  <span className="text-base font-semibold text-gray-900">{m.nome}</span>
                  <span className="text-sm text-default-600">{NOMI_DOCUMENTO[m.documento]}</span>
                </li>
              ))}
            </ul>
            {daImportare && daImportare.scartati > 0 && (
              <p className="text-sm text-warning-700">
                {daImportare.scartati === 1
                  ? "Un modello del file non è leggibile e resta fuori."
                  : `${daImportare.scartati} modelli del file non sono leggibili e restano fuori.`}
              </p>
            )}
            <p className="text-sm text-default-600">
              Si aggiungono ai tuoi senza sostituire niente. Intestazione e firma resteranno
              le tue: il file porta solo l&apos;impaginazione, il logo e le righe scritte da chi l&apos;ha fatto.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button size="lg" variant="flat" onPress={() => setDaImportare(null)}>
              Annulla
            </Button>
            <Button size="lg" color="primary" startContent={<Upload size={18} />} onPress={() => void confermaImportazione()}>
              Importa
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <ConfirmDangerModal
        isOpen={daEliminare != null}
        onClose={() => setDaEliminare(null)}
        title={`Eliminare «${daEliminare?.nome ?? ""}»?`}
        confirmLabel="Elimina modello"
        onConfirm={() => daEliminare && void elimina(daEliminare)}
      >
        <p className="text-base text-gray-700">
          {daEliminare && archivio.inUso[daEliminare.documento] === daEliminare.id
            ? `È il modello in uso: da adesso ${DOCUMENTI_PLURALE[daEliminare.documento]} usciranno con «${ripiegoDopoEliminazione(archivio, daEliminare.documento).nome}».`
            : "I documenti già stampati non cambiano."}
          {" "}Se pensi di riusarlo, esportalo prima.
        </p>
      </ConfirmDangerModal>
    </div>
  );
}
