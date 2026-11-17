import { useEffect, useState } from "react";
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@nextui-org/react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { AppModal } from "../AppModal";
import {
  apriGestioneAbbonamento,
  dataConArticolo,
  scadenzaInArrivo,
  type StatoAbbonamento,
} from "../../services/AbbonamentoService";
import { archivioDiProvaAperto } from "../../services/StorageServiceFallback";
import { DoctorService } from "../../services/OfflineServices";
import { useToast } from "../../contexts/ToastContext";

const CHIAVE = "corioli_avviso_fine_prova";
/** Giorni rimasti a cui si avvisa: una volta sola per ciascuna soglia. */
const SOGLIE = [7, 3, 1] as const;
const RITARDO_MS = 1_500;

function sogliaDi(giorni: number): number | null {
  // La soglia più piccola raggiunta: a 2 giorni vale quella dei 3.
  const raggiunte = SOGLIE.filter((s) => giorni <= s);
  return raggiunte.length ? Math.min(...raggiunte) : null;
}

function leggiUltimo(): string | null {
  try {
    return localStorage.getItem(CHIAVE);
  } catch {
    return null;
  }
}

function salvaUltimo(valore: string) {
  try {
    localStorage.setItem(CHIAVE, valore);
  } catch {
    // senza storage l'avviso può ripresentarsi: meglio che perderlo
  }
}

const PUNTI = {
  prova: [
    "I tuoi pazienti e le tue visite restano dove sono: non perdi niente.",
    "Se non ti abboni, dopo la prova puoi comunque consultare, stampare ed esportare tutto.",
    "Disdici quando vuoi, senza vincoli.",
  ],
  abbonamento: [
    "I tuoi pazienti e le tue visite restano dove sono: non perdi niente.",
    "Se non lo riattivi, dopo puoi comunque consultare, stampare ed esportare tutto.",
    "Riattivandolo prima della fine non paghi nulla in più: riprende il rinnovo mensile.",
  ],
};

/**
 * Finestra che avvisa che la prova gratuita, o un abbonamento disdetto, sta
 * per finire: a 7, 3 e 1 giorno dalla fine.
 */
export default function AvvisoFineProva({
  stato,
  bloccato,
  onAbbonati,
}: {
  stato: StatoAbbonamento;
  /** Un'altra finestra dell'abbonamento è già aperta. */
  bloccato: boolean;
  onAbbonati: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const { showToast } = useToast();

  const scadenza = scadenzaInArrivo(stato);
  const soglia = scadenza ? sogliaDi(scadenza.giorni) : null;
  const chiave =
    scadenza && soglia !== null
      ? `${scadenza.tipo}|${scadenza.fine.toISOString().slice(0, 10)}|${soglia}`
      : null;

  useEffect(() => {
    if (!chiave || bloccato || archivioDiProvaAperto() || leggiUltimo() === chiave) return;
    // Lascia prima comparire la pagina, poi l'avviso.
    const timer = window.setTimeout(() => setAperto(true), RITARDO_MS);
    return () => window.clearTimeout(timer);
  }, [chiave, bloccato]);

  if (!aperto || !scadenza || !chiave) return null;

  const chiudi = () => {
    salvaUltimo(chiave);
    setAperto(false);
  };

  const riattiva = async () => {
    chiudi();
    const doctor = await DoctorService.getDoctor();
    const esito = doctor?.id ? await apriGestioneAbbonamento(doctor.id) : null;
    if (esito && !esito.ok) showToast(esito.errore, "error");
  };

  const cosa = scadenza.tipo === "prova" ? "La prova gratuita" : "Il tuo abbonamento";
  const quando =
    scadenza.giorni === 1
      ? "finisce domani"
      : `finisce tra ${scadenza.giorni} giorni, ${dataConArticolo(scadenza.fine)}`;
  const testo =
    scadenza.tipo === "prova"
      ? "Per continuare a usare Corioli senza interruzioni puoi abbonarti già adesso: non paghi nulla fino alla fine della prova."
      : "Hai disdetto l'abbonamento. Se vuoi continuare a usare Corioli senza interruzioni, riattivalo dal portale di pagamento.";

  return (
    <AppModal isOpen onClose={chiudi} placement="center" backdrop="blur" size="md">
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
              scadenza.giorni <= 1
                ? "bg-rose-50 text-rose-700 ring-rose-200"
                : scadenza.giorni <= 3
                  ? "bg-amber-50 text-amber-700 ring-amber-200"
                  : "bg-brand-50 text-brand-700 ring-brand-100"
            }`}
          >
            <CalendarClock size={20} />
          </span>
          <p className="text-base font-semibold text-gray-900">
            {cosa} {quando}
          </p>
        </ModalHeader>
        <ModalBody className="gap-3 pb-2 text-sm text-gray-700">
          <p>{testo}</p>
          <ul className="space-y-1.5">
            {PUNTI[scadenza.tipo].map((riga) => (
              <li key={riga} className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" />
                {riga}
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={chiudi}>
            Più tardi
          </Button>
          <Button
            className="bg-brand-700 text-white"
            onPress={() => {
              if (scadenza.tipo === "prova") {
                chiudi();
                onAbbonati();
              } else {
                void riattiva();
              }
            }}
          >
            {scadenza.tipo === "prova" ? "Abbonati" : "Riattiva"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}
