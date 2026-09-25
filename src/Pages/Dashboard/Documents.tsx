import { useState, useEffect, useMemo, type Key } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Select,
  SelectItem,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Chip,
  Divider,
  Textarea
} from "@nextui-org/react";
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Search,
  Eye
} from "lucide-react";
import { DocumentService } from "../../services/OfflineServices";
import { Document } from "../../types/Storage";
import { format, parseISO } from "date-fns";
import { PageHeader } from "../../components/PageHeader";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import { DocumentsGridSkeleton } from "../../components/AppStartupSkeleton";
import { todayIsoDate } from "../../utils/dateUtils";
import { AppModal } from "../../components/AppModal";

const CATEGORY_OPTIONS = [
  { key: "all", label: "Tutte le categorie" },
  { key: "corso_aggiornamento", label: "Corsi di aggiornamento" },
  { key: "certificato", label: "Certificati" },
  { key: "altro", label: "Altro" }
];

const getCategoryColor = (category: string) => {
  switch (category) {
    case "corso_aggiornamento":
      return "primary";
    case "certificato":
      return "primary";
    case "altro":
      return "primary";
    default:
      return "default";
  }
};

const getCategoryLabel = (category: string) => {
  switch (category) {
    case "corso_aggiornamento":
      return "Corso Aggiornamento";
    case "certificato":
      return "Certificato";
    case "altro":
      return "Altro";
    default:
      return category;
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const getSelectionValue = (keys: "all" | Set<Key>, fallback: string) => {
  if (keys === "all") return fallback;
  const [firstKey] = Array.from(keys);
  return firstKey?.toString() ?? fallback;
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

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal states
  const { isOpen: isUploadOpen, onOpen: onUploadOpen, onClose: onUploadClose } = useDisclosure();
  const { isOpen: isPreviewOpen, onOpen: onPreviewOpen, onClose: onPreviewClose } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState({
    title: "",
    description: "",
    category: "corso_aggiornamento",
    expiryDate: "",
    credits: ""
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await DocumentService.getAllDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error("Errore nel caricamento documenti:", error);
      setError("Errore nel caricamento dei documenti");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Controlla che sia un PDF
      if (file.type !== 'application/pdf') {
        setError("Solo file PDF sono supportati");
        return;
      }
      // Controlla dimensione (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("Il file è troppo grande (max 10MB)");
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadData.title.trim()) {
      setError("Titolo e file sono obbligatori");
      return;
    }

    setLoading(true);
    try {
      const fileData = await DocumentService.convertFileToBase64(selectedFile);
      
      await DocumentService.addDocument({
        title: uploadData.title.trim(),
        description: uploadData.description.trim(),
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
        category: uploadData.category as any,
        uploadDate: todayIsoDate(),
        expiryDate: uploadData.expiryDate || undefined,
        credits: uploadData.credits ? parseInt(uploadData.credits) : undefined,
        fileData
      });

      setSuccess("Documento caricato con successo!");
      onUploadClose();
      resetUploadForm();
      loadDocuments();
    } catch (error) {
      console.error("Errore nel caricamento documento:", error);
      setError("Errore nel caricamento del documento");
    } finally {
      setLoading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadData({
      title: "",
      description: "",
      category: "corso_aggiornamento",
      expiryDate: "",
      credits: ""
    });
    setSelectedFile(null);
  };

  const handleDownload = (document: Document) => {
    DocumentService.downloadDocument(document);
  };

  const handlePreview = (doc: Document) => {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    const blob = base64ToBlob(doc.fileData, doc.mimeType || "application/pdf");
    const url = URL.createObjectURL(blob);
    setPreviewPdfUrl(url);
    setPreviewDocument(doc);
    onPreviewOpen();
  };

  const closePreview = () => {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
    setPreviewDocument(null);
    onPreviewClose();
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
      setSuccess("Documento eliminato con successo");
      onDeleteClose();
      setDocumentToDelete(null);
      loadDocuments();
    } catch (error) {
      setError("Errore nell'eliminazione del documento");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDocuments = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return documents.filter((doc) => {
      const matchesSearch =
        doc.title.toLowerCase().includes(term) ||
        doc.description?.toLowerCase().includes(term) ||
        doc.fileName.toLowerCase().includes(term);
      const matchesCategory = selectedCategory === "all" || doc.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [documents, searchTerm, selectedCategory]);

  const HeaderActions = (
    <Button
      variant="bordered"
      onPress={onUploadOpen}
      startContent={<FileText size={18} />}
      className="font-medium border-default-300 text-default-700 bg-white"
    >
      Carica documento
    </Button>
  );

  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Documenti personali"
        subtitle="Corsi ECM, attestati e documenti professionali tuoi: le carte dei pazienti stanno nella loro scheda."
        actions={HeaderActions}
      />

      <Card className="shadow-sm">
        <CardBody className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <Input
              placeholder="Cerca per titolo, descrizione o nome file..."
              value={searchTerm}
              onValueChange={setSearchTerm}
              startContent={<Search size={18} className="text-default-500" />}
              className="flex-1"
              variant="bordered"
              isClearable
            />
            <Select
              placeholder="Categoria"
              selectedKeys={[selectedCategory]}
              onSelectionChange={(keys) => setSelectedCategory(getSelectionValue(keys as "all" | Set<Key>, "all"))}
              className="w-full md:w-56"
              variant="bordered"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Messages */}
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

      {/* Loading */}
      {loading && <DocumentsGridSkeleton />}

      {/* Documents Grid */}
      {!loading && (
        <>
          {filteredDocuments.length === 0 ? (
            <Card className="shadow-md border border-gray-100">
              <CardBody className="text-center py-12">
                <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {searchTerm ? "Nessun documento trovato" : "Nessun documento caricato"}
                </h3>
                <p className="text-gray-500 mb-4">
                  {searchTerm 
                    ? "Prova a modificare i termini di ricerca."
                    : "Inizia caricando i tuoi primi documenti di aggiornamento professionale."
                  }
                </p>
                {/* self-center: nel CardBody in colonna il pulsante si
                    allargava a tutta la card. */}
                {!searchTerm && (
                  <Button
                    color="primary"
                    onPress={onUploadOpen}
                    startContent={<FileText size={18} />}
                    className="self-center font-medium"
                  >
                    Carica il primo documento
                  </Button>
                )}
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map((doc) => (
                <Card key={doc.id} className="shadow-sm hover:shadow-md transition-all border border-gray-100 bg-white/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-start justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary-100/70 text-primary-600">
                          <FileText size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base line-clamp-2">
                            {doc.title}
                          </h3>
                          <p className="text-sm text-gray-500">{doc.fileName}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody className="pt-0 space-y-3">
                    <Chip
                      color={getCategoryColor(doc.category)}
                      variant="flat"
                      size="sm"
                    >
                      {getCategoryLabel(doc.category)}
                    </Chip>

                    {doc.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {doc.description}
                      </p>
                    )}

                    <div className="space-y-2 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <span>Caricato:</span>
                        <span>{format(parseISO(doc.uploadDate), "dd/MM/yyyy")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Dimensione:</span>
                        <span>{formatFileSize(doc.fileSize)}</span>
                      </div>
                      {doc.credits && (
                        <div className="flex justify-between">
                          <span>Crediti ECM:</span>
                          <span className="font-medium">{doc.credits}</span>
                        </div>
                      )}
                      {doc.expiryDate && (
                        <div className="flex justify-between">
                          <span>Scadenza:</span>
                          <span>{format(parseISO(doc.expiryDate), "dd/MM/yyyy")}</span>
                        </div>
                      )}
                    </div>

                    <Divider />

                    <div className="flex gap-2">
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
              ))}
            </div>
          )}
        </>
      )}

      {/* Anteprima documento (PDF) */}
      <AppModal
        isOpen={isPreviewOpen}
        onClose={closePreview}
        size="5xl"
        classNames={{ base: "max-h-[90vh]", body: "p-0 overflow-hidden flex flex-col", wrapper: "items-center" }}
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="border-b border-gray-200 pb-2">
            <h2 className="text-xl font-bold truncate pr-8">
              {previewDocument?.title ?? "Anteprima documento"}
            </h2>
          </ModalHeader>
          <ModalBody className="flex-1 min-h-0">
            {previewDocument && previewPdfUrl && (
              <div className="flex-1 min-h-[70vh] w-full bg-gray-100 rounded-lg overflow-hidden">
                <iframe
                  title={previewDocument.title}
                  src={previewPdfUrl}
                  className="w-full h-full min-h-[70vh] border-0"
                />
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

      {/* Upload Modal */}
      <AppModal isOpen={isUploadOpen} onClose={onUploadClose} size="2xl">
        <ModalContent>
          <ModalHeader>
            <h2 className="text-xl font-bold">Carica un documento</h2>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Titolo del documento"
                placeholder="Es. Corso ECM Cardiologia 2024"
                value={uploadData.title}
                onValueChange={(value) => setUploadData(prev => ({ ...prev, title: value }))}
                variant="bordered"
                isRequired
              />

              <Textarea
                label="Descrizione (Opzionale)"
                placeholder="Breve descrizione del documento..."
                value={uploadData.description}
                onValueChange={(value) => setUploadData(prev => ({ ...prev, description: value }))}
                variant="bordered"
                maxRows={3}
              />

              <Select
                label="Categoria"
                selectedKeys={[uploadData.category]}
                onSelectionChange={(keys) => setUploadData(prev => ({
                  ...prev,
                  category: getSelectionValue(keys as "all" | Set<Key>, prev.category)
                }))}
                variant="bordered"
                isRequired
              >
                {CATEGORY_OPTIONS.filter((option) => option.key !== "all").map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label === "Corsi di aggiornamento" ? "Corso di aggiornamento" : option.label}
                  </SelectItem>
                ))}
              </Select>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Crediti ECM (Opzionale)"
                  type="number"
                  placeholder="Es. 10"
                  value={uploadData.credits}
                  onValueChange={(value) => setUploadData(prev => ({ ...prev, credits: value }))}
                  variant="bordered"
                />
                <Input
                  label="Data di scadenza"
                  type="date"
                  value={uploadData.expiryDate}
                  onValueChange={(value) => setUploadData(prev => ({ ...prev, expiryDate: value }))}
                  variant="bordered"
                />
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="space-y-2">
                    <Upload className="mx-auto w-8 h-8 text-gray-500" />
                    <p className="text-sm text-gray-600">
                      {selectedFile ? selectedFile.name : "Clicca per selezionare un file PDF"}
                    </p>
                    {selectedFile && (
                      <p className="text-xs text-gray-500">
                        {formatFileSize(selectedFile.size)}
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
              isDisabled={!selectedFile || !uploadData.title.trim()}
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
