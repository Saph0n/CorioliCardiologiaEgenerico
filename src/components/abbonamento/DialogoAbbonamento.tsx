import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Button,
  Input,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@nextui-org/react";
import { BookOpen, CheckCircle2, CreditCard, ExternalLink, Laptop, Mail } from "lucide-react";
import { AppModal } from "../AppModal";
import PinDigitInput from "../app-lock/PinDigitInput";
import { DoctorService } from "../../services/OfflineServices";
import { sendHeartbeat } from "../../services/HeartbeatService";
import {
  avviaAbbonamento,
  confermaCodiceCollegamento,
  dataConArticolo,
  leggiPrezzo,
  richiediCodiceCollegamento,
  testoPrezzo,
  type PrezzoAbbonamento,
  type StatoAbbonamento,
} from "../../services/AbbonamentoService";

export type ModoDialogo = "abbonati" | "sola-lettura" | "collega";

type Passo = "offerta" | "attesa" | "email" | "codice" | "fatto";

const ATTESA_CONTROLLO_MS = 4_000;
const ATTESA_MASSIMA_MS = 30 * 60 * 1000;

const VANTAGGI = [
  "Cartella clinica, visite, referti PDF, ricette e certificati",
  "Calcolatori clinici, backup automatici e tutti gli aggiornamenti",
  "Disdici quando vuoi dal portale Stripe, senza vincoli",
];

/**
 * Finestra per abbonarsi (pagamento su Stripe, nel browser) o per collegare
 * questo computer a un abbonamento già attivo con un codice via email.
 */
