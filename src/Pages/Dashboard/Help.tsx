import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Accordion,
  AccordionItem,
  Input,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Avatar,
  Tooltip,
  useDisclosure,
} from "@nextui-org/react";
import {
  HelpCircle,
  Send,
  LifeBuoy,
  Search,
  Paperclip,
  FileText,
  RefreshCw,
} from "lucide-react";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import { PageHeader } from "../../components/PageHeader";
import { VoiceMessagePlayer } from "../../components/chat/VoiceMessagePlayer";
import { DoctorService } from "../../services/OfflineServices";
import axios from "axios";
import {
  fetchSupportMessages,
  sendSupportMessage,
  deleteSupportConversation,
  mapToUiMessage,
  type SupportChatMessageDto,
} from "../../services/SupportChatService";
import type { Doctor } from "../../types/Storage";

const CHAT_POLL_MS = 8000;
const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 25;

type AttachmentType = "audio" | "file";

interface ChatAttachment {
  type: AttachmentType;
  name: string;
  url: string;
  mimeType: string;
  size?: number;
  durationSec?: number;
  waveform?: number[];
  file?: File;
}

interface ChatMessage {
  id: string;
  role: "user" | "operator";
  text?: string;
  attachments?: ChatAttachment[];
  time: string;
  createdAt?: string;
}

const ACCEPTED_FILES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime";

