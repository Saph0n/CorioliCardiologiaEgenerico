import { useState, useEffect } from "react";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  Tooltip,
  Spinner,
  Badge,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { DoctorService, PreferenceService } from "../services/OfflineServices";
import type { Ambulatorio } from "../types/Storage";
import { Search } from "lucide-react";
import { storageService } from "../services/StorageServiceFallback";
import { sendHeartbeat } from "../services/HeartbeatService";
import { fetchClientUnreadCount } from "../services/SupportChatService";
import { useUnsavedChanges } from "../contexts/UnsavedChangesContext";
import { useCheckPatientModal } from "../contexts/CheckPatientModalContext";

const SUPPORT_UNREAD_POLL_MS = 45_000;

/**
 * Voci principali. "Documenti" (corsi ECM e carte personali del medico) non
 * c'e' piu': accanto a Pazienti e Visite prometteva i documenti dei pazienti,
 * che stanno invece nella loro scheda. Si apre da Impostazioni.
 */
const menuItems = [
  { label: "Dashboard", href: "/" },
  { label: "Pazienti", href: "/pazienti" },
  { label: "Visite", href: "/visite" },
  { label: "Impostazioni", href: "/settings" },
  { label: "Aiuto", href: "/help" },
];

const SU_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

/**
 * "Gruppi" compare fra le voci solo con i gruppi di ricerca accesi in
 * Impostazioni: prima, accesi, si raggiungevano soltanto dalla card in
 * dashboard o dai chip nella scheda di un paziente.
 */
function vociMenu(gruppiAbilitati: boolean) {
  if (!gruppiAbilitati) return menuItems;
  return [...menuItems.slice(0, 3), { label: "Gruppi", href: "/gruppi-ricerca" }, ...menuItems.slice(3)];
}

