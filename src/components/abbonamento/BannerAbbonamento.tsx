import { useState, type ReactNode } from "react";
import { Button } from "@nextui-org/react";
import { BookOpen, Clock, CreditCard, X } from "lucide-react";
import { useAbbonamento } from "../../contexts/useAbbonamento";
import { useToast } from "../../contexts/ToastContext";
import { DoctorService } from "../../services/OfflineServices";
import { apriGestioneAbbonamento, dataConArticolo, scadenzaInArrivo } from "../../services/AbbonamentoService";

const GIORNI_PREAVVISO = 7;

type Tono = "avviso" | "info" | "urgente";

const TONI: Record<Tono, string> = {
  avviso: "border-amber-200 bg-amber-50 text-amber-950",
  info: "border-brand-200 bg-brand-50 text-brand-900",
  urgente: "border-rose-200 bg-rose-50 text-rose-950",
};

/** Verde fino a 4 giorni, giallo a 3-2, rosso all'ultimo giorno. */
function tonoFineProva(giorniRimasti: number): Tono {
  if (giorniRimasti <= 1) return "urgente";
  if (giorniRimasti <= 3) return "avviso";
  return "info";
}

// Chiusa con la X: resta nascosta finché Corioli è aperto, alla riapertura torna.
let provaChiusaInSessione = false;

function Striscia({
  tono,
  icona,
  children,
  azioni,
  onChiudi,
}: {
  tono: Tono;
  icona: ReactNode;
  children: ReactNode;
  azioni: ReactNode;
  onChiudi?: () => void;
}) {
  return (
    <div
      role="status"
      className={`mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm ${TONI[tono]}`}
    >
      <span className="shrink-0">{icona}</span>
      <p className="min-w-[16rem] flex-1">{children}</p>
      <div className="flex flex-wrap items-center gap-2">
        {azioni}
        {onChiudi ? (
          <button
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi l'avviso"
            title="Chiudi (ricompare alla prossima apertura di Corioli)"
            className="rounded-lg p-1.5 opacity-60 transition hover:bg-black/5 hover:opacity-100"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Avviso in cima alle pagine: sola lettura, prova agli ultimi giorni, pagamento non riuscito. */
export default function BannerAbbonamento() {
  const { stato, apriDialogo, verifica } = useAbbonamento();
  const { showToast } = useToast();
  const [inCorso, setInCorso] = useState(false);
  const [provaChiusa, setProvaChiusa] = useState(provaChiusaInSessione);

  const apriPortale = async () => {
    setInCorso(true);
    const doctor = await DoctorService.getDoctor();
    const esito = doctor?.id ? await apriGestioneAbbonamento(doctor.id) : null;
    setInCorso(false);
    if (esito && !esito.ok) showToast(esito.errore, "error");
  };

  const verificaOra = async () => {
    setInCorso(true);
    const esito = await verifica();
    setInCorso(false);
    showToast(esito.ok ? "Stato dell'abbonamento aggiornato." : esito.errore ?? "Verifica non riuscita.", esito.ok ? "success" : "error");
  };

  if (stato.tipo === "scaduto") {
    const motivo = {
      prova_finita: "La prova gratuita è finita.",
      abbonamento_finito: "L'abbonamento è terminato.",
      pagamento_non_riuscito: "Il pagamento dell'abbonamento non è andato a buon fine.",
      verifica_necessaria:
        "Da più di una settimana Corioli non riesce a verificare l'abbonamento: collega il computer a internet.",
    }[stato.motivo];
    const invito =
      stato.motivo === "prova_finita"
        ? "Per aggiungere pazienti e visite abbonati."
        : "Per aggiungere pazienti e visite riattiva l'abbonamento.";
    return (
      <Striscia
        // Dopo il verde, il giallo e il rosso della prova, la scadenza resta rossa:
        // in verde sembrerebbe che vada tutto bene.
        tono={stato.motivo === "verifica_necessaria" ? "avviso" : "urgente"}
        icona={<BookOpen size={18} />}
        azioni={
          stato.motivo === "verifica_necessaria" ? (
            <Button size="sm" color="primary" onPress={() => void verificaOra()} isLoading={inCorso}>
              Verifica ora
            </Button>
          ) : (
            <>
              <Button size="sm" variant="flat" onPress={() => apriDialogo("collega")}>
                Ho già un abbonamento
              </Button>
              <Button size="sm" color="primary" onPress={() => apriDialogo("abbonati")}>
                Abbonati
              </Button>
            </>
          )
        }
      >
        <strong className="font-semibold">{motivo}</strong> I tuoi dati sono al sicuro e puoi sempre
        consultarli, stamparli ed esportarli. {stato.motivo === "verifica_necessaria" ? null : invito}
      </Striscia>
    );
  }

  if (stato.tipo === "prova" && stato.giorniRimasti <= GIORNI_PREAVVISO) {
    // L'ultimo giorno l'avviso resta: niente X, e torna anche se era stato chiuso prima.
    const ultimoGiorno = stato.giorniRimasti <= 1;
    if (provaChiusa && !ultimoGiorno) return null;
    return (
      <Striscia
        tono={tonoFineProva(stato.giorniRimasti)}
        icona={<Clock size={18} />}
        onChiudi={
          ultimoGiorno
            ? undefined
            : () => {
                provaChiusaInSessione = true;
                setProvaChiusa(true);
              }
        }
        azioni={
          <Button size="sm" color="primary" onPress={() => apriDialogo("abbonati")}>
            Abbonati
          </Button>
        }
      >
        {stato.giorniRimasti === 1
          ? "La prova gratuita finisce domani."
          : `La prova gratuita finisce tra ${stato.giorniRimasti} giorni, ${dataConArticolo(stato.fineProva)}.`}{" "}
        Abbonandoti ora non paghi nulla fino ad allora.
      </Striscia>
    );
  }

  if (stato.tipo === "attivo" && stato.pagamentoInRitardo) {
    return (
      <Striscia
        tono="avviso"
        icona={<CreditCard size={18} />}
        azioni={
          <Button size="sm" variant="bordered" onPress={() => void apriPortale()} isLoading={inCorso}>
            Aggiorna il pagamento
          </Button>
        }
      >
        Il rinnovo dell&apos;abbonamento non è riuscito, per esempio perché la carta è scaduta. Corioli
        funziona normalmente: aggiorna il metodo di pagamento quando puoi.
      </Striscia>
    );
  }

  const fineAbbonamento = scadenzaInArrivo(stato);
  if (fineAbbonamento?.tipo === "abbonamento" && fineAbbonamento.giorni <= GIORNI_PREAVVISO) {
    const ultimoGiorno = fineAbbonamento.giorni <= 1;
    if (provaChiusa && !ultimoGiorno) return null;
    return (
      <Striscia
        tono={tonoFineProva(fineAbbonamento.giorni)}
        icona={<Clock size={18} />}
        onChiudi={
          ultimoGiorno
            ? undefined
            : () => {
                provaChiusaInSessione = true;
                setProvaChiusa(true);
              }
        }
        azioni={
          <Button size="sm" color="primary" onPress={() => void apriPortale()} isLoading={inCorso}>
            Riattiva
          </Button>
        }
      >
        {ultimoGiorno
          ? "Il tuo abbonamento disdetto finisce domani."
          : `Il tuo abbonamento disdetto finisce tra ${fineAbbonamento.giorni} giorni, ${dataConArticolo(fineAbbonamento.fine)}.`}{" "}
        Riattivalo per continuare senza interruzioni: dopo, Corioli resta in sola lettura.
      </Striscia>
    );
  }

  return null;
}
