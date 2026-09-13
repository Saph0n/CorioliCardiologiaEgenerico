import {
  Button,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
} from "@nextui-org/react";

import { AppModal } from "../AppModal";
import type { CategoriaRischioCv } from "../../utils/rischioCv";
import {
  CONFRONTO_FARMACI,
  CRITERI_RISCHIO_ESC,
  PILASTRI_SCOMPENSO,
  PROFILI_COLCHICINA,
  SCHEDA_COLCHICINA,
  SCHEDA_ICOSAPENT,
  colonnaPilastri,
  criteriIcosapentEtile,
  type Criterio,
  type StatoCriterio,
} from "../../utils/terapieCardio";
import {
  CLASSI_NYHA,
  CONTESTO_BNP_LABELS,
  FASCE_ETA_CONFERMA_ACUTO,
  FENOTIPI_SCOMPENSO,
  NYHA_LABELS,
  NYHA_SIGLE,
  SOGLIA_ESCLUSIONE_NTPROBNP,
  fenotipoDaFe,
  sogliaConfermaAcuto,
  type ClasseNyha,
  type ContestoBnp,
} from "../../utils/scompenso";

/**
 * Prontuario di consultazione: quattro pilastri dello scompenso, icosapent
 * etile, colchicina. Le tabelle della TC coronarica stanno in un prontuario a
 * parte, `ProntuarioImagingModal`: il cardiologo le ha volute separate dai
 * farmaci (call dell'11 settembre 2026).
 *
 * Sta in un modal e non fra le sezioni del referto perche' non e' contenuto del
 * referto: e' materiale da guardare mentre si scrive, come si aprirebbe un
 * prontuario sulla scrivania. Per lo stesso motivo non finisce nel PDF.
 *
 * Dove l'applicazione ha gia' il dato — frazione di eiezione, trigliceridi,
 * classe di rischio — lo colloca rispetto al criterio. Non conclude mai che il
 * paziente sia candidato a un farmaco: vedi la testata di `terapieCardio.ts`.
 */
export function ProntuarioModal({
  isOpen,
  onClose,
  fe,
  trigliceridi,
  categoriaRischio,
  nyha,
  tabIniziale,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Frazione di eiezione della visita, per sapere quale colonna leggere. */
  fe?: number;
  trigliceridi?: number;
  categoriaRischio?: CategoriaRischioCv | "";
  /** Classe NYHA della visita: evidenzia la riga nelle classi di scompenso. */
  nyha?: ClasseNyha | "";
  /**
   * Scheda da cui partire: chi apre il prontuario dal modulo dello scompenso
   * vuole le classi, non i pilastri.
   */
  tabIniziale?: string;
}) {
  const colonna = colonnaPilastri(fe);
  const criteri = criteriIcosapentEtile({ trigliceridi, categoriaRischio });

  return (
    <AppModal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex-col items-start gap-0">
          <span className="text-base font-semibold">Prontuario</span>
          <span className="text-xs font-normal text-default-500">
            Criteri delle linee guida da consultare. Non è un suggeritore di
            terapia: la scelta resta clinica.
          </span>
        </ModalHeader>
        <ModalBody className="pb-2">
          <Tabs
            key={tabIniziale}
            defaultSelectedKey={tabIniziale}
            aria-label="Schede del prontuario"
            size="sm"
            variant="underlined"
          >
            <Tab key="pilastri" title="Scompenso: 4 pilastri">
              <Pilastri colonna={colonna} />
            </Tab>
            <Tab key="classi" title="Scompenso: classi">
              <ClassiScompenso fe={fe} nyha={nyha} />
            </Tab>
            <Tab key="icosapent" title="Icosapent etile">
              <Icosapent criteri={criteri} />
            </Tab>
            <Tab key="colchicina" title="Colchicina">
              <Colchicina />
            </Tab>
            <Tab key="confronto" title="Confronto">
              <Confronto />
            </Tab>
            <Tab key="rischio" title="Classi di rischio">
              <ClassiRischio />
            </Tab>
          </Tabs>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose}>
            Chiudi
          </Button>
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}

// ─── Scompenso: i quattro pilastri ───────────────────────────────────────────

