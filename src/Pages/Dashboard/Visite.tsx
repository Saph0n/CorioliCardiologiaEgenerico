import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardBody,
  Input,
  Button,
  Spinner,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@nextui-org/react";
import {
  FileText,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Printer,
  Maximize2,
  Minimize2,
  DownloadIcon,
  Trash2Icon,
  Pencil,
} from "lucide-react";
import { SearchIcon } from "../../components/navbar/SearchIcon";
import { PatientService, VisitService } from "../../services/OfflineServices";
import { PdfService } from "../../services/PdfService";
import { Visit, Patient } from "../../types/Storage";
import { PageHeader } from "../../components/PageHeader";
import { PageLoadingSkeleton } from "../../components/AppStartupSkeleton";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import { useToast } from "../../contexts/ToastContext";
import { useCheckPatientModal } from "../../contexts/CheckPatientModalContext";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import { AppModal, MODAL_SCHERMO_INTERO } from "../../components/AppModal";
import { formatPatientDisplayName } from "../../utils/patientDisplay";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve(base64 ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface EnrichedVisit extends Visit {
  patientName: string;
  patientCf: string;
}

const getVisitDescription = (visit: EnrichedVisit): string =>
  visit.visita?.problemaClinico ||
  visit.visita?.prestazione ||
  visit.descrizioneClinica ||
  visit.anamnesi ||
  "Nessuna descrizione";

export default function Visite() {
  const navigate = useNavigate();
  const { openCheckPatientModal } = useCheckPatientModal();
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<EnrichedVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<EnrichedVisit | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const rowsPerPage = 10;
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [previewPdfBlobUrl, setPreviewPdfBlobUrl] = useState<string | null>(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [patientForPreview, setPatientForPreview] = useState<Patient | null>(null);
  const [isIncludeImagesModalOpen, setIsIncludeImagesModalOpen] = useState(false);
  const [includeImagesCount, setIncludeImagesCount] = useState(0);
  const [pendingPrintVisit, setPendingPrintVisit] = useState<Visit | null>(null);
  const [visitToDelete, setVisitToDelete] = useState<string | null>(null);
  const {
    isOpen: isDeleteVisitOpen,
    onOpen: onDeleteVisitOpen,
    onClose: onDeleteVisitClose,
  } = useDisclosure();
  const [isDeletingVisit, setIsDeletingVisit] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen || !selectedVisit) {
      setPatientForPreview(null);
      setPreviewFullscreen(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const patient = await PatientService.getPatientById(selectedVisit.patientId);
        if (!cancelled) setPatientForPreview(patient ?? null);
      } catch (e) {
        console.error(e);
        if (!cancelled) setPatientForPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, selectedVisit?.id]);

  useEffect(() => {
    if (!isOpen || !selectedVisit || !patientForPreview) {
      setPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewPdfLoading(false);
      return;
    }
    let revoked = false;
    setPreviewPdfLoading(true);
    (async () => {
      try {
        const blob = await PdfService.generateVisitPDF(
          patientForPreview,
          selectedVisit,
          { includeImages: true },
        );
        if (blob && !revoked) {
          const url = URL.createObjectURL(blob);
          setPreviewPdfBlobUrl(url);
        }
      } catch (e) {
        console.error("Errore generazione PDF anteprima:", e);
        if (!revoked) setPreviewPdfBlobUrl(null);
      } finally {
        if (!revoked) setPreviewPdfLoading(false);
      }
    })();
    return () => {
      revoked = true;
      setPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewPdfLoading(false);
    };
  }, [isOpen, selectedVisit?.id, patientForPreview?.id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [allVisits, allPatients] = await Promise.all([
          VisitService.getAllVisits(),
          PatientService.getAllPatients(),
        ]);

        const patientMap = new Map(allPatients.map((p) => [p.id, p]));

        const enriched = allVisits.map((v) => {
          const p = patientMap.get(v.patientId);
          return {
            ...v,
            patientName: p ? formatPatientDisplayName(p) ?? "Paziente senza nome" : "Paziente sconosciuto",
            patientCf: p?.codiceFiscale || ""
          };
        });

        // Sort by date desc
        enriched.sort((a, b) => new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime());

        setVisits(enriched);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredVisits = useMemo(() => {
    const term = searchTerm.toLowerCase();
    let list = visits.filter(v =>
      v.patientName.toLowerCase().includes(term) ||
      v.patientCf.toLowerCase().includes(term) ||
      v.descrizioneClinica?.toLowerCase().includes(term) ||
      v.dataVisita.includes(term)
    );
    if (filterDateFrom) {
      list = list.filter(v => v.dataVisita >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter(v => v.dataVisita <= filterDateTo);
    }
    return list;
  }, [visits, searchTerm, filterDateFrom, filterDateTo]);

  const items = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredVisits.slice(start, end);
  }, [page, filteredVisits]);

  const totalPages = Math.ceil(filteredVisits.length / rowsPerPage);

  const openPreview = (visit: EnrichedVisit) => {
    setSelectedVisit(visit);
    onOpen();
  };

  const runPrintPdf = async (visit: Visit, includeImages: boolean) => {
    if (!patientForPreview) return;
    setPdfLoading(true);
    try {
      const blob = await PdfService.generateVisitPDF(patientForPreview, visit, {
        includeImages,
      });
      if (!blob) {
        showToast("Impossibile generare il PDF per la stampa.", "error");
        return;
      }
      const electronAPI = (window as unknown as { electronAPI?: { openPdfForPrint: (b64: string) => Promise<unknown> } }).electronAPI;
      if (electronAPI?.openPdfForPrint) {
        const base64 = await blobToBase64(blob);
        await electronAPI.openPdfForPrint(base64);
        showToast("PDF aperto nell'app predefinita. Usa Stampa da lì.");
      } else {
        const pdfUrl = URL.createObjectURL(blob);
        const w = window.open(pdfUrl, "_blank");
        if (w) setTimeout(() => URL.revokeObjectURL(pdfUrl), 5000);
        else {
          const a = document.createElement("a");
          a.href = pdfUrl;
          a.download = `Referto_${patientForPreview.cognome}_${visit.dataVisita}.pdf`;
          a.click();
          URL.revokeObjectURL(pdfUrl);
          showToast("PDF scaricato. Apri il file per visualizzarlo e stampare.");
        }
      }
    } catch (err) {
      console.error("Errore stampa PDF:", err);
      showToast("Errore durante la stampa del PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrintPdf = async (visit: Visit) => {
    if (!patientForPreview) return;
    const imageCount = visit.visita?.immagini?.length ?? 0;
    if (imageCount > 0) {
      setIncludeImagesCount(imageCount);
      setPendingPrintVisit(visit);
      setIsIncludeImagesModalOpen(true);
      return;
    }
    await runPrintPdf(visit, false);
  };

  const handleIncludeImagesChoice = (include: boolean) => {
    const visit = pendingPrintVisit;
    setIsIncludeImagesModalOpen(false);
    setPendingPrintVisit(null);
    if (!visit) return;
    void runPrintPdf(visit, include);
  };

  const handleGeneratePdfFromPreview = async (visit: Visit) => {
    if (!patientForPreview) return;
    setPdfLoading(true);
    try {
      const blob = await PdfService.generateVisitPDF(patientForPreview, visit);
      if (!blob) {
        showToast("Impossibile generare il PDF.", "error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Referto_${patientForPreview.cognome}_${visit.dataVisita}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("PDF del referto generato.");
    } catch (err) {
      console.error("Errore generazione PDF da anteprima:", err);
      showToast("Errore durante la generazione del PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const requestDeleteVisit = (visitId: string) => {
    setVisitToDelete(visitId);
    onDeleteVisitOpen();
  };

  const confirmDeleteVisit = async () => {
    if (!visitToDelete) return;
    try {
      setIsDeletingVisit(true);
      await VisitService.deleteVisit(visitToDelete);
      const [allVisits, allPatients] = await Promise.all([VisitService.getAllVisits(), PatientService.getAllPatients()]);
      const patientMap = new Map(allPatients.map((p) => [p.id, p]));
      const enriched = allVisits.map((v) => {
        const p = patientMap.get(v.patientId);
        return { ...v, patientName: p ? formatPatientDisplayName(p) ?? "Paziente senza nome" : "Paziente sconosciuto", patientCf: p?.codiceFiscale || "" };
      });
      enriched.sort((a, b) => new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime());
      setVisits(enriched);
      if (selectedVisit?.id === visitToDelete) onClose();
      setSelectedVisit(null);
      onDeleteVisitClose();
      setVisitToDelete(null);
    } catch (error) {
      console.error("Errore nell'eliminazione visita:", error);
      showToast("Errore nell'eliminazione della visita.", "error");
    } finally {
      setIsDeletingVisit(false);
    }
  };


  if (loading) {
    return <PageLoadingSkeleton variant="table" pathname="/visite" />;
  }

  const HeaderActions = (
    <Button
      color="primary"
      startContent={<Calendar size={18} />}
      onPress={openCheckPatientModal}
      className="font-medium flex-1 md:flex-none"
    >
      Nuova visita
    </Button>
  );

  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Visite"
        actions={HeaderActions}
      />

      <Card className="corioli-card">
        <CardBody className="p-4 gap-4">
          {/* Ricerca e date sulla stessa riga e della stessa altezza: le
              etichette "Da" e "A" stavano sopra le date e le spingevano sotto
              il filo della ricerca. */}
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <div className="min-w-0 w-full md:flex-[1_1_58%]">
              <Input
                isClearable
                placeholder="Cerca per nome, CF o descrizione..."
                startContent={
                  <SearchIcon size={20} className="text-default-500" />
                }
                value={searchTerm}
                onValueChange={(v) => {
                  setSearchTerm(v);
                  setPage(1);
                }}
                onClear={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                variant="bordered"
                classNames={{
                  base: "w-full max-w-full",
                  mainWrapper: "w-full",
                  input: "text-base",
                  inputWrapper:
                    "w-full max-w-full h-12 border-default-200 shadow-none",
                }}
              />
            </div>
            <Input
              type="date"
              className="w-full md:w-[10.5rem] md:shrink-0"
              aria-label="Dal"
              startContent={<span className="text-xs font-medium text-default-600">Dal</span>}
              value={filterDateFrom}
              onValueChange={(v) => {
                setFilterDateFrom(v);
                setPage(1);
              }}
              variant="bordered"
              classNames={{
                base: "w-full",
                inputWrapper: "h-12 min-h-12",
              }}
            />
            <Input
              type="date"
              className="w-full md:w-[10.5rem] md:shrink-0"
              aria-label="Al"
              startContent={<span className="text-xs font-medium text-default-600">Al</span>}
              value={filterDateTo}
              onValueChange={(v) => {
                setFilterDateTo(v);
                setPage(1);
              }}
              variant="bordered"
              classNames={{
                base: "w-full",
                inputWrapper: "h-12 min-h-12",
              }}
            />
          </div>

          {filteredVisits.length > 0 ? (
            <div className="rounded-lg border border-default-200 overflow-hidden divide-y divide-default-100">
              {items.map((visit) => (
                <div
                  key={visit.id}
                  className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] md:grid-cols-[6.5rem_minmax(0,16rem)_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 hover:bg-default-50 transition-colors cursor-pointer group"
                  onClick={() => openPreview(visit)}
                  title="Apri l'anteprima del referto"
                >
                  <span className="text-sm font-semibold tabular-nums text-gray-900">
                    {new Date(visit.dataVisita).toLocaleDateString("it-IT")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 group-hover:text-[var(--brand-cta)]">
                      {visit.patientName}
                    </p>
                    {visit.patientCf && (
                      <p className="truncate text-xs text-default-600">
                        <CodiceFiscaleValue value={visit.patientCf} />
                      </p>
                    )}
                  </div>
                  <p className="hidden md:block truncate text-sm text-default-600">
                    {getVisitDescription(visit)}
                  </p>
                  {/* Un'azione sola sulla riga, con la matita come nella scheda
                      del paziente. Prima: occhio, chevron (che era "Modifica")
                      e freccia, tre segni per due azioni. */}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    title="Modifica visita"
                    aria-label="Modifica visita"
                    onClick={(e) => e.stopPropagation()}
                    onPress={() => navigate(`/edit-visit/${visit.id}`)}
                  >
                    <Pencil size={16} className="text-default-600" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center gap-3">
              <FileText
                size={32}
                style={{ color: "var(--color-text-tertiary)" }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {searchTerm || filterDateFrom || filterDateTo
                  ? "Nessuna visita trovata"
                  : "Nessuna visita registrata"}
              </p>
              <p
                className="text-xs max-w-[320px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {searchTerm || filterDateFrom || filterDateTo
                  ? "Prova a modificare i filtri di ricerca."
                  : "Le visite effettuate appariranno qui. Avvia una nuova visita dal pulsante in alto."}
              </p>
              {!searchTerm &&
                !filterDateFrom &&
                !filterDateTo && (
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={openCheckPatientModal}
                    startContent={<Calendar size={14} />}
                  >
                    Nuova visita
                  </Button>
                )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2 border-t border-default-100">
              <Button
                size="sm"
                variant="flat"
                isDisabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                startContent={<ChevronLeft size={16} />}
              >
                Precedente
              </Button>
              <span
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Pagina {page} di {totalPages}
              </span>
              <Button
                size="sm"
                variant="flat"
                isDisabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                endContent={<ChevronRight size={16} />}
              >
                Successiva
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <AppModal
        isOpen={isOpen}
        onClose={onClose}
        size={previewFullscreen ? "full" : "5xl"}
        scrollBehavior="inside"
        classNames={previewFullscreen ? { base: MODAL_SCHERMO_INTERO } : undefined}
      >
        <ModalContent>
          {selectedVisit && (
            <>
              <ModalHeader className="flex flex-col gap-0.5 pr-10">
                <h2 className="text-xl font-bold">Anteprima referto</h2>
                <p className="text-sm font-normal text-default-600">
                  {selectedVisit.patientName} · {new Date(selectedVisit.dataVisita).toLocaleDateString("it-IT")}
                </p>
              </ModalHeader>
              <ModalBody>
                {previewPdfLoading ? (
                  <div className="flex justify-center items-center min-h-[60vh]">
                    <Spinner size="lg" color="primary" label="Generazione anteprima PDF..." />
                  </div>
                ) : previewPdfBlobUrl ? (
                  <div className="bg-[#e5e5e5] rounded-lg p-2 flex flex-col min-h-[70vh]">
                    <iframe
                      src={previewPdfBlobUrl}
                      title="Anteprima referto"
                      className="flex-1 w-full min-h-[70vh] rounded border border-gray-300 bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex justify-center items-center min-h-[60vh] text-default-500">
                    Anteprima non disponibile.
                  </div>
                )}
              </ModalBody>
              <ModalFooter className="flex-wrap gap-2">
                <Button
                  color="danger"
                  variant="light"
                  startContent={<Trash2Icon size={16} />}
                  onPress={() => selectedVisit && requestDeleteVisit(selectedVisit.id)}
                  className="mr-auto"
                  aria-label="Elimina visita"
                  title="Elimina visita"
                >
                  Elimina visita
                </Button>
                <Button
                  color="default"
                  variant="flat"
                  startContent={previewFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  onPress={() => setPreviewFullscreen(!previewFullscreen)}
                >
                  {previewFullscreen ? "Riduci" : "Espandi"}
                </Button>
                <Button
                  color="primary"
                  variant="flat"
                  startContent={<Printer size={16} />}
                  onPress={() => handlePrintPdf(selectedVisit)}
                  isLoading={pdfLoading}
                  isDisabled={pdfLoading}
                >
                  Stampa
                </Button>
                <Button
                  color="default"
                  variant="flat"
                  startContent={<DownloadIcon size={16} />}
                  onPress={() => handleGeneratePdfFromPreview(selectedVisit)}
                  isLoading={pdfLoading}
                  isDisabled={pdfLoading}
                >
                  {pdfLoading ? "Scaricamento..." : "Scarica referto"}
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    onClose();
                    navigate(`/edit-visit/${selectedVisit.id}`);
                  }}
                >
                  Modifica visita
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </AppModal>

      <AppModal isOpen={isIncludeImagesModalOpen} onClose={() => handleIncludeImagesChoice(false)} size="md">
        <ModalContent>
          <ModalHeader>Includere le immagini allegate?</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              Sono presenti <span className="font-semibold">{includeImagesCount}</span> immagini nella visita. Vuoi inserirle nel PDF di stampa?
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => handleIncludeImagesChoice(false)}>
              No, genera senza immagini
            </Button>
            <Button color="primary" onPress={() => handleIncludeImagesChoice(true)}>
              Si, includi immagini
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>


      <ConfirmDangerModal
        isOpen={isDeleteVisitOpen}
        onClose={() => {
          if (isDeletingVisit) return;
          onDeleteVisitClose();
          setVisitToDelete(null);
        }}
        title="Elimina visita"
        confirmLabel="Elimina visita"
        onConfirm={() => void confirmDeleteVisit()}
        isLoading={isDeletingVisit}
      >
        <p className="text-sm text-default-600">
          Sei sicuro di voler eliminare questa visita? Questa azione è irreversibile.
        </p>
      </ConfirmDangerModal>
    </div>
  );
}
