import { useState } from "react";
import { Button, Card, CardBody, CardHeader, Switch } from "@nextui-org/react";
import { ImageUp, PenLine, Signature, Trash2 } from "lucide-react";
import { DoctorService } from "../services/OfflineServices";
import { SignatureStampCropModal } from "./SignatureStampCropModal";
import { FirmaAManoModal } from "./FirmaAManoModal";

type Avviso = { tipo: "ok" | "errore"; testo: string };

type Props = {
  /** Data URL della firma salvata nel profilo, stringa vuota se non c'e'. */
  immagine: string;
  onImmagineChange: (dataUrl: string) => void;
  firmaSulReferto: boolean;
  onFirmaSulRefertoChange: (valore: boolean) => void;
};

/**
 * Firma olografica del medico (con il timbro, se lo usa), stampata in calce
 * ai documenti. Si chiama cosi' perche' e' il nome con cui la cercano i medici.
 *
 * Due strade: la foto della firma su carta (con il timbro, se lo usa) oppure
 * la firma scritta sullo schermo, per chi ha un portatile touch con il
 * pennino. Escono nello stesso formato e i PDF non le distinguono.
 *
 * La firma si salva appena confermata, senza passare da "Salva profilo": e'
 * un'immagine, non un campo del modulo, e chi l'ha appena sistemata nel
 * riquadro si aspetta di ritrovarla sul prossimo PDF. Il profilo salvato dopo
 * la riporta uguale, perche' `Settings` tiene la stessa immagine nel suo stato.
 *
 * E' l'immagine della firma, non una firma digitale: lo dice la scheda stessa,
 * perche' la domanda arriva ("avete la firma olografica?") e la differenza
 * conta quando il referto parte per posta elettronica.
 */
export function FirmaTimbroCard({
  immagine,
  onImmagineChange,
  firmaSulReferto,
  onFirmaSulRefertoChange,
}: Props) {
  const [daRitagliare, setDaRitagliare] = useState<string | null>(null);
  const [aMano, setAMano] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [avviso, setAvviso] = useState<Avviso | null>(null);

  const scegliFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setAvviso({
        tipo: "errore",
        testo: "Serve una foto o una scansione in formato JPG o PNG.",
      });
      return;
    }
    setAvviso(null);
    const lettore = new FileReader();
    lettore.onload = () => setDaRitagliare(lettore.result as string);
    lettore.onerror = () =>
      setAvviso({ tipo: "errore", testo: "Non riesco a leggere il file scelto." });
    lettore.readAsDataURL(file);
  };

  const salva = async (dataUrl: string) => {
    setSalvataggio(true);
    try {
      await DoctorService.updateDoctor({ signatureStampImage: dataUrl || undefined });
      onImmagineChange(dataUrl);
      window.dispatchEvent(new CustomEvent("appdottori-doctor-updated"));
      setAvviso({
        tipo: "ok",
        testo: dataUrl ? "Firma salvata." : "Firma tolta dai documenti.",
      });
    } catch (error) {
      setAvviso({
        tipo: "errore",
        testo: "Firma non salvata: " + (error as Error).message,
      });
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <Card id="impostazioni-firma" className="shadow-lg w-full scroll-mt-32">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Signature className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-gray-900">Firma olografica</h2>
        </div>
      </CardHeader>
      <CardBody className="gap-5">
        {avviso ? (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 text-sm ${
              avviso.tipo === "ok"
                ? "corioli-feedback-success"
                : "border-danger/30 bg-danger-50 text-danger-800"
            }`}
          >
            {avviso.testo}
          </div>
        ) : null}

        <p className="text-base text-default-700">
          Corioli stampa la tua firma in calce a ricette, certificati e
          richieste di esame, e se vuoi anche al referto della visita. Puoi
          caricare la foto della tua firma su un foglio bianco oppure
          firmare direttamente sullo schermo.
        </p>

        {immagine ? (
          <div className="flex flex-wrap items-center gap-5">
            {/* Stesse proporzioni del riquadro sul PDF (3:1), su bianco
                come sul foglio. */}
            <div className="w-[360px] max-w-full aspect-[3/1] rounded-lg border border-default-300 bg-white p-2">
              <img
                src={immagine}
                alt="Firma olografica salvata"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-3">
              <Button
                as="label"
                size="lg"
                variant="bordered"
                startContent={<ImageUp size={20} />}
                isDisabled={salvataggio}
                className="cursor-pointer"
              >
                Carica una foto
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    scegliFile(e.target.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
              </Button>
              <Button
                size="lg"
                variant="bordered"
                startContent={<PenLine size={20} />}
                isDisabled={salvataggio}
                onPress={() => setAMano(true)}
              >
                Firma sullo schermo
              </Button>
              <Button
                size="lg"
                variant="light"
                color="danger"
                startContent={<Trash2 size={20} />}
                isDisabled={salvataggio}
                onPress={() => void salva("")}
              >
                Rimuovi
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default-300 bg-default-50 px-4 py-6 text-base font-medium text-default-700 hover:border-primary hover:text-primary">
              <ImageUp size={32} />
              Carica la foto della firma
              <span className="text-sm font-normal text-default-500">
                JPG o PNG. Dopo la scelta la ritagli.
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  scegliFile(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setAMano(true)}
              className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default-300 bg-default-50 px-4 py-6 text-base font-medium text-default-700 hover:border-primary hover:text-primary"
            >
              <PenLine size={32} />
              Firma sullo schermo
              <span className="text-sm font-normal text-default-500">
                Con il pennino o con il dito, se lo schermo è touch.
              </span>
            </button>
          </div>
        )}

        <div className="flex items-start justify-between gap-4 rounded-lg border border-default-200 p-4">
          <div className="min-w-0">
            <p className="text-base font-medium text-gray-800">
              Firma anche il referto della visita
            </p>
            <p className="mt-1 text-sm text-default-600">
              In calce a destra, dopo le conclusioni. Spento, il referto si
              chiude sulle conclusioni e lo firmi a mano sul foglio.
            </p>
            {/* L'interruttore resta grigio finche' manca la firma: senza
                questa riga non si capiva perche'. */}
            {!immagine && (
              <p className="mt-1 text-sm font-medium text-default-700">
                Si attiva dopo aver caricato o disegnato la firma qui sopra.
              </p>
            )}
          </div>
          <Switch
            aria-label="Stampa la firma anche sul referto della visita"
            className="shrink-0"
            // Senza firma caricata resta spento: acceso e grigio farebbe
            // credere che il referto esca gia' firmato.
            isSelected={firmaSulReferto && Boolean(immagine)}
            isDisabled={!immagine}
            onValueChange={onFirmaSulRefertoChange}
          />
        </div>

        <p className="text-sm text-default-600">
          È l&apos;immagine della tua firma, non una firma digitale: un PDF che
          deve avere valore legale quando parte per posta elettronica va
          firmato digitalmente (smart card o firma remota).
        </p>
      </CardBody>

      <SignatureStampCropModal
        isOpen={daRitagliare !== null}
        imageSrc={daRitagliare}
        onClose={() => setDaRitagliare(null)}
        onConfirm={(dataUrl) => void salva(dataUrl)}
      />
      <FirmaAManoModal
        isOpen={aMano}
        onClose={() => setAMano(false)}
        onConfirm={(dataUrl) => void salva(dataUrl)}
      />
    </Card>
  );
}
