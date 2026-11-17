import { useEffect, useState } from "react";
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner } from "@nextui-org/react";
import { KeyRound } from "lucide-react";
import { AppModal } from "../AppModal";
import CampoPassword, { RegolePassword } from "../app-lock/CampoPassword";
import PinDigitInput from "../app-lock/PinDigitInput";
import {
  changeAppLockPassword,
  erroreFormatoPassword,
  resetAppLockPasswordWithEmail,
  setAppLockPassword,
} from "../../services/AppLockService";
import { richiediCodiceEmail } from "../../services/VerificaEmailService";

export type ModoPassword = "cambia" | "crea" | "dimenticata";

const TITOLI: Record<ModoPassword, string> = {
  cambia: "Cambia password",
  crea: "Crea la password",
  dimenticata: "Reimposta la password",
};

/**
 * Password dell'account:
 * - "crea": per chi aveva Corioli prima della password, si conferma con il PIN;
 * - "cambia": con la password attuale;
 * - "dimenticata": con un codice mandato all'email del profilo.
 */
export default function PasswordDialog({
  modo,
  clientId,
  email,
  onClose,
  onFatto,
  onDimenticata,
}: {
  modo: ModoPassword | null;
  clientId: string | null;
  email: string;
  onClose: () => void;
  onFatto: (messaggio: string) => void;
  /** Dal modo "cambia" si passa a "dimenticata". */
  onDimenticata?: () => void;
}) {
  const [attuale, setAttuale] = useState("");
  const [pin, setPin] = useState("");
  const [nuova, setNuova] = useState("");
  const [conferma, setConferma] = useState("");
  const [codice, setCodice] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    setAttuale("");
    setPin("");
    setNuova("");
    setConferma("");
    setCodice("");
    setTicket(null);
    setErrore(null);
    if (modo === "dimenticata") void inviaCodice();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si riparte solo cambiando modo
  }, [modo]);

  async function inviaCodice() {
    if (!clientId || !email) {
      setErrore("Manca l'email nel profilo: aggiungila in Impostazioni → Account Corioli.");
      return;
    }
    setInvio(true);
    setErrore(null);
    const esito = await richiediCodiceEmail(clientId, email);
    setInvio(false);
    if (!esito.ok) {
      setErrore(esito.errore);
      return;
    }
    setTicket(esito.dati.ticket);
  }

  const erroreNuova = nuova ? erroreFormatoPassword(nuova) : null;
  const nuovaPronta = Boolean(nuova) && !erroreNuova && nuova === conferma;
  const pronto =
    nuovaPronta &&
    (modo === "cambia"
      ? attuale.length > 0
      : modo === "crea"
        ? pin.length === 4
        : codice.length === 6 && Boolean(ticket));

  const salva = async () => {
    if (!modo || !pronto) return;
    setInCorso(true);
    setErrore(null);
    let esito: { ok: boolean; error?: string };
    try {
      esito =
        modo === "cambia"
          ? await changeAppLockPassword(attuale, nuova)
          : modo === "crea"
            ? await setAppLockPassword(pin, nuova)
            : await resetAppLockPasswordWithEmail({
                clientId: clientId ?? "",
                email,
                otp: codice,
                ticket: ticket ?? "",
                newPassword: nuova,
              });
    } catch {
      esito = { ok: false, error: "Operazione non riuscita. Riprova." };
    } finally {
      setInCorso(false);
    }
    if (!esito.ok) {
      setErrore(esito.error ?? "Operazione non riuscita.");
      // PIN sbagliato: si svuota per riscriverlo.
      if (modo === "crea") setPin("");
      return;
    }
    onFatto(modo === "crea" ? "Password creata." : "Password aggiornata.");
  };

  return (
    <AppModal
      isOpen={modo !== null}
      onClose={onClose}
      placement="center"
      backdrop="blur"
      size="md"
      isDismissable={!inCorso}
      classNames={{ header: "border-b border-default-100", footer: "border-t border-default-100" }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <KeyRound size={20} />
          </span>
          <p className="text-base font-semibold text-gray-900">{modo ? TITOLI[modo] : ""}</p>
        </ModalHeader>
        <ModalBody className="gap-4 py-5">
          {modo === "crea" ? (
            <>
              <p className="text-sm text-gray-700">
                La password serve per cambiare il PIN. Per crearla conferma con il PIN attuale.
              </p>
              <div className="space-y-1.5">
                <p className="text-center text-xs font-medium text-default-500">PIN attuale</p>
                <PinDigitInput value={pin} onChange={setPin} length={4} autoFocus aria-label="PIN attuale" />
              </div>
            </>
          ) : null}

          {modo === "cambia" ? (
            <div className="space-y-1">
              <CampoPassword label="Password attuale" value={attuale} onValueChange={setAttuale} autoFocus />
              {onDimenticata ? (
                <button type="button" className="text-xs text-brand-700 underline" onClick={onDimenticata}>
                  Non la ricordi? Reimpostala con l&apos;email
                </button>
              ) : null}
            </div>
          ) : null}

          {modo === "dimenticata" ? (
            invio ? (
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Spinner size="sm" /> Ti stiamo mandando un codice a <strong className="break-all">{email}</strong>…
              </div>
            ) : ticket ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  Ti abbiamo mandato un codice di 6 cifre a <strong className="break-all">{email}</strong>.
                </p>
                <PinDigitInput
                  value={codice}
                  onChange={setCodice}
                  length={6}
                  visibile
                  autoFocus
                  showHint={false}
                  aria-label="Codice di 6 cifre ricevuto via email"
                />
                <button
                  type="button"
                  className="mx-auto block text-xs text-brand-700 underline"
                  onClick={() => void inviaCodice()}
                >
                  Non è arrivato? Mandamelo di nuovo
                </button>
              </div>
            ) : null
          ) : null}

          {modo !== "dimenticata" || ticket ? (
            <div className="space-y-3 border-t border-default-100 pt-4">
              <CampoPassword
                label="Nuova password"
                value={nuova}
                onValueChange={setNuova}
                autoComplete="new-password"
              />
              <RegolePassword password={nuova} />
              <CampoPassword
                label="Ripeti la nuova password"
                value={conferma}
                onValueChange={setConferma}
                autoComplete="new-password"
                onEnter={() => void salva()}
                errorMessage={conferma && nuova && conferma !== nuova ? "Le due password non coincidono." : null}
              />
            </div>
          ) : null}

          {errore ? (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {errore}
            </p>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose} isDisabled={inCorso}>
            Annulla
          </Button>
          <Button
            className="bg-brand-700 text-white"
            onPress={() => void salva()}
            isLoading={inCorso}
            isDisabled={!pronto}
          >
            {modo === "crea" ? "Crea password" : "Salva password"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}
