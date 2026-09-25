import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { brandSuccessAlertSx } from "../utils/muiBrand";

type ToastSeverity = "success" | "error" | "info" | "warning";

interface ToastContextValue {
  showToast: (message: string, severity?: ToastSeverity) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<ToastSeverity>("success");

  const showToast = useCallback((msg: string, sev: ToastSeverity = "success") => {
    setMessage(msg);
    setSeverity(sev);
    setOpen(true);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={5000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        // Gli scarti di MUI (8px, 24px da sm) vanno contati da sotto la barra
        // del titolo: dal bordo della finestra la notifica finisce sotto i
        // pulsanti di sistema.
        sx={{
          top: {
            xs: "calc(8px + var(--barra-finestra))",
            sm: "calc(24px + var(--barra-finestra))",
          },
        }}
      >
        <Alert
          onClose={() => setOpen(false)}
          severity={severity}
          variant="filled"
          sx={{ width: "100%", ...brandSuccessAlertSx }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { showToast: (_m: string) => {} };
  return ctx;
}