export default function DialogoAbbonamento({
  modoIniziale,
  stato,
  verifica,
  onClose,
}: {
  modoIniziale: ModoDialogo;
  stato: StatoAbbonamento;
  /** Rilegge lo stato dal server. */
  verifica: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [passo, setPasso] = useState<Passo>(modoIniziale === "collega" ? "email" : "offerta");
  const [prezzo, setPrezzo] = useState<PrezzoAbbonamento | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [codice, setCodice] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [fattoCollegando, setFattoCollegando] = useState(false);
  const inizioAttesa = useRef<number>(0);

  useEffect(() => {
    let vivo = true;
    void DoctorService.getDoctor().then((doctor) => {
      if (!vivo) return;
      setClientId(doctor?.id?.trim() || null);
      setEmail(doctor?.email ?? "");
    });
    void leggiPrezzo().then((esito) => {
      if (vivo && esito.ok) setPrezzo(esito.dati);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Pagamento in corso nel browser: si controlla lo stato finché non è attivo.
  useEffect(() => {
    if (passo !== "attesa") return;
    inizioAttesa.current = Date.now();
    const controlla = () => {
      if (Date.now() - inizioAttesa.current > ATTESA_MASSIMA_MS) return;
      void verifica();
    };
    const timer = window.setInterval(controlla, ATTESA_CONTROLLO_MS);
    window.addEventListener("focus", controlla);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", controlla);
    };
  }, [passo, verifica]);

  useEffect(() => {
    if (passo === "attesa" && stato.tipo === "attivo") {
      setFattoCollegando(false);
      setPasso("fatto");
    }
  }, [passo, stato]);

  const senzaProfilo = !clientId;

  const abbonati = useCallback(async () => {
    if (!clientId) return;
    setErrore(null);
    setInCorso(true);
    // Il server deve avere nome ed email aggiornati prima di creare il cliente
    // Stripe: il profilo può essere stato appena completato.
    const doctor = await DoctorService.getDoctor();
    if (doctor) await sendHeartbeat(doctor, "corioli-cardiologia");
    const esito = await avviaAbbonamento(clientId);
    setInCorso(false);
    if (esito.ok) {
      setPasso("attesa");
      return;
    }
    if (esito.codice === "already_active") {
      await verifica();
      setFattoCollegando(false);
      setPasso("fatto");
      return;
    }
    setErrore(esito.errore);
  }, [clientId, verifica]);

  const inviaCodice = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!clientId) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrore("Inserisci l'email con cui ti sei abbonato.");
      return;
    }
    setErrore(null);
    setInCorso(true);
    const esito = await richiediCodiceCollegamento(clientId, email);
    setInCorso(false);
    if (!esito.ok) {
      setErrore(esito.errore);
      return;
    }
    setAvviso(esito.dati.message);
    setCodice("");
    setPasso("codice");
  };

  const collega = async (e?: FormEvent, codiceInserito: string = codice) => {
    e?.preventDefault();
    if (!clientId || inCorso) return;
    if (codiceInserito.replace(/\D/g, "").length !== 6) {
      setErrore("Il codice è di 6 cifre.");
      return;
    }
    setErrore(null);
    setInCorso(true);
    const esito = await confermaCodiceCollegamento(clientId, email, codiceInserito);
    setInCorso(false);
    if (!esito.ok) {
      setErrore(esito.errore);
      return;
    }
    setFattoCollegando(true);
    setPasso("fatto");
  };

  const titolo =
    passo === "fatto"
      ? fattoCollegando
        ? "Computer collegato"
        : "Abbonamento attivo"
      : passo === "attesa"
        ? "Completa il pagamento"
        : passo === "email" || passo === "codice"
          ? "Usa un abbonamento che hai già"
          : modoIniziale === "sola-lettura"
            ? "Riattiva Corioli"
            : "Abbonati a Corioli";

  const icona =
    passo === "fatto" ? (
      <CheckCircle2 size={20} />
    ) : passo === "email" || passo === "codice" ? (
      <Laptop size={20} />
    ) : modoIniziale === "sola-lettura" && passo === "offerta" ? (
      <BookOpen size={20} />
    ) : (
      <CreditCard size={20} />
    );

  return (
    <AppModal
      isOpen
      onClose={onClose}
      placement="center"
      backdrop="blur"
      size="lg"
      isDismissable={!inCorso}
      classNames={{
        header: "border-b border-default-100",
        footer: "border-t border-default-100",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              passo === "fatto" ? "bg-success-100 text-success-700" : "bg-brand-50 text-brand-700"
            }`}
          >
            {icona}
          </span>
          <p className="text-base font-semibold text-gray-900">{titolo}</p>
        </ModalHeader>

        <ModalBody className="py-5">
          {senzaProfilo && passo !== "fatto" ? (
            <p className="text-sm text-gray-700">
              Completa prima il profilo medico in Impostazioni: l&apos;abbonamento è legato a questo
              computer e alla tua email.
            </p>
          ) : null}

          {passo === "offerta" && !senzaProfilo ? (
            <div className="space-y-4">
              {modoIniziale === "sola-lettura" ? (
                <p className="text-sm text-gray-700">
                  I tuoi dati sono al sicuro: puoi consultare, stampare ed esportare tutto quello che
                  hai inserito. Per aggiungere pazienti e visite o modificare i dati serve
                  l&apos;abbonamento.
                </p>
              ) : null}
              <div className="rounded-xl border border-default-200 bg-default-50 p-4">
                <div className="text-2xl font-semibold text-gray-900">
                  {prezzo ? testoPrezzo(prezzo) : <Spinner size="sm" />}
                </div>
                {stato.tipo === "prova" ? (
                  <p className="mt-1 text-sm text-gray-600">
                    Nessun addebito fino alla fine della prova, {dataConArticolo(stato.fineProva)}.
                  </p>
                ) : null}
                <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
                  {VANTAGGI.map((v) => (
                    <li key={v} className="flex gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-600" />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-gray-500">
                Il pagamento si fa sulla pagina sicura di Stripe, che si apre nel browser. Corioli non
                vede né conserva i dati della carta.
              </p>
            </div>
          ) : null}

          {passo === "attesa" ? (
            <div className="space-y-4 text-sm text-gray-700">
              <p>
                La pagina di pagamento si è aperta nel browser. Quando hai finito torna qui:
                Corioli si aggiorna da solo.
              </p>
              <div className="flex items-center gap-3 rounded-xl bg-default-50 p-4">
                <Spinner size="sm" />
                <span>In attesa della conferma di Stripe…</span>
              </div>
              <p className="text-xs text-gray-500">
                Non vedi la pagina? Riaprila con il pulsante qui sotto: è la stessa, non paghi due volte.
              </p>
            </div>
          ) : null}

          {passo === "email" && !senzaProfilo ? (
            <form id="form-collega-email" noValidate onSubmit={inviaCodice} className="space-y-3">
              <p className="text-sm text-gray-700">
                Se ti sei già abbonato da un altro computer, puoi usare lo stesso abbonamento anche qui.
                Ti mandiamo un codice all&apos;email dell&apos;abbonamento.
              </p>
              <Input
                type="email"
                label="Email dell'abbonamento"
                value={email}
                onValueChange={setEmail}
                startContent={<Mail size={16} className="text-default-400" />}
                autoFocus
              />
            </form>
          ) : null}

          {passo === "codice" ? (
            <form id="form-collega-codice" noValidate onSubmit={collega} className="space-y-4">
              <p className="text-sm text-gray-700">{avviso}</p>
              <div className="space-y-2">
                <p className="text-center text-sm font-medium text-gray-900">
                  Inserisci il codice di 6 cifre
                </p>
                <PinDigitInput
                  value={codice}
                  onChange={(v) => {
                    setCodice(v);
                    setErrore(null);
                  }}
                  length={6}
                  visibile
                  autoFocus
                  disabled={inCorso}
                  invalid={Boolean(errore)}
                  showHint={false}
                  onComplete={(v) => void collega(undefined, v)}
                  onSubmit={() => void collega()}
                  aria-label="Codice di 6 cifre ricevuto via email"
                />
              </div>
              <button
                type="button"
                className="mx-auto block text-xs text-brand-700 underline"
                onClick={() => {
                  setErrore(null);
                  setPasso("email");
                }}
              >
                Non è arrivato? Cambia email o richiedilo
              </button>
            </form>
          ) : null}

          {passo === "fatto" ? (
            <p className="text-sm text-gray-700">
              {fattoCollegando
                ? "Questo computer ora usa il tuo abbonamento. Puoi tornare a lavorare normalmente."
                : "Grazie! L'abbonamento è attivo. Fatture, metodo di pagamento e disdetta si gestiscono da Impostazioni → Account Corioli."}
            </p>
          ) : null}

          {errore ? (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {errore}
            </p>
          ) : null}
        </ModalBody>

        <ModalFooter className="flex-wrap">
          {passo === "offerta" ? (
            <>
              <Button
                variant="light"
                className="mr-auto"
                onPress={() => {
                  setErrore(null);
                  setPasso("email");
                }}
                isDisabled={senzaProfilo}
              >
                Ho già un abbonamento
              </Button>
              <Button variant="flat" onPress={onClose}>
                Non ora
              </Button>
              <Button
                color="primary"
                onPress={() => void abbonati()}
                isLoading={inCorso}
                isDisabled={senzaProfilo}
                startContent={inCorso ? undefined : <ExternalLink size={16} />}
              >
                Abbonati
              </Button>
            </>
          ) : null}

          {passo === "attesa" ? (
            <>
              <Button variant="flat" onPress={onClose}>
                Chiudi
              </Button>
              <Button
                color="primary"
                variant="flat"
                onPress={() => void abbonati()}
                isLoading={inCorso}
                startContent={inCorso ? undefined : <ExternalLink size={16} />}
              >
                Riapri la pagina di pagamento
              </Button>
            </>
          ) : null}

          {passo === "email" ? (
            <>
              <Button variant="flat" onPress={() => (modoIniziale === "collega" ? onClose() : setPasso("offerta"))}>
                {modoIniziale === "collega" ? "Annulla" : "Indietro"}
              </Button>
              <Button
                color="primary"
                type="submit"
                form="form-collega-email"
                isLoading={inCorso}
                isDisabled={senzaProfilo}
              >
                Invia il codice
              </Button>
            </>
          ) : null}

          {passo === "codice" ? (
            <>
              <Button variant="flat" onPress={onClose}>
                Annulla
              </Button>
              <Button color="primary" type="submit" form="form-collega-codice" isLoading={inCorso}>
                Collega questo computer
              </Button>
            </>
          ) : null}

          {passo === "fatto" ? (
            <Button color="primary" onPress={onClose}>
              Chiudi
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}