export default function AppNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestNavigation } = useUnsavedChanges();
  const { openPatientSearch } = useCheckPatientModal();

  const goTo = (href: string) => {
    if (requestNavigation(href)) navigate(href);
  };

  const onGuardedNavClick = (
    event: React.MouseEvent,
    href: string,
  ) => {
    if (location.pathname === href) return;
    if (!requestNavigation(href)) event.preventDefault();
  };
  const [ambulatori, setAmbulatori] = useState<Ambulatorio[]>([]);
  const [switchingAmbulatorio, setSwitchingAmbulatorio] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [gruppiAbilitati, setGruppiAbilitati] = useState(false);

  // Si rilegge a ogni cambio di pagina: la preferenza si accende e si spegne
  // da Impostazioni, e tornando da li' la voce deve esserci gia'.
  useEffect(() => {
    let attivo = true;
    PreferenceService.getPreferences()
      .then((prefs) => {
        if (attivo) setGruppiAbilitati(Boolean(prefs?.gruppiRicercaEnabled));
      })
      .catch(() => {});
    return () => {
      attivo = false;
    };
  }, [location.pathname]);

  // Sede attualmente in uso: la primaria, con fallback alla prima (coerente col PDF/referto).
  const activeAmbulatorio =
    ambulatori.find((a) => a.isPrimario) ?? ambulatori[0] ?? null;

  const loadDoctor = async () => {
    try {
      const doctor = await DoctorService.getDoctor();
      setAmbulatori(doctor?.ambulatori ?? []);
    } catch {
      setAmbulatori([]);
    }
  };

  /**
   * Cambia la sede in uso direttamente dalla navbar, senza navigare:
   * il form della visita resta invariato (nessun dato perso). Salva solo la
   * lista ambulatori (updateDoctor fa il merge) e notifica l'app.
   */
  const handleSelectAmbulatorio = async (id: string) => {
    if (id === activeAmbulatorio?.id || switchingAmbulatorio) return;
    const previousList = ambulatori;
    const newList = previousList.map((a) => ({
      ...a,
      isPrimario: a.id === id,
    }));
    setAmbulatori(newList); // aggiornamento ottimistico
    setSwitchingAmbulatorio(true);
    try {
      await DoctorService.updateDoctor({ ambulatori: newList });
      window.dispatchEvent(new CustomEvent("appdottori-doctor-updated"));
    } catch (e) {
      console.error("Errore cambio ambulatorio:", e);
      setAmbulatori(previousList); // rollback
    } finally {
      setSwitchingAmbulatorio(false);
    }
  };

  const BLOCKED_STORAGE_KEY = "blocked_users";
  const ONE_HOUR_MS = 60 * 1000; // 1 minute

  useEffect(() => {
    loadDoctor();

    const checkFeature = async () => {
      try {
        const doctor = await DoctorService.getDoctor();
        const id = doctor?.id?.trim();
        if (!id) return;

        const raw = await storageService.getPreference(BLOCKED_STORAGE_KEY);
        let lastCheckedAt: number | null = null;
        if (raw) {
          try {
            const data = JSON.parse(raw) as {
              blocked?: boolean;
              checkedAt?: string;
            };
            if (data.checkedAt) {
              lastCheckedAt = new Date(data.checkedAt).getTime();
              if (Date.now() - lastCheckedAt < ONE_HOUR_MS) return;
            }
          } catch {
            // ignore invalid stored data
          }
        }

        if (doctor) {
          const { blocked, reason } = await sendHeartbeat(doctor, "corioli-cardiologia");
          if (blocked === null) return;
          const payload = {
            blocked: blocked,
            reason: reason,
            checkedAt: new Date().toISOString(),
          };
          await storageService.setPreference(
            BLOCKED_STORAGE_KEY,
            JSON.stringify(payload),
          );

          if (blocked === true) navigate("/blocked");
        }
      } catch (e) {
        console.error("checkFeature blocked_users:", e);
      }
    };
    void checkFeature();
  }, [navigate]);

  useEffect(() => {
    const onDoctorUpdated = () => loadDoctor();
    window.addEventListener("appdottori-doctor-updated", onDoctorUpdated);
    return () =>
      window.removeEventListener("appdottori-doctor-updated", onDoctorUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollUnread = async () => {
      try {
        const doctor = await DoctorService.getDoctor();
        if (!doctor?.id || cancelled) return;
        const count = await fetchClientUnreadCount(doctor.id);
        if (!cancelled) setSupportUnread(count);
      } catch {
        // silenzioso
      }
    };

    pollUnread();
    const interval = setInterval(pollUnread, SUPPORT_UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [location.pathname]);

  return (
    <Navbar
      classNames={{
        base: "py-4 backdrop-filter-none bg-transparent",
        wrapper: "px-0 w-full justify-center bg-transparent",
        item: "hidden md:flex",
      }}
      height="64px"
    >
      <NavbarContent
        className="border-small border-default-200 bg-white/90 shadow-medium gap-4 rounded-full px-4 backdrop-blur-md backdrop-saturate-150"
        justify="center"
      >
        {/* Toggle */}
        <NavbarMenuToggle className="text-default-500 ml-2 md:hidden" />

        {/* Logo brand */}
        <NavbarBrand className="mr-4 min-w-0 max-w-[min(56vw,260px)] shrink md:max-w-[220px] lg:max-w-[260px]">
          <Link
            to="/"
            onClick={(e) => onGuardedNavClick(e, "/")}
            className="flex min-w-0 items-center outline-none ring-offset-2 ring-offset-background rounded-md focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Corioli Cardiologia — vai alla dashboard"
          >
            <img
              src={`${import.meta.env.BASE_URL}corioli-logo.svg`}
              alt="Corioli Cardiologia"
              width={158}
              height={48}
              className="h-8 w-auto max-h-9 object-contain object-left md:h-9 md:max-h-10"
              decoding="async"
            />
          </Link>
        </NavbarBrand>

        {/* Navigation Items */}
        {vociMenu(gruppiAbilitati).map((item) => {
          const isActive =
            item.href === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.href);
          const link = (
            <Link
              to={item.href}
              onClick={(e) => onGuardedNavClick(e, item.href)}
              aria-current={isActive ? "page" : undefined}
              className={`text-sm ${isActive ? "text-foreground font-semibold" : "text-default-600"} hover:text-foreground transition-colors`}
            >
              {item.label}
            </Link>
          );
          return (
            <NavbarItem key={item.href} className="hidden md:flex">
              {item.href === "/help" && supportUnread > 0 ? (
                <Badge content={supportUnread > 99 ? "99+" : supportUnread} color="danger" size="sm">
                  {link}
                </Badge>
              ) : (
                link
              )}
            </NavbarItem>
          );
        })}

        {/* Ricerca del paziente da qualunque pagina (Ctrl+K). Prima per
            trovare un paziente bisognava passare dall'elenco. */}
        <NavbarItem className="hidden md:flex ml-2">
          <button
            type="button"
            onClick={openPatientSearch}
            className="navbar-search"
            aria-label="Cerca paziente"
          >
            <Search size={15} aria-hidden />
            <span>Cerca paziente</span>
            <kbd className="corioli-kbd">{SU_MAC ? "⌘K" : "Ctrl K"}</kbd>
          </button>
        </NavbarItem>

        {/* Ambulatorio in uso - menu a tendina per cambiarlo al volo (senza perdere dati) */}
        <NavbarItem className="hidden sm:flex ml-2 pl-2 border-l border-default-200">
          {activeAmbulatorio ? (
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <button
                  type="button"
                  className="navbar-ambulatorio-set"
                  aria-label="Cambia ambulatorio in uso"
                  title="Cambia la sede in uso senza perdere la visita in corso"
                  disabled={switchingAmbulatorio}
                >
                  {switchingAmbulatorio ? (
                    <Spinner size="sm" />
                  ) : (
                    <i className="ti ti-map-pin" aria-hidden />
                  )}
                  {activeAmbulatorio.nome}
                  <i
                    className="ti ti-chevron-down"
                    aria-hidden
                    style={{ fontSize: 12 }}
                  />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Sedi disponibili"
                onAction={(key) => {
                  const k = String(key);
                  if (k === "__manage") {
                    goTo("/settings");
                    return;
                  }
                  void handleSelectAmbulatorio(k);
                }}
              >
                <DropdownSection title="Sede in uso" showDivider>
                  {ambulatori.map((amb) => (
                    <DropdownItem
                      key={amb.id}
                      startContent={<i className="ti ti-map-pin" aria-hidden />}
                      endContent={
                        amb.id === activeAmbulatorio.id ? (
                          <i className="ti ti-check text-primary" aria-hidden />
                        ) : null
                      }
                      description={`${amb.indirizzo}, ${amb.citta}`}
                    >
                      {amb.nome}
                    </DropdownItem>
                  ))}
                </DropdownSection>
                <DropdownItem
                  key="__manage"
                  startContent={<i className="ti ti-settings" aria-hidden />}
                  className="text-default-500"
                >
                  Gestisci sedi…
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          ) : (
            <Tooltip content="Configura l'ambulatorio primario nelle Impostazioni">
              <button
                type="button"
                className="navbar-ambulatorio-cta"
                onClick={() => goTo("/settings")}
              >
                <i className="ti ti-alert-triangle" aria-hidden />
                Imposta ambulatorio
              </button>
            </Tooltip>
          )}
        </NavbarItem>

      </NavbarContent>

      {/* Mobile Menu */}
      <NavbarMenu
        className="rounded-large border-small border-default-200 bg-white/95 shadow-medium top-[calc(var(--navbar-height)_/_2_+_var(--barra-finestra))] mx-auto mt-16 max-h-[40vh] max-w-[80vw] py-6 backdrop-blur-md backdrop-saturate-150"
        motionProps={{
          initial: { opacity: 0, y: -20 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -20 },
          transition: {
            ease: "easeInOut",
            duration: 0.2,
          },
        }}
      >
        <NavbarMenuItem className="pt-2 pb-3 border-b border-default-100">
          {activeAmbulatorio ? (
            <div className="flex w-full flex-col gap-1">
              <span className="text-default-500 text-xs font-medium uppercase tracking-wide">
                Sede in uso
              </span>
              {ambulatori.map((amb) => {
                const isActive = amb.id === activeAmbulatorio.id;
                return (
                  <button
                    key={amb.id}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-default-100 text-foreground font-semibold"
                        : "text-default-500 hover:bg-default-50"
                    }`}
                    disabled={switchingAmbulatorio}
                    onClick={() => void handleSelectAmbulatorio(amb.id)}
                  >
                    <i className="ti ti-map-pin flex-shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{amb.nome}</span>
                    {isActive && (
                      <i className="ti ti-check text-primary" aria-hidden />
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                className="mt-1 flex items-center gap-2 px-2 text-sm text-default-500 hover:text-foreground"
                onClick={() => goTo("/settings")}
              >
                <i className="ti ti-settings" aria-hidden />
                <span>Gestisci sedi…</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="navbar-ambulatorio-cta"
              onClick={() => goTo("/settings")}
            >
              <i className="ti ti-alert-triangle" aria-hidden />
              Imposta ambulatorio
            </button>
          )}
        </NavbarMenuItem>
        <NavbarMenuItem className="pb-3 border-b border-default-100">
          <button
            type="button"
            className="flex items-center gap-2 text-default-600 text-sm w-full text-left hover:text-foreground"
            onClick={openPatientSearch}
          >
            <Search size={16} className="flex-shrink-0" />
            <span>Cerca paziente</span>
          </button>
        </NavbarMenuItem>
        {vociMenu(gruppiAbilitati).map((item, index) => (
          <NavbarMenuItem key={`${item.label}-${index}`}>
            <Link
              to={item.href}
              onClick={(e) => onGuardedNavClick(e, item.href)}
              className="text-default-500 w-full text-md hover:text-primary transition-colors"
            >
              {item.label}
            </Link>
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </Navbar>
  );
}
