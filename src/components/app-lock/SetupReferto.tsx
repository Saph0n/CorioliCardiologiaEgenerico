import { Autocomplete, AutocompleteItem, Input } from "@nextui-org/react";
import { Briefcase } from "lucide-react";
import type { TitoloMedico } from "../../types/Storage";
import { TITOLI_MEDICO } from "../../utils/doctorProfile";
import { normalizzaPartitaIva, validatePartitaIva } from "../../utils/formValidation";
import {
  titoloDaSpecializzazione,
  titoloReferto,
  TITOLI_REFERTO_PROPOSTI,
} from "../../utils/titoloReferto";

/**
 * Dott., Dott.ssa, Prof., Prof.ssa: quattro pulsanti affiancati, uno scelto.
 * Nel primo passo della configurazione, sopra nome e cognome: e' come il
 * medico verra' salutato e come firmera' i documenti.
 */
export function TitoloSelettore({
  valore,
  onChange,
}: {
  valore: TitoloMedico;
  onChange: (t: TitoloMedico) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-foreground">Titolo</p>
      <div role="radiogroup" aria-label="Titolo" className="grid grid-cols-4 gap-2">
        {TITOLI_MEDICO.map((t) => {
          const scelto = t === valore;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={scelto}
              onClick={() => onChange(t)}
              className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${
                scelto
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-default-300 bg-white text-default-700 hover:border-default-400"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Il passo "Il tuo referto" della prima configurazione: partita IVA
 * (facoltativa) e titolo del referto, con l'anteprima di come comincera' il
 * foglio. Le due cose prima si scoprivano solo dopo, nelle impostazioni, a
 * referto gia' stampato (Pablo, 8 ottobre 2026).
 */
export function SetupReferto({
  titolo,
  nome,
  cognome,
  specializzazione,
  partitaIva,
  erroreIva,
  titoloRefertoScelto,
  onPartitaIva,
  onTitoloReferto,
  onBlurIva,
}: {
  titolo: TitoloMedico;
  nome: string;
  cognome: string;
  specializzazione: string;
  partitaIva: string;
  erroreIva: string | null;
  titoloRefertoScelto: string;
  onPartitaIva: (v: string) => void;
  onTitoloReferto: (v: string) => void;
  onBlurIva: () => void;
}) {
  const automatico = titoloDaSpecializzazione(specializzazione);
  const titoloStampato = titoloReferto(titoloRefertoScelto, specializzazione);
  // In anteprima solo una partita IVA valida, come verra' salvata.
  const iva = validatePartitaIva(partitaIva) ? "" : normalizzaPartitaIva(partitaIva);

  return (
    <div className="flex flex-col gap-5">
      <Autocomplete
        data-campo="titoloReferto"
        label="Titolo del referto"
        labelPlacement="outside"
        // Vuoto vale il titolo ricavato dalla specializzazione, scritto qui
        // come segnaposto; l'anteprima sotto mostra comunque quello che esce.
        placeholder={`Automatico: ${automatico}`}
        allowsCustomValue
        inputValue={titoloRefertoScelto}
        onInputChange={onTitoloReferto}
        onSelectionChange={(key) => {
          if (key != null) onTitoloReferto(String(key));
        }}
        variant="bordered"
        maxLength={40}
        listboxProps={{ emptyContent: "Nessun titolo nell'elenco: si usa quello scritto." }}
      >
        {TITOLI_REFERTO_PROPOSTI.map((t) => (
          <AutocompleteItem key={t}>{t}</AutocompleteItem>
        ))}
      </Autocomplete>

      <Input
        data-campo="partitaIva"
        label="Partita IVA (facoltativa)"
        labelPlacement="outside"
        placeholder="11 cifre"
        value={partitaIva}
        onValueChange={onPartitaIva}
        onBlur={onBlurIva}
        isInvalid={Boolean(erroreIva)}
        errorMessage={erroreIva ?? undefined}
        variant="bordered"
        inputMode="numeric"
        maxLength={16}
        endContent={
          <span className="onboarding-field-icon">
            <Briefcase size={16} />
          </span>
        }
      />

      {/* L'inizio del referto com'e' davvero: stesso carattere del PDF,
          nessun colore, la fascia grigia del titolo. */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-foreground">Così inizierà il tuo referto</p>
        <div className="setup-anteprima" aria-label="Anteprima dell'intestazione del referto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="setup-anteprima-nome">
                {`${titolo} ${nome} ${cognome}`.trim()}
              </p>
              <p className="setup-anteprima-riga">{specializzazione}</p>
            </div>
            {iva && <p className="setup-anteprima-riga shrink-0">P.IVA {iva}</p>}
          </div>
          <div className="setup-anteprima-filetto" />
          <p className="setup-anteprima-titolo">{titoloStampato.toUpperCase()}</p>
        </div>
      </div>
    </div>
  );
}
