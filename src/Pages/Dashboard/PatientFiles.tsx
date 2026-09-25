import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from "@nextui-org/react";
import {
  Download,
  Eye,
  FileImage,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Breadcrumb } from "../../components/Breadcrumb";
import { PageHeader } from "../../components/PageHeader";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import { DocumentsGridSkeleton } from "../../components/AppStartupSkeleton";
import { Document, Patient } from "../../types/Storage";
import { DocumentService, PatientService } from "../../services/OfflineServices";
import { todayIsoDate } from "../../utils/dateUtils";
import { AppModal } from "../../components/AppModal";
import { formatPatientDisplayName } from "../../utils/patientDisplay";

const formatFileSize = (bytes: number): string => {
  if (!bytes) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
};
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const getFileExtension = (fileName: string): string => {
  const parts = fileName.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
};

const getDocumentTypeLabel = (doc: Document): string => {
  const mime = (doc.mimeType || "").toLowerCase();
  const ext = getFileExtension(doc.fileName);
  if (mime.startsWith("image/")) return "Immagine";
  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (
    ext === "doc" ||
    ext === "docx" ||
    mime.includes("word") ||
    mime.includes("officedocument.wordprocessingml")
  ) {
    return "Documento";
  }
  if (
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "csv" ||
    mime.includes("excel") ||
    mime.includes("spreadsheet")
  ) {
    return "Excel/Foglio";
  }
  return ext ? ext.toUpperCase() : "File";
};

