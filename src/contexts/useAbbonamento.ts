import { createContext, useContext } from "react";
import type { LicenzaServer, StatoAbbonamento } from "../services/AbbonamentoService";
import type { ModoDialogo } from "../components/abbonamento/DialogoAbbonamento";

/**
 * Stato dell'abbonamento per tutta l'app. Il provider sta in
 * `AbbonamentoContext.tsx`: context e hook stanno qui, in un modulo senza
 * componenti, così il ricaricamento a caldo non li duplica.
 */
export interface ValoreAbbonamento {
  stato: StatoAbbonamento;
  licenza: LicenzaServer | null;
  /** Abbonamento scaduto: si consulta e si esporta, non si modifica. */
  solaLettura: boolean;
  /** Rilegge lo stato dal server, riallineato con Stripe. */
  verifica: () => Promise<{ ok: boolean; errore?: string }>;
  /** Apre la finestra per abbonarsi o per collegare questo computer. */
  apriDialogo: (modo?: ModoDialogo) => void;
}

export const AbbonamentoContext = createContext<ValoreAbbonamento>({
  stato: { tipo: "libero" },
  licenza: null,
  solaLettura: false,
  verifica: async () => ({ ok: false }),
  apriDialogo: () => {},
});

export function useAbbonamento(): ValoreAbbonamento {
  return useContext(AbbonamentoContext);
}
