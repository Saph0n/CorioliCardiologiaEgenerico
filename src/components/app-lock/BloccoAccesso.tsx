import { useEffect, useState } from "react";
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader, Switch } from "@nextui-org/react";
import { Fingerprint, KeyRound, LifeBuoy, Lock, LockKeyhole } from "lucide-react";
import {
  changeAppLockPin,
  getAppLockStatus,
  regenerateRecoveryCode,
  revealRecoveryCode,
  setBiometricUnlockEnabled,
} from "../../services/AppLockService";
import { useAppLock } from "../../contexts/AppLockContext";
import { AppModal } from "../AppModal";
import RecoveryCodePanel from "./RecoveryCodePanel";
import PinDigitInput from "./PinDigitInput";
import CampoPassword from "./CampoPassword";
import PasswordDialog, { type ModoPassword } from "../account/PasswordDialog";
import { GruppoAccount, RigaAccount } from "../account/RigheAccount";

const PIN_LENGTH = 4;
type ModalePin = null | "reveal" | "regenerate" | "change";
const soloCifre = (v: string) => v.replace(/\D/g, "");

/**
 * Gruppo "Accesso a questo computer" della sezione Account Corioli:
 * password, PIN, codice di recupero, sblocco biometrico e blocco immediato.
 * Valgono solo su questo computer (sono salvati in locale dal processo principale).
 */