const isPreviewable = (doc: Document): boolean => {
  const mime = (doc.mimeType || "").toLowerCase();
  const ext = getFileExtension(doc.fileName);
  return mime.startsWith("image/") || mime === "application/pdf" || ext === "pdf";
};

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export default function PatientFiles() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { isOpen: isUploadOpen, onOpen: onUploadOpen, onClose: onUploadClose } =
    useDisclosure();
  const {
    isOpen: isPreviewOpen,
    onOpen: onPreviewOpen,
    onClose: onPreviewClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadData = async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      let p = await PatientService.getPatientById(patientId);
      if (!p) p = await PatientService.getPatientByCF(patientId);
      if (!p) {
        setError("Paziente non trovato.");
        setPatient(null);
        return;
      }
      setPatient(p);
      const all = await DocumentService.getAllDocuments();
      const docs = all
        .filter((d) => d.patientId === p.id)
        .sort(
          (a, b) =>
            new Date(b.uploadDate || b.createdAt).getTime() -
            new Date(a.uploadDate || a.createdAt).getTime(),
        );
      setDocuments(docs);
    } catch (err) {
      console.error("Errore caricamento documenti paziente:", err);
      setError("Errore durante il caricamento dei documenti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetUploadForm = () => {
    setUploadTitle("");
    setUploadDescription("");
    setSelectedFile(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Il file è troppo grande (max 25MB).");
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
    // Precompila il titolo con il nome del file (senza estensione)
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "") || file.name;
    setUploadTitle(nameWithoutExt);
  };

  const handleUpload = async () => {
    if (!patient) return;
    if (!uploadTitle.trim() || !selectedFile) {
      setError("Titolo e file sono obbligatori.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const fileData = await DocumentService.convertFileToBase64(selectedFile);
      await DocumentService.addDocument({
        title: uploadTitle.trim(),
        description: uploadDescription.trim() || undefined,
        patientId: patient.id,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
        category: "altro",
        uploadDate: todayIsoDate(),
        fileData,
      });
      setSuccess("Documento caricato con successo.");
      onUploadClose();
      resetUploadForm();
      await loadData();
    } catch (err) {
      console.error("Errore caricamento documento paziente:", err);
      setError("Errore durante il caricamento del documento.");
    } finally {
      setLoading(false);
    }
  };

  const requestDelete = (id: string) => {
    setDocumentToDelete(id);
    onDeleteOpen();
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    try {
      await DocumentService.deleteDocument(documentToDelete);
      setSuccess("Documento eliminato con successo.");
      onDeleteClose();
      setDocumentToDelete(null);
      await loadData();
    } catch (err) {
      console.error("Errore eliminazione documento paziente:", err);
      setError("Errore durante l'eliminazione del documento.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = (doc: Document) => {
    DocumentService.downloadDocument(doc);
  };

  const handlePreview = (doc: Document) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (isPreviewable(doc)) {
      const blob = base64ToBlob(doc.fileData, doc.mimeType || "application/pdf");
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    setPreviewDocument(doc);
    onPreviewOpen();
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewDocument(null);
    onPreviewClose();
  };

  const filteredDocuments = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return documents;
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(term) ||
        doc.fileName.toLowerCase().includes(term) ||
        doc.description?.toLowerCase().includes(term),
    );
  }, [documents, searchTerm]);

  if (!loading && !patient && !error) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardBody className="text-center py-10">
          <p className="text-lg font-semibold mb-3">Paziente non trovato</p>
          <Button color="primary" onPress={() => navigate("/pazienti")}>
            Torna ai pazienti
          </Button>
        </CardBody>
      </Card>
    );
  }

  const breadcrumbItems = patient
    ? [
        { label: "Dashboard", path: "/" },
        { label: "Pazienti", path: "/pazienti" },
        {
          label: formatPatientDisplayName(patient) ?? "Paziente",
          path: `/patient-history/${patient.id}`,
        },
        { label: "File" },
      ]
    : [];

  const HeaderActions = (
    <div className="flex gap-2">
      <Button
        color="primary"
        onPress={onUploadOpen}
        startContent={<Plus size={18} />}
      >
        Carica documento
      </Button>
    </div>
  );

  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      {breadcrumbItems.length > 0 && <Breadcrumb items={breadcrumbItems} />}

      <PageHeader
        title="File del paziente"
        subtitle={
          patient
            ? `Archivio documenti di ${formatPatientDisplayName(patient) ?? "questo paziente"}.`
            : "Archivio documenti paziente."
        }
        actions={HeaderActions}
      />

      <Card className="shadow-sm">
        <CardBody className="p-4">
          <Input
            placeholder="Cerca per titolo, descrizione o nome file..."
            value={searchTerm}
            onValueChange={setSearchTerm}
            startContent={<Search size={18} className="text-default-500" />}
            variant="bordered"
            isClearable
          />
        </CardBody>
      </Card>

      {error && (
        <Card className="border-l-4 border-l-danger shadow-sm">
          <CardBody className="py-3">
            <p className="text-danger text-sm">{error}</p>
          </CardBody>
        </Card>
      )}

      {success && (
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardBody className="py-3">
            <p className="corioli-text-brand text-sm">{success}</p>
          </CardBody>
        </Card>
      )}

      {loading && <DocumentsGridSkeleton />}

      {!loading && (
        <>
          {filteredDocuments.length === 0 ? (
            <Card className="shadow-md border border-gray-100">
              <CardBody className="text-center py-12">
                <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {searchTerm
                    ? "Nessun documento trovato"
                    : "Nessun documento caricato"}
                </h3>
                <p className="text-gray-500 mb-4">
                  {searchTerm
                    ? "Prova a modificare i termini di ricerca."
                    : "Carica il primo documento (PDF o immagine) per questo paziente."}
                </p>
                {/* self-center: nel CardBody in colonna il pulsante si allargava
                    a tutta la card, e ripeteva quello della testata. */}
                {!searchTerm && (
                  <Button
                    variant="bordered"
                    onPress={onUploadOpen}
                    startContent={<Plus size={18} />}
                    className="self-center"
                  >
                    Carica il primo documento
                  </Button>
                )}
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map((doc) => {
                const isImage = doc.mimeType?.startsWith("image/");
                const typeLabel = getDocumentTypeLabel(doc);
                const ext = getFileExtension(doc.fileName);
                return (
                  <Card
                    key={doc.id}
                    className="shadow-sm hover:shadow-md transition-all border border-gray-100 bg-white/80 backdrop-blur-sm flex flex-col h-full overflow-hidden"
                  >
                    <div className="w-full h-[9rem] min-h-[9rem] max-h-[9rem] flex-shrink-0 bg-gradient-to-br from-default-100 to-default-50 border-b border-default-100 overflow-hidden">
                      {isImage ? (
                        <img
                          src={`data:${doc.mimeType};base64,${doc.fileData}`}
                          alt={doc.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (doc.mimeType === "application/pdf" || ext === "pdf") ? (
                        <iframe
                          title={`preview-${doc.id}`}
                          src={`data:${doc.mimeType || "application/pdf"};base64,${doc.fileData}#page=1&toolbar=0`}
                          className="w-full h-full border-0 min-h-0"
                        />
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center text-default-500 min-h-[9rem]">
                          <FileText size={28} />
                          <span className="text-xs mt-2 font-medium">{typeLabel}</span>
                          <span className="text-[11px] text-default-500">
                            Anteprima non disponibile
                          </span>
                        </div>
                      )}
                    </div>
                    <CardHeader className="pb-2 pt-4 flex-shrink-0">
                      <div className="flex items-start justify-between w-full">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-primary-100/70 text-primary-600">
                            {isImage ? <FileImage size={20} /> : <FileText size={20} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base line-clamp-2">
                              {doc.title}
                            </h3>
                            <p className="text-sm text-gray-500 truncate">
                              {doc.fileName}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody className="pt-0 flex-1 flex flex-col min-h-0">
                      <div className="space-y-3 flex-1 min-h-0">
                        <Chip color="primary" variant="flat" size="sm">
                          {typeLabel}
                        </Chip>

                        {doc.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {doc.description}
                          </p>
                        )}

                        <div className="space-y-2 text-xs text-gray-500">
                          <div className="flex justify-between">
                            <span>Caricato:</span>
                            <span>
                              {doc.uploadDate
                                ? format(parseISO(doc.uploadDate), "dd/MM/yyyy")
                                : "-"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Dimensione:</span>
                            <span>{formatFileSize(doc.fileSize)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-auto pt-3 flex-shrink-0">
                        <Button
                          size="sm"
                          color="primary"
                          variant="flat"
                          onPress={() => handlePreview(doc)}
                          startContent={<Eye size={14} />}
                          className="flex-1"
                        >
                          Visualizza
                        </Button>
                        <Button
                          size="sm"
                          color="default"
                          variant="flat"
                          onPress={() => handleDownload(doc)}
                          startContent={<Download size={14} />}
                        >
                          Scarica
                        </Button>
                        <Button
                          size="sm"
                          color="danger"
                          variant="flat"
                          onPress={() => requestDelete(doc.id)}
                          isIconOnly
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <AppModal
        isOpen={isPreviewOpen}
        onClose={closePreview}
        size="5xl"
        classNames={{
          base: "max-h-[90vh]",
          body: "p-0 overflow-hidden flex flex-col",
          wrapper: "items-center",
        }}
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="border-b border-gray-200 pb-2">
            <h2 className="text-xl font-bold truncate pr-8">
              {previewDocument?.title ?? "Anteprima documento"}
            </h2>
          </ModalHeader>
          <ModalBody className="flex-1 min-h-0">
            {previewDocument && (
              <div className="flex-1 min-h-[70vh] w-full bg-gray-100 rounded-lg overflow-hidden">
                {previewUrl && previewDocument.mimeType?.startsWith("image/") ? (
                  <img
                    src={previewUrl}
                    alt={previewDocument.title}
                    className="w-full h-full object-contain"
                  />
                ) : previewUrl ? (
                  <iframe
                    title={previewDocument.title}
                    src={previewUrl}
                    className="w-full h-full min-h-[70vh] border-0"
                  />
                ) : (
                  <div className="h-full min-h-[70vh] flex flex-col items-center justify-center text-default-500">
                    <FileText size={40} />
                    <p className="mt-3 font-medium">Anteprima non disponibile</p>
                    <p className="text-sm">
                      Questo tipo di file non supporta l'anteprima interna.
                    </p>
                    <Button
                      color="primary"
                      variant="flat"
                      className="mt-4"
                      startContent={<Download size={16} />}
                      onPress={() => handleDownload(previewDocument)}
                    >
                      Scarica file
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter className="border-t border-gray-200">
            <Button
              color="primary"
              variant="flat"
              startContent={<Download size={16} />}
              onPress={() => previewDocument && handleDownload(previewDocument)}
            >
              Scarica
            </Button>
            <Button color="primary" onPress={closePreview}>
              Chiudi
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <AppModal isOpen={isUploadOpen} onClose={onUploadClose} size="2xl">
        <ModalContent>
          <ModalHeader>
            <h2 className="text-xl font-bold">Carica un documento</h2>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Titolo del documento"
                placeholder="Es. Risposta esame sangue"
                value={uploadTitle}
                onValueChange={setUploadTitle}
                variant="bordered"
                isRequired
              />

              <Input
                label="Descrizione (Opzionale)"
                placeholder="Breve nota sul documento..."
                value={uploadDescription}
                onValueChange={setUploadDescription}
                variant="bordered"
              />

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="*/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="patient-file-upload"
                />
                <label htmlFor="patient-file-upload" className="cursor-pointer">
                  <div className="space-y-2">
                    <Upload className="mx-auto w-8 h-8 text-gray-500" />
                    <p className="text-sm text-gray-600">
                      {selectedFile
                        ? selectedFile.name
                        : "Clicca per selezionare un file (qualsiasi formato)"}
                    </p>
                    {selectedFile && (
                      <p className="text-xs text-gray-500">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    )}
                    {!selectedFile && (
                      <p className="text-xs text-gray-500">
                        Supportati: PDF, immagini, Word, Excel e altri (max 25MB)
                      </p>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="danger"
              variant="light"
              onPress={() => {
                onUploadClose();
                resetUploadForm();
              }}
            >
              Annulla
            </Button>
            <Button
              color="primary"
              onPress={handleUpload}
              isLoading={loading}
              isDisabled={!selectedFile || !uploadTitle.trim()}
            >
              Carica documento
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <ConfirmDangerModal
        isOpen={isDeleteOpen}
        onClose={() => {
          if (isDeleting) return;
          onDeleteClose();
          setDocumentToDelete(null);
        }}
        title="Elimina documento"
        confirmLabel="Elimina documento"
        onConfirm={() => void confirmDelete()}
        isLoading={isDeleting}
      >
        <p className="text-sm text-default-600">
          Sei sicuro di voler eliminare questo documento?
        </p>
      </ConfirmDangerModal>
    </div>
  );
}
