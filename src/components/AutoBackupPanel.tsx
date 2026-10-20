import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Spinner } from "@nextui-org/react";
import { HardDriveDownload, FolderOpen, RotateCcw } from "lucide-react";
import {
  createBackupFile,
  isFileBackupAvailable,
  listBackupFiles,
  openBackupsFolder,
  restoreBackupFile,
  type BackupFileInfo,
} from "../services/BackupFileService";
import { ConfirmDangerModal } from "./ConfirmDangerModal";
import { useToast } from "../contexts/ToastContext";

/** Etichette leggibili per il motivo di creazione del backup. */
const REASON_LABELS: Record<string, string> = {
  auto: "Automatico",
  manuale: "Manuale",
  "pre-import": "Prima di un import",
  "pre-restore": "Prima di un ripristino",
  // Copia dell'archivio nel vecchio formato, presa al primo avvio della
  // versione con l'archivio a righe (electron/main.js, migrateIfNeeded).
  "pre-migrazione": "Prima dell'aggiornamento dell'archivio",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Copie di sicurezza automatiche del database.
 *
 * L'app ne crea una al primo avvio di ogni giorno e prima di ogni operazione
 * distruttiva. Da qui il medico può crearne una a richiesta, aprire la cartella
 * o tornare a una copia precedente.
 */
export default function AutoBackupPanel() {
  const { showToast } = useToast();
  const available = isFileBackupAvailable();
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<BackupFileInfo | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBackups(await listBackupFiles());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!available) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [available, refresh]);

  if (!available) return null;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createBackupFile("manuale");
      if (result?.ok) {
        showToast("Copia di sicurezza creata.");
        await refresh();
      } else {
        showToast(result?.error ?? "Backup non riuscito.", "error");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async () => {
    if (!pendingRestore) return;
    const target = pendingRestore;
    setPendingRestore(null);
    const result = await restoreBackupFile(target.fileName);
    // In caso di successo l'app si riavvia: si arriva qui solo se qualcosa è fallito.
    if (!result.ok) {
      showToast(result.error ?? "Ripristino non riuscito.", "error");
    }
  };

  const lastBackup = backups[0];

  return (
    <div className="rounded-lg border border-default-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <HardDriveDownload className="w-4 h-4 text-primary" />
          Copie di sicurezza automatiche
        </div>
        <Chip size="sm" variant="flat" color={backups.length ? "success" : "warning"}>
          {backups.length} {backups.length === 1 ? "copia" : "copie"}
        </Chip>
      </div>

      <p className="text-xs text-default-500">
        Corioli Cardiologia salva una copia del database al primo avvio di ogni giorno e prima
        di ogni import o ripristino. Le copie restano sul tuo computer.
      </p>

      {loading ? (
        <div className="flex justify-center py-3">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">Ultima copia</span>
          <span
            className={`font-semibold ${lastBackup ? "corioli-text-brand" : "text-warning-600"}`}
          >
            {lastBackup ? formatDateTime(lastBackup.createdAt) : "Nessuna"}
          </span>
        </div>
      )}

      {backups.length > 0 && (
        <div className="corioli-scroll max-h-40 overflow-y-auto space-y-1 pr-1">
          {backups.map((b) => (
            <div
              key={b.fileName}
              className="flex items-center justify-between gap-2 rounded-md bg-default-50 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">
                  {formatDateTime(b.createdAt)}
                </p>
                <p className="text-[11px] text-default-500 truncate">
                  {REASON_LABELS[b.reason] ?? b.reason} · {formatSize(b.size)}
                </p>
              </div>
              <Button
                size="sm"
                variant="light"
                className="shrink-0"
                startContent={<RotateCcw className="w-3.5 h-3.5" />}
                onPress={() => setPendingRestore(b)}
              >
                Ripristina
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="bordered"
          className="flex-1"
          isLoading={creating}
          onPress={() => void handleCreate()}
        >
          Crea copia adesso
        </Button>
        <Button
          size="sm"
          variant="light"
          startContent={<FolderOpen className="w-4 h-4" />}
          onPress={() => void openBackupsFolder()}
        >
          Cartella
        </Button>
      </div>

      <ConfirmDangerModal
        isOpen={pendingRestore !== null}
        title="Ripristinare questa copia?"
        subtitle="Lo stato attuale viene salvato in una copia prima del ripristino"
        confirmLabel="Ripristina e riavvia"
        onConfirm={() => void handleRestore()}
        onClose={() => setPendingRestore(null)}
      >
        <p className="text-sm text-gray-700">
          Tutti i dati attuali verranno sostituiti con quelli del{" "}
          <span className="font-semibold">
            {pendingRestore ? formatDateTime(pendingRestore.createdAt) : ""}
          </span>
          . L'app si riavvierà per applicare il ripristino.
        </p>
      </ConfirmDangerModal>
    </div>
  );
}