function Pilastri({
  colonna,
}: {
  colonna: ReturnType<typeof colonnaPilastri>;
}) {
  return (
    <div className="space-y-3">
      {/* Senza FE non si evidenzia nessuna colonna: mostrarle come equivalenti
          sarebbe peggio che non evidenziarne nessuna. */}
      <p className="text-xs text-default-500">
        {colonna
          ? `Frazione di eiezione di questa visita: ${colonna.titolo}. La colonna corrispondente è evidenziata.`
          : "Senza frazione di eiezione nell'ecocardiogramma nessuna delle due colonne è evidenziata."}
      </p>

      {PILASTRI_SCOMPENSO.map((p) => (
        <div
          key={p.classe}
          className="rounded-lg border border-default-200 bg-default-50/50 px-3 py-2.5"
        >
          <p className="text-sm font-semibold text-gray-800">{p.classe}</p>
          <p className="mt-0.5 text-xs text-default-600">{p.indicazione}</p>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["feRidotta", "feConservata"] as const).map((chiave) => {
              const v = p[chiave];
              const attiva = colonna?.chiave === chiave;
              return (
                <div
                  key={chiave}
                  className={`rounded-md border px-2.5 py-2 ${
                    attiva
                      ? "border-primary-300 bg-primary-50"
                      : "border-default-200 bg-white"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      {chiave === "feRidotta" ? "FE < 50%" : "FE ≥ 50%"}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        v.stato === "si" ? "text-success-600" : "text-warning-600"
                      }`}
                    >
                      {v.stato === "si" ? "Sì" : "Selettivo"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-default-600">{v.nota}</p>
                </div>
              );
            })}
          </div>

          <dl className="mt-2 space-y-1 border-t border-default-200/70 pt-2">
            <Riga termine="Quando iniziare" testo={p.quando} />
            <Riga termine="Dose iniziale" testo={p.doseIniziale} />
            <Riga termine="Attenzioni" testo={p.attenzioni} />
          </dl>
        </div>
      ))}
    </div>
  );
}

function Riga({ termine, testo }: { termine: string; testo: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <dt className="text-xs font-semibold text-default-500">{termine}</dt>
      <dd className="text-xs text-default-700">{testo}</dd>
    </div>
  );
}

// ─── Scompenso: classi ───────────────────────────────────────────────────────

/**
 * Le classi con cui si descrive uno scompenso: fenotipo per frazione di
 * eiezione, classe funzionale NYHA e soglie dell'NT-proBNP.
 *
 * Chieste dal cardiologo il 12 settembre 2026. Sono le stesse fasce che
 * l'applicazione applica nella maschera, prese dalle stesse costanti: qui si
 * leggono tutte insieme, comprese quelle che il paziente in visita non ha.
 */
