import ReactDOM from "react-dom/client";
import { NextUIProvider } from "@nextui-org/react";
import { HashRouter as Router } from "react-router-dom";
import App from "./App";
import BarraFinestra, { BARRA_FINESTRA_ATTIVA } from "./components/BarraFinestra";
import "./index.css";
import { initializeAppData } from "./services/seed";
import { ToastProvider } from "./contexts/ToastContext";
import { AppLockProvider } from "./contexts/AppLockContext";
import { configureClientApiAuth } from "./utils/configureClientApi";

configureClientApiAuth();

// Spazio per la barra del titolo gia' dal primo disegno, se no la pagina salta.
if (BARRA_FINESTRA_ATTIVA) document.documentElement.classList.add("con-barra-finestra");

// Inizializzazione dati all'avvio (non bloccante)
void initializeAppData();

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <NextUIProvider>
    <BarraFinestra />
    <Router
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ToastProvider>
        <AppLockProvider>
          <App />
        </AppLockProvider>
      </ToastProvider>
    </Router>
  </NextUIProvider>,
);
