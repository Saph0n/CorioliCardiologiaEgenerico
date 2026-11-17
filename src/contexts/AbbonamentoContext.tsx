import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  EVENTO_LICENZA,
  aggiornaLicenza,
  calcolaStatoAbbonamento,
  leggiLicenzaSalvata,
  type LicenzaServer,
} from "../services/AbbonamentoService";
import { EVENTO_SCRITTURA_BLOCCATA, impostaSolaLettura } from "../services/StorageServiceFallback";
import { DoctorService } from "../services/OfflineServices";
import DialogoAbbonamento, { type ModoDialogo } from "../components/abbonamento/DialogoAbbonamento";
import AvvisoFineProva from "../components/abbonamento/AvvisoFineProva";
import { AbbonamentoContext } from "./useAbbonamento";

/** Tiene lo stato dell'abbonamento, la sola lettura dell'archivio e la finestra per abbonarsi. */
export function AbbonamentoProvider({ children }: { children: ReactNode }) {
  const [licenza, setLicenza] = useState<LicenzaServer | null>(null);
  const [adesso, setAdesso] = useState(() => new Date());
  const [dialogo, setDialogo] = useState<ModoDialogo | null>(null);

  useEffect(() => {
    let vivo = true;
    void leggiLicenzaSalvata().then((salvata) => {
      if (vivo) setLicenza(salvata);
    });
    const suLicenza = (e: Event) => {
      setLicenza((e as CustomEvent<LicenzaServer>).detail ?? null);
      setAdesso(new Date());
    };
    // Una scrittura rifiutata spiega perché, invece del solo "errore nel salvataggio".
    const suScritturaBloccata = () => setDialogo((aperto) => aperto ?? "sola-lettura");
    window.addEventListener(EVENTO_LICENZA, suLicenza);
    window.addEventListener(EVENTO_SCRITTURA_BLOCCATA, suScritturaBloccata);
    // La prova può finire con l'app aperta.
    const timer = window.setInterval(() => setAdesso(new Date()), 60_000);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_LICENZA, suLicenza);
      window.removeEventListener(EVENTO_SCRITTURA_BLOCCATA, suScritturaBloccata);
      window.clearInterval(timer);
    };
  }, []);

  const stato = useMemo(() => calcolaStatoAbbonamento(licenza, adesso), [licenza, adesso]);
  const solaLettura = stato.tipo === "scaduto";

  useEffect(() => {
    impostaSolaLettura(solaLettura);
  }, [solaLettura]);

  const verifica = useCallback(async () => {
    const doctor = await DoctorService.getDoctor();
    const id = doctor?.id?.trim();
    if (!id) return { ok: false, errore: "Completa prima il profilo medico in Impostazioni." };
    const esito = await aggiornaLicenza(id);
    return esito.ok ? { ok: true } : { ok: false, errore: esito.errore };
  }, []);

  // Tornando su Corioli (per esempio dal portale Stripe dopo una disdetta o un
  // cambio carta) si rilegge lo stato, senza aspettare il prossimo controllo.
  const abbonamentoRichiesto = Boolean(licenza?.required);
  useEffect(() => {
    if (!abbonamentoRichiesto) return;
    let ultimo = Date.now();
    const suFocus = () => {
      if (Date.now() - ultimo < 30_000) return;
      ultimo = Date.now();
      void verifica();
    };
    window.addEventListener("focus", suFocus);
    return () => window.removeEventListener("focus", suFocus);
  }, [abbonamentoRichiesto, verifica]);

  const apriDialogo = useCallback((modo: ModoDialogo = "abbonati") => setDialogo(modo), []);

  const valore = useMemo(
    () => ({ stato, licenza, solaLettura, verifica, apriDialogo }),
    [stato, licenza, solaLettura, verifica, apriDialogo],
  );

  return (
    <AbbonamentoContext.Provider value={valore}>
      {children}
      <AvvisoFineProva stato={stato} bloccato={dialogo !== null} onAbbonati={() => setDialogo("abbonati")} />
      {dialogo ? (
        <DialogoAbbonamento
          modoIniziale={dialogo}
          stato={stato}
          verifica={verifica}
          onClose={() => setDialogo(null)}
        />
      ) : null}
    </AbbonamentoContext.Provider>
  );
}