function ClassiScompenso({ fe, nyha }: { fe?: number; nyha?: ClasseNyha | "" }) {
  const fenotipoCorrente = fenotipoDaFe(fe)?.chiave;
  const contesti = Object.keys(CONTESTO_BNP_LABELS) as ContestoBnp[];

  return (
    <div className="space-y-4">
      <section>
        <p className="text-sm font-semibold text-gray-800">
          Fenotipo per frazione di eiezione
        </p>
        <p className="text-xs text-default-500">
          {fenotipoCorrente
            ? "La riga del paziente in visita è evidenziata."
            : "Senza frazione di eiezione nell'ecocardiogramma nessuna riga è evidenziata."}
        </p>
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-default-200">
              <th className="py-1.5 pr-3 text-xs font-semibold text-default-500">
                Fenotipo
              </th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-800">
                Frazione di eiezione
              </th>
              <th className="py-1.5 text-xs font-semibold text-gray-800">Nota</th>
            </tr>
          </thead>
          <tbody>
            {FENOTIPI_SCOMPENSO.map((f) => (
              <tr
                key={f.chiave}
                className={`border-b border-default-100 align-top ${
                  f.chiave === fenotipoCorrente ? "bg-primary-50" : ""
                }`}
              >
                <td className="whitespace-nowrap py-2 pl-1 pr-3 text-xs font-semibold text-default-500">
                  {f.chiave}
                </td>
                <td className="py-2 pr-3 text-xs text-default-700">{f.intervallo}</td>
                <td className="py-2 text-xs text-default-600">{f.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <p className="text-sm font-semibold text-gray-800">Classe funzionale NYHA</p>
        <table className="mt-2 w-full border-collapse text-left">
          <tbody>
            {CLASSI_NYHA.map((c) => (
              <tr
                key={c}
                className={`border-b border-default-100 align-top ${
                  c === nyha ? "bg-primary-50" : ""
                }`}
              >
                <td className="whitespace-nowrap py-2 pl-1 pr-3 text-xs font-semibold text-default-500">
                  {NYHA_SIGLE[c]}
                </td>
                {/* L'etichetta porta davanti il numero romano, che sta già
                    nella colonna a sinistra. */}
                <td className="py-2 text-xs text-default-700">
                  {NYHA_LABELS[c].replace(/^[IV]+ — /, "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <p className="text-sm font-semibold text-gray-800">NT-proBNP</p>
        <p className="text-xs text-default-500">
          Sotto la soglia di esclusione lo scompenso è improbabile. In
          ambulatorio non c&apos;è una soglia di conferma: sopra si prosegue con
          l&apos;ecocardiogramma.
        </p>
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-default-200">
              <th className="py-1.5 pr-3 text-xs font-semibold text-default-500">
                Contesto del prelievo
              </th>
              <th className="py-1.5 text-xs font-semibold text-gray-800">
                Soglia di esclusione
              </th>
            </tr>
          </thead>
          <tbody>
            {contesti.map((c) => (
              <tr key={c} className="border-b border-default-100 align-top">
                <td className="py-2 pl-1 pr-3 text-xs text-default-700">
                  {CONTESTO_BNP_LABELS[c]}
                </td>
                <td className="py-2 text-xs font-semibold text-gray-800">
                  &lt; {SOGLIA_ESCLUSIONE_NTPROBNP[c]} pg/mL
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-default-200">
              <th className="py-1.5 pr-3 text-xs font-semibold text-default-500">
                Conferma in urgenza, per età
              </th>
              <th className="py-1.5 text-xs font-semibold text-gray-800">Soglia</th>
            </tr>
          </thead>
          <tbody>
            {FASCE_ETA_CONFERMA_ACUTO.map((f) => (
              <tr key={f.fascia} className="border-b border-default-100 align-top">
                <td className="py-2 pl-1 pr-3 text-xs text-default-700">{f.fascia}</td>
                <td className="py-2 text-xs font-semibold text-gray-800">
                  &gt; {sogliaConfermaAcuto(f.etaRappresentativa)} pg/mL
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ─── Icosapent etile ─────────────────────────────────────────────────────────

const SEGNO_CRITERIO: Record<StatoCriterio, { segno: string; classe: string }> = {
  soddisfatto: { segno: "✓", classe: "text-success-600" },
  "non-soddisfatto": { segno: "✕", classe: "text-danger-500" },
  "da-verificare": { segno: "?", classe: "text-warning-600" },
};

function Icosapent({ criteri }: { criteri: Criterio[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-default-200 bg-default-50/50 px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-800">
          {SCHEDA_ICOSAPENT.farmaco}
        </p>
        <dl className="mt-1.5 space-y-1">
          <Riga termine="Dose" testo={SCHEDA_ICOSAPENT.dose} />
          <Riga termine="Associazione" testo={SCHEDA_ICOSAPENT.associazione} />
          <Riga termine="Trigliceridi" testo={SCHEDA_ICOSAPENT.trigliceridi} />
          <Riga termine="Prerequisito" testo={SCHEDA_ICOSAPENT.prerequisito} />
          <Riga termine="Finalità" testo={SCHEDA_ICOSAPENT.finalita} />
          <Riga termine="Forza" testo={SCHEDA_ICOSAPENT.raccomandazione} />
        </dl>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800">Criteri ESC</p>
        <p className="text-xs text-default-500">
          I criteri marcati <span className="font-semibold text-warning-600">?</span>{" "}
          l&apos;applicazione non può verificarli: restano da controllare, e
          finché ci sono la scheda non dice nulla sull&apos;idoneità del paziente.
        </p>
        <ul className="mt-2 space-y-1.5">
          {criteri.map((c) => {
            const s = SEGNO_CRITERIO[c.stato];
            return (
              <li key={c.label} className="flex gap-2">
                <span className={`mt-0.5 text-sm font-semibold ${s.classe}`}>
                  {s.segno}
                </span>
                <div>
                  <p className="text-sm text-gray-700">{c.label}</p>
                  <p className="text-xs text-default-500">{c.nota}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ─── Classi di rischio ESC/EAS ───────────────────────────────────────────────

function ClassiRischio() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-default-500">
        La classe di rischio la attribuisce il medico nel campo della visita:
        questi sono i criteri da avere sotto gli occhi mentre la sceglie.
        L&apos;applicazione non la calcola e non la propone.
      </p>
      {CRITERI_RISCHIO_ESC.map((c) => (
        <div
          key={c.classe}
          className="rounded-lg border border-default-200 bg-default-50/50 px-3 py-2.5"
        >
          <p className="text-sm font-semibold text-gray-800">{c.classe}</p>
          <ul className="mt-1.5 space-y-1.5">
            {c.voci.map((v) => (
              <li key={v.titolo}>
                <p className="text-xs font-semibold text-gray-700">{v.titolo}</p>
                <p className="text-xs text-default-600">{v.esempi}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Icosapent o colchicina ──────────────────────────────────────────────────

function Confronto() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-default-500">
        Non sono alternative fra cui scegliere: agiscono su rischi residui
        diversi, e uno stesso paziente può rientrare in entrambi o in nessuno
        dei due.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-default-200">
              <th className="py-1.5 pr-3 text-xs font-semibold text-default-500">
                Aspetto
              </th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-800">
                Icosapent etile
              </th>
              <th className="py-1.5 text-xs font-semibold text-gray-800">
                Colchicina
              </th>
            </tr>
          </thead>
          <tbody>
            {CONFRONTO_FARMACI.map((r) => (
              <tr key={r.aspetto} className="border-b border-default-100 align-top">
                <td className="py-2 pr-3 text-xs font-semibold text-default-500">
                  {r.aspetto}
                </td>
                <td className="py-2 pr-3 text-xs text-default-700">{r.icosapent}</td>
                <td className="py-2 text-xs text-default-700">{r.colchicina}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Colchicina ──────────────────────────────────────────────────────────────

const COLLOCAZIONE = {
  indicata: { label: "Indicata", classe: "text-success-600" },
  "fuori-indicazione": { label: "Fuori indicazione", classe: "text-danger-500" },
  "area-grigia": { label: "Area grigia", classe: "text-warning-600" },
} as const;

function Colchicina() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-default-200 bg-default-50/50 px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-800">
          {SCHEDA_COLCHICINA.farmaco}
        </p>
        <dl className="mt-1.5 space-y-1">
          <Riga termine="Dose" testo={SCHEDA_COLCHICINA.dose} />
          <Riga termine="Popolazione" testo={SCHEDA_COLCHICINA.popolazione} />
          <Riga termine="Finalità" testo={SCHEDA_COLCHICINA.finalita} />
          <Riga termine="Forza" testo={SCHEDA_COLCHICINA.raccomandazione} />
          <Riga termine="Posizionamento" testo={SCHEDA_COLCHICINA.posizionamento} />
        </dl>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800">Profili clinici</p>
        <p className="text-xs text-default-500">
          Elenco da leggere, non una domanda a cui l&apos;applicazione risponde:
          distinguere una sindrome coronarica cronica da un&apos;aterosclerosi
          subclinica è il giudizio che l&apos;ultima riga dice di non
          automatizzare.
        </p>
        <ul className="mt-2 space-y-1.5">
          {PROFILI_COLCHICINA.map((p) => {
            const c = COLLOCAZIONE[p.collocazione];
            return (
              <li
                key={p.profilo}
                className="rounded-md border border-default-200 px-2.5 py-1.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-gray-700">{p.profilo}</span>
                  <span className={`shrink-0 text-xs font-semibold ${c.classe}`}>
                    {c.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-default-500">{p.nota}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
