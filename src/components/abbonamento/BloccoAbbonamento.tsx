import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Spinner } from "@nextui-org/react";
import { ChevronDown, CreditCard, ExternalLink, Laptop, RefreshCw } from "lucide-react";
import { useAbbonamento } from "../../contexts/useAbbonamento";
import { useToast } from "../../contexts/ToastContext";
import {
  apriGestioneAbbonamento,
  dataConArticolo,
  elencoComputerCollegati,
  scollegaComputer,
  type ComputerCollegato,
  type ElencoComputer,
} from "../../services/AbbonamentoService";
import { normalizzaEmail } from "../../services/VerificaEmailService";
import { ConfirmDangerModal } from "../ConfirmDangerModal";
import { GruppoAccount, RigaAccount } from "../account/RigheAccount";

/** "il 3 dicembre 2026", "l'8 dicembre 2026"; con prep "al": "al 3…", "all'8…". */
const data = (iso: string | Date | null | undefined, prep: "il" | "al" = "il") =>
  iso ? dataConArticolo(new Date(iso), { anno: true, prep }) : "";

function quandoVisto(iso: string | null): string {
  if (!iso) return "mai visto online";
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (giorni <= 0) return "online oggi";
  if (giorni === 1) return "online ieri";
  return `online ${giorni} giorni fa`;
}

/**
 * Il server manda l'email dell'abbonamento mascherata ("p•••@gmail.com").
 * È la stessa dell'account se coincidono prima lettera e dominio.
 */
function stessaEmail(dalServer: string, account: string): boolean {
  const a = normalizzaEmail(dalServer);
  const b = normalizzaEmail(account);
  if (!a || !b) return false;
  if (!a.includes("•")) return a === b;
  return a[0] === b[0] && a.split("@")[1] === b.split("@")[1];
}

/**
 * Gruppo "Abbonamento" della sezione Account Corioli.
 * Non compare finché il server non chiede la licenza.
 */
