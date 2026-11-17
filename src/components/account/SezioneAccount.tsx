import { useState } from "react";
import { Button, Input, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@nextui-org/react";
import { CheckCircle2, CircleAlert, UserRound } from "lucide-react";
import { SezioneImpostazioni } from "../impostazioni/SezioneImpostazioni";
import { AppModal } from "../AppModal";
import VerificaEmailDialog from "../profilo/VerificaEmailDialog";
import BloccoAbbonamento from "../abbonamento/BloccoAbbonamento";
import BloccoAccesso from "../app-lock/BloccoAccesso";
import { isAppLockAvailable } from "../../services/AppLockService";
import { emailConfermata, normalizzaEmail } from "../../services/VerificaEmailService";
import { DoctorService } from "../../services/OfflineServices";

const EMAIL_VALIDA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Account Corioli": tutto ciò che riguarda l'account in una sezione sola,
 * separata dal profilo che si stampa sui documenti.
 * - in alto l'email dell'account (confermata con un codice);
 * - Abbonamento: stato, Stripe, computer collegati;
 * - Accesso a questo computer: password, PIN, codice di recupero, biometria.
 */
export default function SezioneAccount({
  clientId,
  email,
  emailVerificata,
  onEmailAggiornata,
}: {
  clientId: string | null;
  email: string;
  emailVerificata: string | null;
  onEmailAggiornata: (dati: { email: string; emailVerificata: string }) => void;
}) {
  const [cambiaEmail, setCambiaEmail] = useState(false);
  const [nuovaEmail, setNuovaEmail] = useState("");
  const [erroreEmail, setErroreEmail] = useState<string | null>(null);
  const [emailDaVerificare, setEmailDaVerificare] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const confermata = emailConfermata({ email, emailVerificata: emailVerificata ?? undefined });
  const iniziale = (email.trim()[0] || "?").toUpperCase();

  const proseguiCambioEmail = () => {
    const valore = normalizzaEmail(nuovaEmail);
    if (!EMAIL_VALIDA.test(valore)) {
      setErroreEmail("Scrivi un indirizzo email valido.");
      return;
    }
    if (valore === normalizzaEmail(email)) {
      setErroreEmail("È già l'email del tuo account.");
      return;
    }
    setCambiaEmail(false);
    setEmailDaVerificare(valore);
  };

  return (
    <SezioneImpostazioni
      id="impostazioni-account"
      icon={UserRound}
      titolo="Account Corioli"
      descrizione="Il tuo account: email, abbonamento e accesso a questo computer. I dati che vanno sui referti sono nel Profilo, più sotto."
      corpoClassName="flex flex-col gap-6 px-6 py-5"
    >
      {/* L'account è l'email: in alto, ben visibile. */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-default-200 bg-default-50/60 px-4 py-3.5">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-700 text-base font-semibold text-white"
        >
          {iniziale}
        </span>
        <div className="min-w-0 flex-1 basis-52">
          <p className="text-xs text-default-500">Email dell&apos;account</p>
          <p className="break-all text-sm font-semibold text-foreground">{email || "Non indicata"}</p>
          {email ? (
            confermata ? (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-success-700">
                <CheckCircle2 size={13} /> Confermata
              </p>
            ) : (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning-700">
                <CircleAlert size={13} /> Da confermare: ti serve per recuperare la password
              </p>
            )
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {email && !confermata ? (
            <Button
              size="sm"
              className="bg-brand-700 text-white"
              onPress={() => setEmailDaVerificare(normalizzaEmail(email))}
            >
              Conferma ora
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="bordered"
            onPress={() => {
              setNuovaEmail("");
              setErroreEmail(null);
              setAvviso(null);
              setCambiaEmail(true);
            }}
          >
            Cambia email
          </Button>
        </div>
      </div>
      {avviso ? (
        <p role="status" className="-mt-3 text-sm text-success-700">
          {avviso}
        </p>
      ) : null}

      <BloccoAbbonamento clientId={clientId} emailAccount={email} />

      {isAppLockAvailable() ? <BloccoAccesso clientId={clientId} email={normalizzaEmail(email)} /> : null}

      {/* Nuova email: prima si scrive, poi si conferma con il codice. */}
      <AppModal isOpen={cambiaEmail} onClose={() => setCambiaEmail(false)} placement="center" size="md">
        <ModalContent>
          <ModalHeader>Cambia email</ModalHeader>
          <ModalBody className="gap-3">
            <p className="text-sm text-default-600">
              Ti mandiamo un codice al nuovo indirizzo: l&apos;email cambia solo dopo che l&apos;hai confermato.
            </p>
            <Input
              type="email"
              label="Nuova email"
              variant="bordered"
              value={nuovaEmail}
              onValueChange={(v) => {
                setNuovaEmail(v);
                setErroreEmail(null);
              }}
              autoFocus
              isInvalid={Boolean(erroreEmail)}
              errorMessage={erroreEmail ?? undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter") proseguiCambioEmail();
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCambiaEmail(false)}>
              Annulla
            </Button>
            <Button className="bg-brand-700 text-white" onPress={proseguiCambioEmail}>
              Mandami il codice
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <VerificaEmailDialog
        isOpen={emailDaVerificare !== null}
        clientId={clientId}
        email={emailDaVerificare ?? ""}
        onClose={() => setEmailDaVerificare(null)}
        onConfermata={async (esito) => {
          await DoctorService.updateDoctor({
            email: esito.email,
            emailVerificata: esito.email,
            emailVerificataProva: esito.prova,
          });
          window.dispatchEvent(new CustomEvent("appdottori-doctor-updated"));
          const cambiata = normalizzaEmail(email) !== esito.email;
          onEmailAggiornata({ email: esito.email, emailVerificata: esito.email });
          setEmailDaVerificare(null);
          setAvviso(cambiata ? "Email aggiornata e confermata." : "Email confermata.");
        }}
      />
    </SezioneImpostazioni>
  );
}