export default function BloccoAccesso({
  clientId,
  email,
}: {
  clientId: string | null;
  email: string;
}) {
  const { lock } = useAppLock();
  const [caricato, setCaricato] = useState(false);
  const [passwordImpostata, setPasswordImpostata] = useState(false);
  const [canReveal, setCanReveal] = useState(false);
  const [biometriaDisponibile, setBiometriaDisponibile] = useState(false);
  const [biometriaAttiva, setBiometriaAttiva] = useState(false);
  const [modoPassword, setModoPassword] = useState<ModoPassword | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  // Modale del PIN (cambia / mostra codice / rigenera codice).
  const [modale, setModale] = useState<ModalePin>(null);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [nuovoPin, setNuovoPin] = useState("");
  const [confermaPin, setConfermaPin] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [codiceMostrato, setCodiceMostrato] = useState<string | null>(null);
  const [codiceNuovo, setCodiceNuovo] = useState<string | null>(null);

  // Conferma col PIN per attivare/disattivare la biometria.
  const [bioModale, setBioModale] = useState(false);
  const [bioPin, setBioPin] = useState("");
  const [bioAttivare, setBioAttivare] = useState(false);
  const [bioErrore, setBioErrore] = useState<string | null>(null);
  const [bioInCorso, setBioInCorso] = useState(false);

  const aggiornaStato = () => {
    void getAppLockStatus().then((s) => {
      setPasswordImpostata(Boolean(s?.passwordConfigured));
      setCanReveal(Boolean(s?.canRevealRecovery));
      setBiometriaDisponibile(Boolean(s?.biometricAvailable));
      setBiometriaAttiva(Boolean(s?.biometricEnabled));
      setCaricato(true);
    });
  };
  useEffect(aggiornaStato, []);

  const apriModale = (m: Exclude<ModalePin, null>) => {
    setPin("");
    setPassword("");
    setNuovoPin("");
    setConfermaPin("");
    setErrore(null);
    setCodiceMostrato(null);
    setCodiceNuovo(null);
    setAvviso(null);
    setModale(m);
  };
  const chiudiModale = () => setModale(null);

  const eseguiAzionePin = async () => {
    setErrore(null);
    setInCorso(true);
    try {
      if (modale === "reveal") {
        const res = await revealRecoveryCode(soloCifre(pin));
        if (!res.ok) return setErrore(res.error || "Impossibile mostrare il codice.");
        setCodiceMostrato(res.recoveryCode || null);
        return;
      }
      if (modale === "regenerate") {
        const res = await regenerateRecoveryCode(soloCifre(pin));
        if (!res.ok || !res.recoveryCode) return setErrore(res.error || "Impossibile rigenerare.");
        setCodiceNuovo(res.recoveryCode);
        return;
      }
      if (modale === "change") {
        const a = soloCifre(nuovoPin);
        if (a !== soloCifre(confermaPin)) return setErrore("I nuovi PIN non coincidono.");
        const res = passwordImpostata
          ? await changeAppLockPin(undefined, a, password)
          : await changeAppLockPin(soloCifre(pin), a);
        if (!res.ok) return setErrore(res.error || "Impossibile cambiare il PIN.");
        chiudiModale();
        setAvviso("PIN aggiornato.");
      }
    } catch {
      setErrore("Operazione non riuscita. Riprova.");
    } finally {
      setInCorso(false);
    }
  };

  const pinCompleto = (v: string) => soloCifre(v).length === PIN_LENGTH;
  const continuaDisattivato =
    modale === "change"
      ? (passwordImpostata ? password.length === 0 : !pinCompleto(pin)) ||
        !pinCompleto(nuovoPin) ||
        !pinCompleto(confermaPin)
      : !pinCompleto(pin);

  const confermaBiometria = async (codice: string) => {
    setBioErrore(null);
    setBioInCorso(true);
    try {
      const res = await setBiometricUnlockEnabled(codice, bioAttivare);
      if (!res.ok) return setBioErrore(res.error || "Operazione non riuscita.");
      setBiometriaAttiva(bioAttivare);
      setBioModale(false);
      setBioPin("");
      aggiornaStato();
    } finally {
      setBioInCorso(false);
    }
  };

  return (
    <GruppoAccount
      titolo="Accesso a questo computer"
      spiegazione="Password e PIN restano solo qui: su un altro computer Corioli ha i suoi."
    >
      <RigaAccount
        icon={KeyRound}
        titolo="Password"
        descrizione={
          !caricato
            ? "…"
            : passwordImpostata
              ? "Ti viene chiesta per cambiare il PIN."
              : "Non ancora creata. Creala: servirà per cambiare il PIN."
        }
        azioni={
          !caricato ? null : passwordImpostata ? (
            <>
              <Button size="sm" variant="light" onPress={() => setModoPassword("dimenticata")}>
                L&apos;ho dimenticata
              </Button>
              <Button size="sm" variant="bordered" onPress={() => setModoPassword("cambia")}>
                Cambia password
              </Button>
            </>
          ) : (
            <Button size="sm" className="bg-brand-700 text-white" onPress={() => setModoPassword("crea")}>
              Crea password
            </Button>
          )
        }
      />

      <RigaAccount
        icon={LockKeyhole}
        titolo="PIN"
        descrizione="Le 4 cifre per aprire Corioli."
        azioni={
          <>
            <Button size="sm" variant="light" startContent={<Lock size={14} />} onPress={lock}>
              Blocca ora
            </Button>
            <Button size="sm" variant="bordered" onPress={() => apriModale("change")}>
              Cambia PIN
            </Button>
          </>
        }
      />

      <RigaAccount
        icon={LifeBuoy}
        titolo="Codice di recupero"
        descrizione="Il codice CORI-… per entrare se dimentichi il PIN."
        azioni={
          <Button size="sm" variant="bordered" onPress={() => apriModale(canReveal ? "reveal" : "regenerate")}>
            {canReveal ? "Mostra" : "Crea un nuovo codice"}
          </Button>
        }
      />

      {biometriaDisponibile ? (
        <RigaAccount
          icon={Fingerprint}
          titolo="Impronta o volto"
          descrizione="Apri Corioli senza scrivere il PIN."
          azioni={
            <Switch
              aria-label="Sblocco con impronta o volto"
              isSelected={biometriaAttiva}
              isDisabled={bioInCorso}
              size="sm"
              color="primary"
              onValueChange={(attiva) => {
                setBioAttivare(attiva);
                setBioPin("");
                setBioErrore(null);
                setBioModale(true);
              }}
            />
          }
        />
      ) : null}

      {avviso ? (
        <p role="status" className="py-3 text-sm text-success-700">
          {avviso}
        </p>
      ) : null}

      <PasswordDialog
        modo={modoPassword}
        clientId={clientId}
        email={email}
        onClose={() => setModoPassword(null)}
        onDimenticata={() => setModoPassword("dimenticata")}
        onFatto={(messaggio) => {
          setModoPassword(null);
          setAvviso(messaggio);
          aggiornaStato();
        }}
      />

      {/* Conferma biometria */}
      <AppModal
        isOpen={bioModale}
        onOpenChange={(aperto) => {
          if (!aperto) setBioModale(false);
        }}
        placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Fingerprint size={17} className="text-brand-700" />
            {bioAttivare ? "Attiva lo sblocco con impronta o volto" : "Disattiva lo sblocco con impronta o volto"}
          </ModalHeader>
          <ModalBody className="space-y-4 pb-2">
            <p className="text-sm text-default-600">Conferma con il tuo PIN attuale.</p>
            <PinDigitInput
              value={bioPin}
              onChange={setBioPin}
              length={PIN_LENGTH}
              autoFocus
              onComplete={(v) => void confermaBiometria(v)}
              aria-label="PIN attuale"
            />
            {bioErrore ? <p className="text-sm text-danger">{bioErrore}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setBioModale(false)}>
              Annulla
            </Button>
            <Button
              className="bg-brand-700 text-white"
              isLoading={bioInCorso}
              isDisabled={!pinCompleto(bioPin)}
              onPress={() => void confermaBiometria(soloCifre(bioPin))}
            >
              Conferma
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      {/* PIN e codice di recupero */}
      <AppModal isOpen={modale !== null} onOpenChange={(aperto) => !aperto && chiudiModale()} placement="center">
        <ModalContent>
          <ModalHeader>
            {modale === "reveal"
              ? "Codice di recupero"
              : modale === "regenerate"
                ? "Nuovo codice di recupero"
                : "Cambia PIN"}
          </ModalHeader>
          <ModalBody className="space-y-4 pb-2">
            {codiceMostrato ? (
              <RecoveryCodePanel recoveryCode={codiceMostrato} confirmLabel="Chiudi" onConfirmSaved={chiudiModale} />
            ) : codiceNuovo ? (
              <>
                <p className="text-sm text-warning-700">
                  Il codice precedente non è più valido. Salva questo nuovo codice.
                </p>
                <RecoveryCodePanel
                  recoveryCode={codiceNuovo}
                  confirmLabel="Ho salvato il nuovo codice"
                  onConfirmSaved={chiudiModale}
                />
              </>
            ) : (
              <>
                {modale === "change" && passwordImpostata ? (
                  <div className="space-y-1">
                    <p className="text-sm text-default-600">Per cambiare il PIN scrivi la password del tuo account.</p>
                    <CampoPassword label="Password" value={password} onValueChange={setPassword} autoFocus />
                    <button
                      type="button"
                      className="text-xs text-brand-700 underline"
                      onClick={() => {
                        chiudiModale();
                        setModoPassword("dimenticata");
                      }}
                    >
                      Password dimenticata? Reimpostala con l&apos;email
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-default-600">Scrivi il PIN attuale per continuare.</p>
                    <PinDigitInput value={pin} onChange={setPin} length={PIN_LENGTH} autoFocus aria-label="PIN attuale" />
                    {modale === "change" ? (
                      <p className="text-xs text-default-500">
                        Se crei una password (riga Password, qui in Account Corioli), il PIN si cambierà con quella.
                      </p>
                    ) : null}
                  </>
                )}
                {modale === "change" ? (
                  <>
                    <div className="space-y-1 pt-1">
                      <p className="text-center text-xs text-default-500">Nuovo PIN</p>
                      <PinDigitInput value={nuovoPin} onChange={setNuovoPin} length={PIN_LENGTH} aria-label="Nuovo PIN" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-center text-xs text-default-500">Conferma nuovo PIN</p>
                      <PinDigitInput
                        value={confermaPin}
                        onChange={setConfermaPin}
                        length={PIN_LENGTH}
                        aria-label="Conferma nuovo PIN"
                      />
                    </div>
                  </>
                ) : null}
                {modale === "regenerate" ? (
                  <p className="text-xs text-default-500">
                    Verrà creato un nuovo codice; quello vecchio smetterà di funzionare.
                  </p>
                ) : null}
                {errore ? <p className="text-sm text-danger">{errore}</p> : null}
              </>
            )}
          </ModalBody>
          {!codiceMostrato && !codiceNuovo ? (
            <ModalFooter>
              <Button variant="light" onPress={chiudiModale}>
                Annulla
              </Button>
              <Button
                className="bg-brand-700 text-white"
                isLoading={inCorso}
                isDisabled={continuaDisattivato}
                onPress={() => void eseguiAzionePin()}
              >
                {modale === "change" ? "Salva PIN" : "Continua"}
              </Button>
            </ModalFooter>
          ) : null}
        </ModalContent>
      </AppModal>
    </GruppoAccount>
  );
}
