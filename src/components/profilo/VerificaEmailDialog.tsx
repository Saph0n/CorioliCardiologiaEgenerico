import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner } from "@nextui-org/react";
import { MailCheck, WifiOff } from "lucide-react";
import { AppModal } from "../AppModal";
import PinDigitInput from "../app-lock/PinDigitInput";
import { richiediCodiceEmail, verificaCodiceEmail } from "../../services/VerificaEmailService";

const ATTESA_RINVIO_S = 30;

/**
 * Conferma dell'email con un codice di 6 cifre mandato a quell'indirizzo.
 * Si apre già con il codice in viaggio; alla sesta cifra verifica da sola.
 */
export default function VerificaEmailDialog({
  isOpen,
  clientId,
  email,
  onConfermata,
  onClose,
  onPiuTardi,
}: {
  isOpen: boolean;
  clientId: string | null;
  email: string;
  onConfermata: (esito: { email: string; prova: string }) => void | Promise<void>;
  onClose: () => void;
  /** Se c'è, senza connessione si può proseguire e confermare dopo. */
  onPiuTardi?: () => void;
}) {
  const [ticket, setTicket] = useState<string | null>(null);
  const [codice, setCodice] = useState("");
  const [invio, setInvio] = useState(false);
  const [verifica, setVerifica] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [attesa, setAttesa] = useState(0);
  const inviato = useRef<string | null>(null);

  const invia = useCallback(async () => {
    if (!clientId) {
      setErrore("Profilo non pronto: riprova tra un momento.");
      return;
    }
    setInvio(true);
    setErrore(null);
    setOffline(false);
    setCodice("");
    const esito = await richiediCodiceEmail(clientId, email);
    setInvio(false);
    if (!esito.ok) {
      setErrore(esito.errore);
      setOffline(Boolean(esito.offline));
      return;
    }
    setTicket(esito.dati.ticket);
    setAttesa(ATTESA_RINVIO_S);
  }, [clientId, email]);

  // All'apertura (o se cambia l'email) parte subito il codice.
  useEffect(() => {
    if (!isOpen) {
      inviato.current = null;
      setTicket(null);
      setCodice("");
      setErrore(null);
      setOffline(false);
      return;
    }
    if (inviato.current === email) return;
    inviato.current = email;
    void invia();
  }, [isOpen, email, invia]);

  useEffect(() => {
    if (attesa <= 0) return;
    const t = window.setTimeout(() => setAttesa((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [attesa]);

  const conferma = async (valore: string = codice) => {
    if (!clientId || !ticket || verifica) return;
    if (valore.replace(/\D/g, "").length !== 6) {
      setErrore("Il codice è di 6 cifre.");
      return;
    }
    setVerifica(true);
    setErrore(null);
    const esito = await verificaCodiceEmail(clientId, email, valore, ticket);
    if (!esito.ok) {
      setVerifica(false);
      setErrore(esito.errore);
      setOffline(Boolean(esito.offline));
      return;
    }
    try {
      await onConfermata(esito.dati);
    } catch {
      setErrore("Email confermata, ma non sono riuscito a salvarla. Riprova.");
    } finally {
      setVerifica(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      placement="center"
      backdrop="blur"
      size="md"
      isDismissable={!verifica}
      classNames={{ header: "border-b border-default-100", footer: "border-t border-default-100" }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            {offline ? <WifiOff size={20} /> : <MailCheck size={20} />}
          </span>
          <p className="text-base font-semibold text-gray-900">Conferma la tua email</p>
        </ModalHeader>
        <ModalBody className="gap-4 py-5">
          <p className="text-sm text-gray-700">
            {invio ? (
              <>Ti stiamo mandando un codice a <strong className="break-all">{email}</strong>…</>
            ) : ticket ? (
              <>
                Ti abbiamo mandato un codice di 6 cifre a <strong className="break-all">{email}</strong>. Controlla
                anche la posta indesiderata.
              </>
            ) : (
              <>Serve per essere sicuri che <strong className="break-all">{email}</strong> sia tua: la useremo per recuperare il PIN e per l&apos;abbonamento.</>
            )}
          </p>

          {invio ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : ticket ? (
            <div className="space-y-3">
              <PinDigitInput
                value={codice}
                onChange={(v) => {
                  setCodice(v);
                  setErrore(null);
                }}
                length={6}
                visibile
                autoFocus
                disabled={verifica}
                invalid={Boolean(errore)}
                showHint={false}
                onComplete={(v) => void conferma(v)}
                onSubmit={() => void conferma()}
                aria-label="Codice di 6 cifre ricevuto via email"
              />
              <p className="text-center text-xs text-default-500">
                {attesa > 0 ? (
                  `Non è arrivato? Puoi richiederlo tra ${attesa} secondi.`
                ) : (
                  <button type="button" className="text-brand-700 underline" onClick={() => void invia()}>
                    Non è arrivato? Mandamelo di nuovo
                  </button>
                )}
              </p>
            </div>
          ) : null}

          {errore ? (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {errore}
            </p>
          ) : null}
        </ModalBody>
        <ModalFooter className="flex-wrap">
          {offline && onPiuTardi ? (
            <Button variant="light" className="mr-auto" onPress={onPiuTardi}>
              Conferma più tardi
            </Button>
          ) : null}
          <Button variant="flat" onPress={onClose} isDisabled={verifica}>
            Annulla
          </Button>
          {ticket ? (
            <Button
              className="bg-brand-700 text-white"
              onPress={() => void conferma()}
              isLoading={verifica}
              isDisabled={codice.length !== 6}
            >
              Conferma
            </Button>
          ) : (
            <Button className="bg-brand-700 text-white" onPress={() => void invia()} isLoading={invio}>
              Mandami il codice
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}