/** Schema: dove finisce ogni categoria di modello. */
function ModelliMapSchema() {
  const rows = [
    { cat: "Visita", dest: "Campi del referto di visita", hot: false },
    { cat: "Terapie", dest: "Visita → “Conclusioni e terapia” (testo discorsivo)", hot: true },
    { cat: "Ricette", dest: "Nuova ricetta → testo libero", hot: true },
    { cat: "Esami", dest: "Nuova richiesta esame", hot: false },
    { cat: "Certificati", dest: "Nuovo certificato", hot: false },
  ];
  return (
    <div className="my-2 rounded-xl border border-default-200 bg-default-50/60 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-default-500">
        Dove finisce ogni modello
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.cat} className="flex items-center gap-2">
            <span
              className={`inline-flex min-w-[96px] justify-center rounded-md px-2 py-1 text-xs font-semibold ${
                r.hot ? "bg-primary-100 text-primary-700" : "bg-default-100 text-default-600"
              }`}
            >
              {r.cat}
            </span>
            <span className="text-default-500" aria-hidden>→</span>
            <span className="text-xs leading-snug text-default-700">{r.dest}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Schema: differenza Terapie (discorsivo) vs Ricette (elenco). */
function TerapieVsRicetteSchema() {
  return (
    <div className="my-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-default-200 bg-default-50/60 p-3">
        <p className="text-sm font-semibold text-gray-900">Terapie</p>
        <p className="mt-0.5 text-[11px] text-default-500">Visita · Conclusioni e terapia</p>
        <div className="mt-2 rounded-md border border-default-200 bg-white p-2 text-[11px] leading-relaxed text-default-700">
          Si consiglia di proseguire i controlli di routine e mantenere uno stile di vita sano…
        </div>
        <p className="mt-2 text-[11px] text-default-500">
          Testo <strong>discorsivo</strong>, a frasi intere.
        </p>
      </div>
      <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-3">
        <p className="text-sm font-semibold text-gray-900">Ricette</p>
        <p className="mt-0.5 text-[11px] text-default-500">Nuova ricetta · testo libero</p>
        <div className="mt-2 space-y-0.5 rounded-md border border-default-200 bg-white p-2 text-[11px] leading-relaxed text-default-700">
          <div>Tachipirina 1000 mg: 1 cp 2 volte/die</div>
          <div>Augmentin 1 g: 1 cp ogni 12 h per 6 giorni</div>
          <div>Assumere a stomaco pieno.</div>
        </div>
        <p className="mt-2 text-[11px] text-default-500">
          <strong>Un unico testo libero</strong>: farmaci e indicazioni insieme.
        </p>
      </div>
    </div>
  );
}

/** Schema: passi per creare un modello. */
function CreaModelloSteps() {
  const steps = [
    "Impostazioni → Gestione Modelli",
    "Nuovo modello",
    "Scegli categoria (Tipo)",
    "Nome menu + contenuto",
    "Salva",
  ];
  return (
    <div className="my-2 flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="rounded-md bg-default-100 px-2 py-1 text-xs text-default-700">
            {i + 1}. {s}
          </span>
          {i < steps.length - 1 && (
            <span className="text-default-500" aria-hidden>→</span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function HelpAndFeedback() {
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatError, setChatError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [endingChat, setEndingChat] = useState(false);
  const {
    isOpen: isEndChatModalOpen,
    onOpen: onEndChatModalOpen,
    onClose: onEndChatModalClose,
  } = useDisclosure();
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(["Gestione Pazienti"]),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const scrollToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSubmitting, pendingAttachments, scrollToBottom]);

  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => URL.revokeObjectURL(a.url));
      messages.forEach((m) => m.attachments?.forEach((a) => URL.revokeObjectURL(a.url)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const d = await DoctorService.getDoctor();
        if (cancelled) return;
        if (!d) {
          setChatError("Profilo medico non configurato. Completa la registrazione.");
          setChatLoading(false);
          return;
        }
        setDoctor(d);
        const { messages: remote, conversationId: convId } = await fetchSupportMessages(d.id);
        if (!cancelled) {
          setConversationId(convId);
          setMessages(remote.map(mapToUiMessage));
          setChatError(null);
        }
      } catch {
        if (!cancelled) {
          setChatError("Impossibile caricare la chat. Verifica la connessione al server.");
        }
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!doctor) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const prev = messagesRef.current;
        const since = prev.length > 0 ? prev[prev.length - 1].createdAt : undefined;
        const { messages: remote, conversationId: convId } = await fetchSupportMessages(
          doctor.id,
          since,
          false,
        );
        if (cancelled) return;
        if (convId) setConversationId(convId);
        if (remote.length === 0) return;
        setMessages((current) => {
          const ids = new Set(current.map((m) => m.id));
          const mapped = remote.map(mapToUiMessage);
          const added = mapped.filter((m) => !ids.has(m.id));
          return added.length ? [...current, ...added] : current;
        });
        setChatError(null);
      } catch {
        // polling silenzioso
      }
    };

    const interval = setInterval(poll, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [doctor]);

  const sendUserMessage = useCallback(
    async (text?: string, attachments?: ChatAttachment[]) => {
      const hasText = Boolean(text?.trim());
      const files = (attachments ?? []).filter((a) => a.file);
      if (!hasText && files.length === 0) return;

      if (!doctor) {
        setChatError("Profilo medico non disponibile.");
        return;
      }

      setIsSubmitting(true);
      setChatError(null);
      try {
        const sentMessages: SupportChatMessageDto[] = [];
        let newConvId: string | null = conversationId;
        if (hasText) {
          const res = await sendSupportMessage(doctor.id, { text: text!.trim() });
          sentMessages.push(res.message);
          newConvId = res.conversationId;
        }
        for (const att of files) {
          if (att.file) {
            const res = await sendSupportMessage(doctor.id, { file: att.file });
            sentMessages.push(res.message);
            newConvId = res.conversationId;
          }
        }
        if (newConvId) setConversationId(newConvId);
        setMessages((prev) => [...prev, ...sentMessages.map(mapToUiMessage)]);
        setInputValue("");
        setPendingAttachments([]);
      } catch (e) {
        const msg = axios.isAxiosError(e)
          ? (e.response?.data as { error?: string })?.error
          : null;
        setChatError(msg || "Invio non riuscito. Riprova tra poco.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [doctor, conversationId],
  );

  const confirmEndChat = useCallback(async () => {
    if (!doctor || !conversationId || endingChat) return;

    setEndingChat(true);
    setChatError(null);
    try {
      await deleteSupportConversation(doctor.id);
      setConversationId(null);
      setMessages([]);
      setInputValue("");
      setPendingAttachments([]);
      onEndChatModalClose();
    } catch {
      setChatError("Impossibile terminare la chat. Riprova.");
    } finally {
      setEndingChat(false);
    }
  }, [doctor, conversationId, endingChat, onEndChatModalClose]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    void sendUserMessage(
      inputValue,
      pendingAttachments.length ? pendingAttachments : undefined,
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const newAttachments: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) {
        alert(`"${file.name}" non è supportato. Usa immagini o video.`);
        continue;
      }
      const maxMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
      if (file.size > maxMb * 1024 * 1024) {
        alert(`"${file.name}" supera ${maxMb} MB.`);
        continue;
      }
      newAttachments.push({
        type: "file",
        name: file.name,
        url: URL.createObjectURL(file),
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        file,
      });
    }

    if (newAttachments.length) {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    }
    e.target.value = "";
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
  };

  const faqGroups: {
    category: string;
    topicId?: string;
    items: { id?: string; title: string; content: string; node?: React.ReactNode }[];
  }[] = [
    {
      category: "Modelli Referti",
      topicId: "modelli-referti",
      items: [
        {
          id: "modelli-referti-cosa",
          title: "Cosa sono i modelli?",
          content:
            "I modelli sono testi pronti da inserire con un clic, così non riscrivi ogni volta le stesse frasi. Ogni modello appartiene a una categoria, che decide dove comparirà.",
          node: <ModelliMapSchema />,
        },
        {
          id: "modelli-referti-uso",
          title: "Come si usano?",
          content:
            "Clicca il pulsante Modello accanto al campo e scegli il testo.\n\n• Visite → pulsante Modello (in ogni campo)\n• Ricette → Modelli Ricetta (modal Nuova ricetta)\n• Esami → Modelli Esame (scheda paziente)\n• Certificati → Modelli Certificato\n\nDopo l'inserimento puoi sempre modificare il testo.",
        },
        {
          id: "modelli-referti-terapie-ricette",
          title: "Che differenza c'è tra Terapie e Ricette?",
          content:
            "Terapie = testo discorsivo che finisce nella sezione Conclusioni e Terapie della visita. Ricette = testo libero che compila la ricetta (farmaci, posologie e indicazioni insieme). Sono due categorie separate.",
          node: <TerapieVsRicetteSchema />,
        },
        {
          id: "modelli-referti-gestione",
          title: "Come se ne crea uno?",
          content:
            "Impostazioni → Gestione Modelli Referti → Nuovo modello.\n\nScegli la categoria giusta (scheda Tipo): è lei a decidere dove comparirà il modello. Dai un nome breve per il menu e scrivi il contenuto.\n\nMatita = modifica · Cestino = elimina.",
          node: <CreaModelloSteps />,
        },
        {
          id: "modelli-referti-ricetta-formato",
          title: "Come scrivo un modello di Ricetta?",
          content:
            "Scrivi l'intera ricetta in testo libero: farmaci, posologie, durata e indicazioni, come preferisci (es. Tachipirina 1000 mg: 1 cp 2 volte/die per 5 giorni; assumere a stomaco pieno). Quando selezioni il modello nella Nuova ricetta, il testo compare già compilato e puoi modificarlo.",
        },
      ],
    },
    {
      category: "Gestione Pazienti",
      items: [
        {
          title: "Come aggiungo un nuovo paziente?",
          content:
            "Dalla Dashboard o da «Pazienti» premi «Nuovo paziente» (oppure Ctrl+P). Basta il cognome o il codice fiscale: con un CF valido data e luogo di nascita e sesso si compilano da soli. «Salva e inizia visita» apre subito la visita del paziente appena registrato; «Salva» apre la sua scheda. Se cerchi un paziente che non c'è, dal pannello di ricerca premi Invio: si apre il form con il cognome già scritto.",
        },
        {
          title: "Come posso cercare un paziente?",
          content:
            "Da qualunque pagina premi Ctrl+K (⌘K sul Mac) o «Cerca paziente» nella barra in alto: scrivi il cognome, il nome o il codice fiscale, anche solo in parte e senza accenti. Con le frecce scegli, con Invio apri la scheda. Ctrl+N apre lo stesso pannello per una nuova visita: Invio apre direttamente la maschera della visita.",
        },
        {
          title: "Cosa significa l'asterisco rosso (*) accanto al Codice Fiscale?",
          content:
            "Indica che il Codice Fiscale è stato generato automaticamente (presunto) e non verificato. Si consiglia di controllarlo con la tessera sanitaria del paziente e correggerlo se necessario modificando l'anagrafica.",
        },
        {
          title: "Come modifico o elimino un paziente?",
          content:
            "Dall'elenco dei pazienti, clicca sulla riga del paziente per aprire la sua scheda. Usa il pulsante «Modifica» (icona matita) in alto a destra per cambiare i dati. Per eliminare, usa il pulsante «Elimina» (icona cestino) nel modal di modifica. Attenzione: l'eliminazione cancella anche tutte le visite associate.",
        },
      ],
    },
    {
      category: "Visite e Referti",
      items: [
        {
          title: "Come creo una nuova visita?",
          content:
            "Dalla scheda del paziente o dall'elenco premi «Nuova visita», oppure Ctrl+N e cerca il paziente. Mentre scrivi, Ctrl+S salva senza uscire e Ctrl+P stampa, e se l'app si chiude prima del salvataggio alla riapertura della visita ti viene proposta la bozza. Il referto è diviso in sezioni: Anamnesi, Motivo della visita, Terapia in atto (riportata dall'ultima visita, da rileggere), Esame obiettivo, elettrocardiogramma, Accertamenti e Conclusioni con terapia. Ecocardiogramma, TC coronarica, test ergometrico, Holter ECG e pressorio, Doppler TSA, scompenso e fibrillazione atriale sono moduli facoltativi: si accendono uno per uno da Impostazioni, nella card «Moduli della visita», e nella visita si aggiungono al referto con i pulsanti «+» sotto l'elettrocardiogramma. Nella colonna di sinistra registri le variabili cliniche (pressione arteriosa, frequenza cardiaca, peso con calcolo del BMI) e alleghi eventuali immagini. Gli esami del sangue si scrivono con «Inserisci esami»: una finestra fatta come il foglio del laboratorio, con il valore di oggi accanto al precedente, dove Invio passa al valore successivo; nella colonna resta il riepilogo. Se un numero sembra scritto in un'altra unità (la creatinina in µmol/L, l'HbA1c in mmol/mol) il campo lo segnala e propone la conversione. «Copia visita precedente» porta i testi, non gli esami: i valori di allora restano visibili come precedenti. Terapia in atto e fattori di rischio riportati dall'ultima visita restano segnalati finché non li rileggi, e prima di stampare l'app elenca quello che merita un secondo sguardo (unità sospette, esami senza data, terapia non riletta): puoi correggere o stampare comunque.",
        },
        {
          title: "Posso evidenziare una parte del referto?",
          content:
            "Sì. In tutti i campi di testo del referto, seleziona quello che vuoi far risaltare e premi Ctrl+B (Cmd+B sul Mac), oppure fai clic con il tasto destro e scegli «Grassetto». Il testo diventa grassetto nel campo, come lo vedrai nel referto stampato. Premi di nuovo Ctrl+B sullo stesso testo per toglierlo.",
        },
        {
          title: "Come funziona il calcolo del BMI?",
          content:
            "Inserisci il peso corporeo nella colonna Variabili cliniche della visita: se la scheda del paziente contiene l'altezza, il BMI viene calcolato e mostrato accanto al peso e riportato nel referto. Se l'altezza manca, puoi inserirla direttamente dalla visita e viene salvata in anagrafica.",
        },
        {
          title: "Come stampo o salvo il referto in PDF?",
          content:
            "Dalla schermata di compilazione visita o dallo storico, clicca su «Stampa». Verrà generato un PDF professionale con l'intestazione del medico, i dati del paziente e il referto completo, pronto per essere stampato o salvato.",
        },
      ],
    },
    {
      category: "Esami e Documenti",
      items: [
        {
          title: "Come prescrivo esami complementari?",
          content:
            "Dalla scheda paziente, nella colonna di destra «Esami», clicca su «Nuovo Esame». Puoi scegliere un esame dalla lista dei modelli (es. elettrocardiogramma, esami ematochimici) o scriverne uno nuovo. Anche qui puoi generare un PDF di richiesta/prescrizione.",
        },
        {
          title: "Posso allegare file esterni?",
          content:
            "Attualmente il sistema gestisce i documenti generati internamente. In futuro sarà possibile allegare referti esterni (PDF/Immagini) alla scheda paziente.",
        },
      ],
    },
    {
      category: "Impostazioni e Dati",
      items: [
        {
          title: "Come modifico l'intestazione dei referti?",
          content:
            "Vai su «Impostazioni > Ambulatori». Qui puoi inserire i tuoi dati (Nome, Specializzazione) e aggiungere uno o più ambulatori (Indirizzo, Città, Contatti). L'ambulatorio impostato come «Primario» apparirà nell'intestazione dei PDF.",
        },
        {
          title: "I miei dati sono al sicuro? Dove vengono salvati?",
          content:
            "Corioli Cardiologia è progettato Local First: cartella clinica, visite e documenti restano sul tuo computer in un database locale (proteggi il dispositivo con password di sistema e backup sicuri). Per licenze, assistenza e aggiornamenti l'app comunica in modo limitato con i server Corioli (dati del medico e statistiche aggregate, mai l'intera cartella clinica). La decodifica del codice fiscale avviene interamente in locale sul tuo dispositivo. Per richieste privacy scrivi a privacy@corioli.it o consulta l'informativa sul sito corioli.it.",
        },
        {
          title: "Come faccio il backup dei dati?",
          content:
            "Vai su «Impostazioni > Backup e Dati». Clicca su «Esporta Backup» per scaricare un file unico (.json) contenente tutti i pazienti, visite e impostazioni. Puoi usare questo file per ripristinare i dati su un altro computer o per sicurezza.",
        },
      ],
    },
    {
      category: "Altro",
      items: [
        {
          title: "Quali scorciatoie da tastiera posso usare?",
          content:
            "Ctrl+N (o Cmd+N): Nuova Visita rapida. Ctrl+P (o Cmd+P): Nuovo Paziente. Esc: Chiudi finestre modali. Invio: Conferma/Salva nei form (dove supportato).",
        },
        {
          title: "Come installare l'aggiornamento?",
          content:
            "Su Windows, gli aggiornamenti arrivano dal Microsoft Store (Libreria → aggiornamenti per Corioli Cardiologia, oppure in automatico). Prima di reinstallare o aggiornare, esegui sempre un backup da Impostazioni → Backup e dati.",
        },
        {
          title: "PIN, profilo, biometria e recupero",
          content:
            "Alla prima configurazione (o dopo un aggiornamento) Corioli Cardiologia chiede i dati del profilo medico (nome, cognome, email, telefono, specializzazione) e un PIN. L'uso quotidiano funziona senza internet. Se dimentichi il PIN puoi usare il codice CORI-… salvato alla configurazione oppure, con connessione, il recupero via email all'indirizzo del profilo. Il riconoscimento biometrico (impronta o volto) è opzionale in Impostazioni → Sicurezza.",
        },
      ],
    },
  ];

  const filteredFaqGroups = faqGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.content.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    if (searchQuery.trim()) {
      setOpenCategories(new Set(filteredFaqGroups.map((g) => g.category)));
    }
  }, [searchQuery, filteredFaqGroups.length]);

  useEffect(() => {
    const topic = searchParams.get("topic");
    if (!topic) return;

    const group = faqGroups.find((g) => g.topicId === topic);
    if (!group) return;

    setOpenCategories((prev) => new Set([...prev, group.category]));

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`faq-topic-${topic}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);

    return () => window.clearTimeout(scrollTimer);
  }, [searchParams]);

  const renderAttachment = (att: ChatAttachment, isUser: boolean) => {
    if (att.type === "audio") {
      return (
        <div className="mt-0.5">
          <VoiceMessagePlayer
            url={att.url}
            waveform={att.waveform}
            durationSec={att.durationSec}
            isUser={isUser}
          />
        </div>
      );
    }

    const isImage = att.mimeType.startsWith("image/");
    const isVideo = att.mimeType.startsWith("video/");

    return (
      <div className="mt-1">
        {isImage ? (
          <a href={att.url} target="_blank" rel="noopener noreferrer">
            <img
              src={att.url}
              alt={att.name}
              className="max-w-[200px] max-h-[140px] rounded-lg object-cover border border-white/20"
            />
          </a>
        ) : isVideo ? (
          <video
            src={att.url}
            controls
            className="max-w-[260px] max-h-[180px] rounded-lg border border-white/20 bg-black/80"
          />
        ) : (
          <a
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              isUser ? "bg-white/15 hover:bg-white/25" : "bg-gray-50 hover:bg-gray-100 border border-gray-100"
            }`}
          >
            <FileText size={16} className="flex-shrink-0" />
            <span className="truncate max-w-[160px] font-medium">{att.name}</span>
          </a>
        )}
      </div>
    );
  };

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === "user";
    const hasContent = msg.text || msg.attachments?.length;

    if (!hasContent) return null;

    return (
      <div
        key={msg.id}
        className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
      >
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
            isUser
              ? "bg-brand-800 text-white rounded-tr-sm"
              : "bg-white border border-gray-100 text-gray-700 rounded-tl-sm"
          }`}
        >
          {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
          {msg.attachments?.map((att, i) => (
            <div key={`${msg.id}-att-${i}`}>{renderAttachment(att, isUser)}</div>
          ))}
        </div>
        <span className="text-[11px] text-gray-500 mt-1 px-1">{msg.time}</span>
      </div>
    );
  };

  const canSend =
    !isSubmitting &&
    !chatLoading &&
    Boolean(doctor) &&
    (Boolean(inputValue.trim()) || pendingAttachments.length > 0);

  return (
    <div className="corioli-page space-y-6 animate-in fade-in duration-500 flex flex-col min-h-0">
      <PageHeader
        title="Aiuto"
        actions={
          // Era un pulsante fisso nella navbar. Dopo un import di backup l'app
          // si ricarica da sola: qui resta come rimedio quando qualcosa non si
          // aggiorna.
          <Button
            variant="light"
            size="sm"
            startContent={<RefreshCw size={14} />}
            onPress={() => window.location.reload()}
            className="text-default-600"
          >
            Ricarica l'app
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 lg:h-[calc(100vh_-_220px_-_var(--barra-finestra))] lg:max-h-[720px]">
        {/* FAQ — scroll interno, non influenza l'altezza della chat */}
        <div className="flex flex-col min-h-0 h-[420px] lg:h-full">
          <Card className="shadow-md flex flex-col h-full min-h-0 overflow-hidden">
            <CardHeader className="flex gap-3 px-6 pt-6 shrink-0">
              <HelpCircle className="w-6 h-6 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <p className="text-md font-bold">Domande frequenti</p>
                <p className="text-small text-default-500">Risposte immediate ai dubbi più comuni</p>
              </div>
            </CardHeader>
            <div className="px-6 pb-4 shrink-0">
              <Input
                placeholder="Cerca nelle FAQ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startContent={<Search size={18} className="text-default-500" />}
                variant="flat"
                radius="lg"
                classNames={{
                  inputWrapper: "bg-default-100 hover:bg-default-200 transition-colors",
                }}
              />
            </div>
            <Divider />
            <CardBody className="px-4 py-2 flex-1 min-h-0 overflow-y-auto">
              {filteredFaqGroups.length > 0 ? (
                <Accordion
                  selectionMode="multiple"
                  variant="splitted"
                  className="px-0"
                  selectedKeys={openCategories}
                  onSelectionChange={(keys) => {
                    if (keys === "all") {
                      setOpenCategories(new Set(filteredFaqGroups.map((g) => g.category)));
                      return;
                    }
                    setOpenCategories(new Set(Array.from(keys).map(String)));
                  }}
                >
                  {filteredFaqGroups.map((group) => (
                    <AccordionItem
                      key={group.category}
                      id={"topicId" in group && group.topicId ? `faq-topic-${group.topicId}` : undefined}
                      aria-label={group.category}
                      title={
                        <div className="flex items-center justify-between w-full pr-2 gap-2">
                          <span className="text-xs font-bold text-primary uppercase tracking-wider">
                            {group.category}
                          </span>
                          <span className="text-[11px] font-medium text-default-500 normal-case tracking-normal shrink-0">
                            {group.items.length}{" "}
                            {group.items.length === 1 ? "domanda" : "domande"}
                          </span>
                        </div>
                      }
                      classNames={{
                        base: "border border-default-200 shadow-sm mb-2",
                        title: "text-sm",
                        trigger: "py-3 px-4",
                        content: "px-2 pb-3",
                        // Chiuso punta a destra, aperto in basso: il chevron di
                        // NextUI chiuso puntava a sinistra, verso il titolo.
                        indicator: "rotate-180",
                      }}
                    >
                      <Accordion selectionMode="multiple" variant="light" className="px-0">
                        {group.items.map((item, index) => (
                          <AccordionItem
                            key={"id" in item && item.id ? item.id : `${group.category}-${index}`}
                            aria-label={item.title}
                            title={
                              <span className="font-medium text-gray-700 text-sm">{item.title}</span>
                            }
                            classNames={{ title: "text-sm", content: "text-sm text-gray-600 px-2", indicator: "rotate-180" }}
                          >
                            <p className="pb-2 pl-1 whitespace-pre-line leading-relaxed">{item.content}</p>
                            {"node" in item && item.node ? item.node : null}
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="py-12 text-center flex flex-col items-center justify-center animate-in fade-in">
                  <Search className="w-12 h-12 text-default-200 mb-4" />
                  <p className="text-default-600 font-medium">Nessun risultato trovato</p>
                  <p className="text-default-500 text-sm mt-1">
                    Nessuna risposta per &quot;{searchQuery}&quot;
                  </p>
                  <Button variant="light" color="primary" className="mt-4" onPress={() => setSearchQuery("")}>
                    Mostra tutte le domande
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Chat — altezza fissa, scroll solo nell'area messaggi */}
        <div className="flex flex-col min-h-0 h-[480px] lg:h-full">
          <Card className="shadow-md flex flex-col h-full min-h-0 overflow-hidden">
            <CardHeader className="flex gap-3 px-6 py-4 bg-gray-50/50 shrink-0">
              <Avatar
                icon={<LifeBuoy className="w-5 h-5 text-brand-700" />}
                classNames={{ base: "bg-brand-100 shrink-0" }}
              />
              <div className="flex flex-col min-w-0">
                <p className="text-md font-bold text-gray-800">Chat con l'assistenza</p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      chatError ? "bg-warning-500" : "corioli-indicator-active"
                    }`}
                  />
                  <p className="text-xs text-default-500 font-medium">
                    {chatLoading ? "Connessione…" : chatError ? "Problema connessione" : "Assistenza attiva"}
                  </p>
                </div>
              </div>
              {conversationId && (
                <Tooltip content="Elimina chat e tutti i messaggi">
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    isLoading={endingChat}
                    isDisabled={isSubmitting || endingChat}
                    onPress={onEndChatModalOpen}
                  >
                    Termina chat
                  </Button>
                </Tooltip>
              )}
            </CardHeader>
            <Divider />
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-950 leading-relaxed shrink-0">
              <strong>Policy chat:</strong> usa questa chat solo per assistenza tecnica e licenze.
              Non inviare dati identificativi di pazienti, referti clinici, immagini diagnostiche o
              documentazione sanitaria negli allegati.
            </div>

            <CardBody className="p-0 flex flex-col flex-1 min-h-0 overflow-hidden bg-gray-50/30">
              <div
                ref={messagesScrollRef}
                className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4"
              >
                {chatLoading && (
                  <p className="text-center text-sm text-default-500 py-8">Caricamento chat…</p>
                )}
                {!chatLoading && chatError && (
                  <p className="text-center text-sm text-warning-600 py-2 px-2">{chatError}</p>
                )}
                {!chatLoading && messages.length === 0 && !chatError && (
                  <div className="flex flex-1 flex-col items-center justify-center text-center px-4">
                    <LifeBuoy className="w-10 h-10 text-default-300 mb-3" />
                    <p className="text-sm font-medium text-default-600">Nessun messaggio ancora</p>
                    <p className="text-xs text-default-500 mt-1 max-w-[260px]">
                      Scrivi per primo per contattare il team assistenza Corioli.
                    </p>
                  </div>
                )}
                {!chatLoading && messages.map(renderMessage)}
                {isSubmitting && (
                  <div className="flex items-start animate-in fade-in">
                    <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1.5 items-center">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="shrink-0 p-3 bg-white border-t border-gray-100">
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-gray-100">
                    {pendingAttachments.map((att, i) => (
                      <div
                        key={`pending-${i}`}
                        className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs max-w-full"
                      >
                        {att.mimeType.startsWith("image/") ? (
                          <img src={att.url} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <FileText size={14} className="text-gray-500 shrink-0" />
                        )}
                        <span className="truncate max-w-[120px]">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(i)}
                          className="text-gray-500 hover:text-danger ml-1"
                          aria-label="Rimuovi allegato"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex gap-1.5 items-end">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_FILES}
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  <Tooltip content="Allega immagine o video">
                        <Button
                          isIconOnly
                          type="button"
                          variant="flat"
                          radius="lg"
                          className="flex-shrink-0 text-default-500"
                          isDisabled={isSubmitting}
                          onPress={() => fileInputRef.current?.click()}
                        >
                          <Paperclip size={18} />
                        </Button>
                      </Tooltip>

                      <Input
                        placeholder="Scrivi un messaggio..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        variant="flat"
                        radius="lg"
                        className="flex-1 min-w-0"
                        classNames={{
                          input: "text-sm",
                          inputWrapper:
                            "bg-gray-100 hover:bg-gray-200/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/30 transition-all",
                        }}
                        disabled={isSubmitting}
                      />

                  <Button
                    isIconOnly
                    type="submit"
                    color="primary"
                    radius="lg"
                    isDisabled={!canSend}
                    className="flex-shrink-0 corioli-cta"
                  >
                    <Send size={18} className="ml-0.5" />
                  </Button>
                </form>
                <p className="text-[11px] text-center text-gray-500 mt-2">
                  Immagini fino a {MAX_IMAGE_MB} MB · video fino a {MAX_VIDEO_MB} MB
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDangerModal
        isOpen={isEndChatModalOpen}
        onClose={onEndChatModalClose}
        title="Termina chat"
        confirmLabel="Termina chat"
        onConfirm={() => void confirmEndChat()}
        isLoading={endingChat}
      >
        <p className="text-sm text-default-600">
          Tutti i messaggi e gli allegati verranno eliminati definitivamente. Sei sicuro di voler
          terminare la conversazione con l&apos;assistenza?
        </p>
      </ConfirmDangerModal>
    </div>
  );
}