export default function BloccoAbbonamento({
  clientId,
  emailAccount,
}: {
  clientId: string | null;
  emailAccount: string;
}) {
  const { stato, licenza, apriDialogo, verifica } = useAbbonamento();
  const { showToast } = useToast();
  const [computer, setComputer] = useState<ElencoComputer | null>(null);
  const [mostraComputer, setMostraComputer] = useState(false);
  const [verificaInCorso, setVerificaInCorso] = useState(false);
  const [portaleInCorso, setPortaleInCorso] = useState(false);
  const [daScollegare, setDaScollegare] = useState<ComputerCollegato | null>(null);
  const [scollegaInCorso, setScollegaInCorso] = useState(false);

  const collegato = Boolean(licenza?.account);

  const caricaComputer = useCallback(async () => {
    if (!clientId || !collegato) {
      setComputer(null);
      return;
    }
    const esito = await elencoComputerCollegati(clientId);
    if (esito.ok) setComputer(esito.dati);
  }, [clientId, collegato]);

  useEffect(() => {
    void caricaComputer();
  }, [caricaComputer]);

  if (stato.tipo === "libero") return null;

  const verificaOra = async () => {
    setVerificaInCorso(true);
    const esito = await verifica();
    setVerificaInCorso(false);
    if (!esito.ok) showToast(esito.errore ?? "Verifica non riuscita.", "error");
    else void caricaComputer();
  };

  const apriPortale = async () => {
    if (!clientId) return;
    setPortaleInCorso(true);
    const esito = await apriGestioneAbbonamento(clientId);
    setPortaleInCorso(false);
    if (!esito.ok) showToast(esito.errore, "error");
  };

  const confermaScollega = async () => {
    if (!clientId || !daScollegare) return;
    setScollegaInCorso(true);
    const esito = await scollegaComputer(clientId, daScollegare.id);
    setScollegaInCorso(false);
    if (!esito.ok) {
      showToast(esito.errore, "error");
      return;
    }
    const eraQuesto = daScollegare.current;
    setDaScollegare(null);
    setComputer(esito.dati);
    showToast(eraQuesto ? "Questo computer non usa più l'abbonamento." : "Computer scollegato.", "success");
    await verifica();
  };

  let chip: { testo: string; colore: "success" | "warning" | "danger" | "default" };
  let descrizione: string;
  if (stato.tipo === "prova") {
    chip = { testo: "Prova gratuita", colore: "default" };
    descrizione = `${stato.giorniRimasti === 1 ? "Ultimo giorno" : `Mancano ${stato.giorniRimasti} giorni`}: la prova finisce ${data(stato.fineProva)}.`;
  } else if (stato.tipo === "attivo") {
    if (stato.pagamentoInRitardo) {
      chip = { testo: "Pagamento non riuscito", colore: "danger" };
      descrizione = "Stripe sta ritentando l'addebito: aggiorna la carta da Gestisci su Stripe.";
    } else if (stato.disdetto) {
      chip = { testo: "Disdetto", colore: "warning" };
      descrizione = stato.finoAl
        ? `Resta attivo fino ${data(stato.finoAl, "al")}, poi Corioli passa in sola lettura.`
        : "Disdetto.";
    } else {
      chip = { testo: "Attivo", colore: "success" };
      // Abbonati durante la prova: Stripe addebita solo quando la prova finisce.
      const primoAddebito = licenza?.subscription?.status === "trialing";
      descrizione = !stato.finoAl
        ? "Abbonamento attivo."
        : primoAddebito
          ? `Il primo addebito sarà ${data(stato.finoAl)}, alla fine della prova.`
          : `Si rinnova ${data(stato.finoAl)}.`;
    }
  } else {
    chip = { testo: "Sola lettura", colore: "warning" };
    descrizione = {
      prova_finita: "La prova gratuita è finita.",
      abbonamento_finito: "L'abbonamento è terminato.",
      pagamento_non_riuscito: "Il pagamento non è andato a buon fine.",
      verifica_necessaria: "L'abbonamento non si verifica da più di una settimana: collega il computer a internet.",
    }[stato.motivo];
    descrizione += " Puoi consultare, stampare ed esportare i dati; per modificarli serve l'abbonamento.";
  }

  const attivo = stato.tipo === "attivo";
  const emailAbbonamento = licenza?.account?.email ?? "";
  const intestatoAltrove = emailAbbonamento && !stessaEmail(emailAbbonamento, emailAccount);

  return (
    <GruppoAccount
      titolo="Abbonamento"
      spiegazione="I pagamenti passano da Stripe: Corioli non vede né conserva i dati della carta."
    >
      <RigaAccount
        icon={CreditCard}
        titolo={
          <span className="inline-flex flex-wrap items-center gap-2">
            Corioli
            <Chip size="sm" variant="flat" color={chip.colore}>
              {chip.testo}
            </Chip>
          </span>
        }
        descrizione={
          <>
            {descrizione}
            {intestatoAltrove ? <span className="block">Intestato a {emailAbbonamento}.</span> : null}
          </>
        }
        azioni={
          <>
            {attivo ? (
              <Button
                size="sm"
                // "flat" col primary del tema esce grigio e pare disattivato.
                className={stato.pagamentoInRitardo ? "bg-brand-700 text-white" : undefined}
                variant={stato.pagamentoInRitardo ? "solid" : "bordered"}
                onPress={() => void apriPortale()}
                isLoading={portaleInCorso}
                startContent={portaleInCorso ? undefined : <ExternalLink size={14} />}
              >
                Gestisci su Stripe
              </Button>
            ) : (
              <>
                <Button size="sm" className="bg-brand-700 text-white" onPress={() => apriDialogo("abbonati")}>
                  Abbonati
                </Button>
                <Button size="sm" variant="bordered" onPress={() => apriDialogo("collega")}>
                  Ho già un abbonamento
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="light"
              isIconOnly
              aria-label="Verifica lo stato dell'abbonamento"
              title="Verifica lo stato dell'abbonamento"
              onPress={() => void verificaOra()}
              isLoading={verificaInCorso}
            >
              <RefreshCw size={14} />
            </Button>
          </>
        }
      />

      {collegato && attivo ? (
        <RigaAccount
          icon={Laptop}
          titolo={
            computer
              ? `Usato su ${computer.computers.length} computer su ${computer.maxComputers}`
              : "Computer collegati"
          }
          descrizione="Per usarlo su un altro computer, lì apri Impostazioni → Account Corioli → Ho già un abbonamento."
          azioni={
            <Button
              size="sm"
              variant="light"
              onPress={() => setMostraComputer((v) => !v)}
              endContent={
                <ChevronDown size={14} className={`transition-transform ${mostraComputer ? "rotate-180" : ""}`} />
              }
            >
              {mostraComputer ? "Nascondi" : "Vedi"}
            </Button>
          }
        >
          {mostraComputer ? (
            !computer ? (
              <Spinner size="sm" />
            ) : (
              <ul className="divide-y divide-default-100 rounded-xl border border-default-200">
                {computer.computers.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {c.current ? "Questo computer" : `Collegato ${data(c.linkedAt)}`}
                      </p>
                      <p className="text-xs text-default-500">
                        {quandoVisto(c.lastSeenAt)}
                        {c.version ? ` · Corioli ${c.version}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="light" color="danger" onPress={() => setDaScollegare(c)}>
                      Scollega
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </RigaAccount>
      ) : null}

      <ConfirmDangerModal
        isOpen={daScollegare !== null}
        onClose={() => setDaScollegare(null)}
        title={daScollegare?.current ? "Scollegare questo computer?" : "Scollegare il computer?"}
        subtitle="Potrai ricollegarlo con un codice via email"
        confirmLabel="Scollega"
        onConfirm={() => void confermaScollega()}
        isLoading={scollegaInCorso}
      >
        <p className="text-sm text-gray-700">
          {daScollegare?.current
            ? "Questo computer smetterà di usare l'abbonamento: finita la prova gratuita, Corioli qui passerà in sola lettura. I dati restano sul computer."
            : "Quel computer smetterà di usare l'abbonamento e, finita la sua prova gratuita, passerà in sola lettura. Si libera un posto per un altro computer."}
        </p>
      </ConfirmDangerModal>
    </GruppoAccount>
  );
}
