import { Button, Input } from "@nextui-org/react";
import { ArrowDown, ArrowUp, Check, EyeOff, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { ModelloStampa } from "../../types/Storage";
import type { ZonaStampa } from "../../services/PdfService";
import { titoloPredefinitoSezione } from "../../utils/modelliStampa";
import type { CambiaModello } from "./PannelloModello";

/**
 * La barra che compare sul foglio, accanto alla parte toccata, con le
 * modifiche che si fanno piu' spesso: si cambia la cosa dove la si vede, senza
 * cercarla nel pannello. Il pannello resta per tutto il resto ("Altre
 * opzioni").
 */

function Pulsanti<T extends string>({
  valore,
  voci,
  onScegli,
}: {
  valore: T;
  voci: { valore: T; nome: string }[];
  onScegli: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border-2 border-default-200" role="radiogroup">
      {voci.map((v, i) => {
        const scelto = v.valore === valore;
        return (
          <button
            key={v.valore}
            type="button"
            role="radio"
            aria-checked={scelto}
            onClick={() => onScegli(v.valore)}
            className={[
              "min-h-[40px] whitespace-nowrap px-3 text-[15px] transition-colors",
              i > 0 ? "border-l-2 border-default-200" : "",
              scelto ? "bg-brand-50 font-semibold text-brand-800" : "bg-white font-medium text-default-700 hover:bg-default-50",
            ].join(" ")}
          >
            {v.nome}
          </button>
        );
      })}
    </div>
  );
}

function Spunta({ nome, acceso, onCambia }: { nome: string; acceso: boolean; onCambia: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={acceso}
      onClick={() => onCambia(!acceso)}
      className={[
        "inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-3 text-[15px] transition-colors",
        acceso
          ? "border-brand-600 bg-brand-50 font-semibold text-brand-800"
          : "border-default-200 bg-white font-medium text-default-500 hover:border-default-400",
      ].join(" ")}
    >
      {acceso && <Check size={16} />}
      {nome}
    </button>
  );
}

interface Props {
  zona: ZonaStampa;
  modello: ModelloStampa;
  onCambia: CambiaModello;
  /** Porta al pannello sulle impostazioni complete di questa parte. */
  onAltreOpzioni: () => void;
}

export function StrumentiZona({ zona, modello: m, onCambia, onAltreOpzioni }: Props) {
  const altre = (
    <Button
      variant="light"
      startContent={<SlidersHorizontal size={16} />}
      onPress={onAltreOpzioni}
      className="text-default-600"
    >
      Altre opzioni
    </Button>
  );

  let contenuto: ReactNode = null;
  switch (zona.zona) {
    case "sezione": {
      if (m.documento !== "referto" || !zona.sezione) {
        contenuto = (
          <Pulsanti
            valore={m.pagina.testo}
            onScegli={(v) => onCambia((x) => { x.pagina.testo = v; })}
            voci={[
              { valore: "piccolo", nome: "Testo piccolo" },
              { valore: "normale", nome: "Normale" },
              { valore: "grande", nome: "Grande" },
            ]}
          />
        );
        break;
      }
      const id = zona.sezione;
      const i = m.sezioni.findIndex((s) => s.id === id);
      if (i < 0) break;
      const sposta = (a: number) => onCambia((x) => {
        const da = x.sezioni.findIndex((s) => s.id === id);
        if (a < 0 || a >= x.sezioni.length) return;
        const [voce] = x.sezioni.splice(da, 1);
        x.sezioni.splice(a, 0, voce);
      });
      contenuto = (
        <>
          <Input
            size="md"
            aria-label="Titolo della sezione"
            placeholder={titoloPredefinitoSezione(id)}
            value={m.sezioni[i].titolo}
            onValueChange={(v) => onCambia((x) => {
              const voce = x.sezioni.find((s) => s.id === id);
              if (voce) voce.titolo = v;
            }, `sezione-${id}`)}
            className="w-64"
            classNames={{ input: "text-[15px]" }}
          />
          <Button isIconOnly variant="flat" aria-label="Sposta su" title="Sposta su" isDisabled={i === 0} onPress={() => sposta(i - 1)}>
            <ArrowUp size={18} />
          </Button>
          <Button
            isIconOnly
            variant="flat"
            aria-label="Sposta giù"
            title="Sposta giù"
            isDisabled={i === m.sezioni.length - 1}
            onPress={() => sposta(i + 1)}
          >
            <ArrowDown size={18} />
          </Button>
          <Button
            variant="flat"
            color="warning"
            startContent={<EyeOff size={18} />}
            onPress={() => onCambia((x) => {
              const voce = x.sezioni.find((s) => s.id === id);
              if (voce) voce.visibile = false;
            })}
          >
            Nascondi
          </Button>
        </>
      );
      break;
    }
    case "titolo":
      contenuto = (
        <Input
          size="md"
          aria-label="Titolo del documento"
          value={m.titolo.testo}
          onValueChange={(v) => onCambia((x) => { x.titolo.testo = v; }, "titolo")}
          className="w-72"
          classNames={{ input: "text-[15px] font-semibold" }}
        />
      );
      break;
    case "intestazione":
      contenuto = m.intestazione.cartaIntestata ? (
        <span className="px-1 text-[15px] text-default-700">
          {m.intestazione.sfondoInStampa ? "Carta intestata digitale" : "Spazio per la carta già intestata"}:
          {" "}{m.intestazione.spazioAlto} mm in alto
        </span>
      ) : (
        <Pulsanti
          valore={m.intestazione.disposizione}
          onScegli={(v) => onCambia((x) => { x.intestazione.disposizione = v; })}
          voci={[
            { valore: "lati", nome: "Nome a sinistra" },
            { valore: "centro", nome: "Al centro" },
            { valore: "banda", nome: "Su banda" },
          ]}
        />
      );
      break;
    case "paziente":
      contenuto = (
        <>
          <Spunta
            nome="Nascita"
            acceso={m.paziente.dataNascita}
            onCambia={(v) => onCambia((x) => { x.paziente.dataNascita = v; })}
          />
          <Spunta
            nome="Sesso"
            acceso={m.paziente.sesso}
            onCambia={(v) => onCambia((x) => { x.paziente.sesso = v; })}
          />
          <Spunta
            nome="Codice fiscale"
            acceso={m.paziente.codiceFiscale}
            onCambia={(v) => onCambia((x) => { x.paziente.codiceFiscale = v; })}
          />
          <Spunta
            nome="Residenza"
            acceso={m.paziente.residenza}
            onCambia={(v) => onCambia((x) => { x.paziente.residenza = v; })}
          />
        </>
      );
      break;
    case "firma":
      contenuto = (
        <Pulsanti
          valore={m.firma.posizione}
          onScegli={(v) => onCambia((x) => { x.firma.posizione = v; })}
          voci={[
            { valore: "sinistra", nome: "A sinistra" },
            { valore: "centro", nome: "Al centro" },
            { valore: "destra", nome: "A destra" },
          ]}
        />
      );
      break;
    case "piede":
      contenuto = (
        <Input
          size="md"
          aria-label="Testo in fondo alla pagina"
          placeholder="Testo in fondo alla pagina"
          value={m.piede.testo.split("\n")[0] ?? ""}
          onValueChange={(v) => onCambia((x) => {
            // Qui si scrive la prima riga; la seconda, se c'e', resta.
            const righe = x.piede.testo.split("\n");
            righe[0] = v;
            x.piede.testo = righe.join("\n").replace(/\n$/, "");
          }, "piede")}
          className="w-80"
          classNames={{ input: "text-[15px]" }}
        />
      );
      break;
  }

  if (!contenuto) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {contenuto}
      {altre}
    </div>
  );
}
