import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@nextui-org/react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { AppModal } from "../components/AppModal";

/**
 * Cosa non è salvato e dove: l'avviso lo dice, e "Portami lì" ci riporta il
 * medico per salvare invece di farlo cercare.
 */
export type DettaglioNonSalvato = {
  /** Dove sono le modifiche, es. "Profilo del medico". */
  dove: string;
  /** I campi cambiati, es. ["Nome", "Telefono"]. */
  cosa?: string[];
  /** Porta il medico alle modifiche (scorre la pagina, apre la scheda…). */
  mostra?: () => void;
};

type UnsavedChangesContextValue = {
  isDirty: boolean;
  setDirty: (key: string, dirty: boolean, dettaglio?: DettaglioNonSalvato) => void;
  requestNavigation: (href: string) => boolean;
  guardAction: (action: () => void) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null,
);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [dirtyFlags, setDirtyFlags] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const pendingHref = useRef<string | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const allowLeaveRef = useRef(false);
  const isDirtyRef = useRef(false);
  // Nel ref, non nello stato: il dettaglio cambia a ogni tasto e serve solo
  // quando l'avviso si apre (che ridisegna comunque).
  const dettagli = useRef<Record<string, DettaglioNonSalvato>>({});

  const isDirty = Object.values(dirtyFlags).some(Boolean);
  isDirtyRef.current = isDirty;

  const setDirty = useCallback((key: string, dirty: boolean, dettaglio?: DettaglioNonSalvato) => {
    if (dirty && dettaglio) dettagli.current[key] = dettaglio;
    else delete dettagli.current[key];
    setDirtyFlags((prev) => {
      if (!dirty) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === dirty) return prev;
      return { ...prev, [key]: dirty };
    });
  }, []);

  const openModal = useCallback((href: string | null, action: (() => void) | null) => {
    pendingHref.current = href;
    pendingAction.current = action;
    setModalOpen(true);
  }, []);

  const requestNavigation = useCallback(
    (href: string) => {
      if (!isDirty) return true;
      openModal(href, null);
      return false;
    },
    [isDirty, openModal],
  );

  const guardAction = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      openModal(null, action);
    },
    [isDirty, openModal],
  );

  const confirmLeave = useCallback(() => {
    setModalOpen(false);
    allowLeaveRef.current = true;
    setDirtyFlags({});
    const href = pendingHref.current;
    const action = pendingAction.current;
    pendingHref.current = null;
    pendingAction.current = null;
    if (action) {
      action();
    } else if (href) {
      navigate(href);
    }
    queueMicrotask(() => {
      allowLeaveRef.current = false;
    });
  }, [navigate]);

  const elencoDettagli = Object.entries(dettagli.current)
    .filter(([k]) => dirtyFlags[k])
    .map(([, d]) => d);
  const daMostrare = elencoDettagli.find((d) => d.mostra);

  const portamiLi = useCallback(() => {
    setModalOpen(false);
    pendingHref.current = null;
    pendingAction.current = null;
    daMostrare?.mostra?.();
  }, [daMostrare]);

  const cancelLeave = useCallback(() => {
    setModalOpen(false);
    pendingHref.current = null;
    pendingAction.current = null;
  }, []);

  // Intercetta il pulsante Indietro del browser (useBlocker richiede data router).
  useEffect(() => {
    if (!isDirty) return;

    const trapBack = () => {
      window.history.pushState({ unsavedGuard: true }, "", window.location.href);
    };

    trapBack();

    const onPopState = () => {
      if (allowLeaveRef.current || !isDirtyRef.current) return;
      trapBack();
      openModal(null, () => {
        allowLeaveRef.current = true;
        window.history.back();
        queueMicrotask(() => {
          allowLeaveRef.current = false;
        });
      });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isDirty, openModal]);

  const value = useMemo(
    () => ({ isDirty, setDirty, requestNavigation, guardAction }),
    [isDirty, setDirty, requestNavigation, guardAction],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <AppModal
        isOpen={modalOpen}
        onClose={cancelLeave}
        placement="center"
        backdrop="blur"
        classNames={{
          base: "border border-warning-200",
          header: "border-b border-default-100",
          footer: "border-t border-default-100",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-3 text-warning-700">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-100">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="text-base font-semibold text-gray-900">Corioli Cardiologia</p>
              <p className="text-sm font-normal text-gray-500">
                Modifiche non salvate
              </p>
            </div>
          </ModalHeader>
          <ModalBody>
            {elencoDettagli.length > 0 ? (
              <>
                <p className="text-gray-700">Non hai salvato:</p>
                <ul className="space-y-2">
                  {elencoDettagli.map((d) => (
                    <li key={d.dove} className="rounded-lg border border-warning-200 bg-warning-50/60 px-3 py-2">
                      <p className="text-sm font-semibold text-gray-900">{d.dove}</p>
                      {d.cosa?.length ? (
                        <p className="text-sm text-gray-600">{d.cosa.join(", ")}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-gray-500">Se esci ora, queste modifiche andranno perse.</p>
              </>
            ) : (
              <p className="text-gray-700">
                Hai modifiche non salvate. Se esci ora, andranno perse. Vuoi
                uscire comunque?
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onPress={confirmLeave}>
              Esci senza salvare
            </Button>
            {daMostrare ? (
              <Button className="bg-brand-700 text-white" endContent={<ArrowRight size={16} />} onPress={portamiLi}>
                Portami lì per salvare
              </Button>
            ) : (
              <Button variant="flat" onPress={cancelLeave}>
                Resta sulla pagina
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </AppModal>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  }
  return ctx;
}

/**
 * Registra lo stato dirty di una pagina (es. form visita/paziente). Con
 * `dettaglio` l'avviso dice cosa non è salvato e sa riportare il medico lì.
 */
export function useRegisterUnsavedChanges(key: string, dirty: boolean, dettaglio?: DettaglioNonSalvato) {
  const { setDirty } = useUnsavedChanges();
  const firma = dettaglio ? `${dettaglio.dove}|${(dettaglio.cosa ?? []).join(",")}` : "";
  const ultimo = useRef(dettaglio);
  ultimo.current = dettaglio;
  useEffect(() => {
    setDirty(key, dirty, ultimo.current);
  }, [key, dirty, firma, setDirty]);
  useEffect(() => () => setDirty(key, false), [key, setDirty]);
}
