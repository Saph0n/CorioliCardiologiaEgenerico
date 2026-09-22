import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Skeleton,
} from "@nextui-org/react";
import DesktopShell from "./DesktopShell";

const NAVBAR_MENU_WIDTHS = ["w-20", "w-16", "w-14", "w-20", "w-24", "w-12"];

const STARTUP_MIN_MS = 2500;

export type PageSkeletonVariant =
  | "home"
  | "grid"
  | "table"
  | "settings"
  | "form"
  | "patient"
  | "documents"
  | "help"
  | "default";

export function resolvePageSkeletonVariant(pathname: string): PageSkeletonVariant {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return "home";
  // Prima di "/pazienti": l'elenco dei pazienti a rischio e' una lista, non
  // la griglia delle schede.
  if (path.startsWith("/pazienti-a-rischio")) return "table";
  if (path.startsWith("/pazienti")) return "grid";
  if (path.startsWith("/visite") || path.startsWith("/gruppi-ricerca")) return "table";
  if (path.startsWith("/settings")) return "settings";
  if (
    path.startsWith("/add-patient") ||
    path.startsWith("/add-visit") ||
    path.startsWith("/edit-visit")
  ) {
    return "form";
  }
  if (path.includes("/patient-history") && path.endsWith("/files")) {
    return "documents";
  }
  if (path.includes("/patient-history")) return "patient";
  if (path.startsWith("/documents")) return "documents";
  if (path.startsWith("/help")) return "help";
  return "default";
}

export function NavbarSkeleton() {
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
        <Skeleton className="h-8 w-8 rounded-lg ml-2 shrink-0 md:hidden" />

        <NavbarBrand className="mr-4 min-w-0 max-w-[min(56vw,260px)] shrink md:max-w-[220px] lg:max-w-[260px]">
          <Skeleton className="h-8 w-32 md:w-36 rounded-lg" />
        </NavbarBrand>

        {NAVBAR_MENU_WIDTHS.map((width, index) => (
          <NavbarItem key={index} className="hidden md:flex">
            <Skeleton className={`h-4 ${width} rounded-md`} />
          </NavbarItem>
        ))}

        <NavbarItem className="hidden sm:flex ml-2 pl-2 border-l border-default-200">
          <Skeleton className="h-7 w-32 rounded-full" />
        </NavbarItem>

        <NavbarItem className="hidden md:flex">
          <Skeleton className="h-8 w-8 rounded-full" />
        </NavbarItem>
      </NavbarContent>
    </Navbar>
  );
}

function SkeletonPageHeader({
  withActions = false,
  singleAction = false,
}: {
  withActions?: boolean;
  singleAction?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Skeleton className="h-14 w-14 rounded-xl shrink-0" />
          <div className="space-y-2 min-w-0">
            <Skeleton className="h-8 w-48 md:w-64 max-w-full rounded-lg" />
            <Skeleton className="h-4 w-56 max-w-full rounded-md" />
          </div>
        </div>
        {withActions && (
          <div className="flex gap-3 w-full md:w-auto">
            {singleAction ? (
              <Skeleton className="h-10 w-full md:w-40 rounded-lg" />
            ) : (
              <>
                <Skeleton className="h-10 flex-1 md:w-36 rounded-lg" />
                <Skeleton className="h-10 flex-1 md:w-36 rounded-lg" />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonSearchCard({ tall = false }: { tall?: boolean }) {
  return (
    <CardSkeleton className="mt-4">
      <Skeleton className={`w-full rounded-xl ${tall ? "h-12" : "h-11"}`} />
    </CardSkeleton>
  );
}

function CardSkeleton({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-default-200 bg-white/80 p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function SkeletonKpiCard() {
  return (
    <CardSkeleton className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1 min-w-0">
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-8 w-14 rounded-lg" />
          <Skeleton className="h-3 w-28 rounded-md" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
      </div>
    </CardSkeleton>
  );
}

function SkeletonDashboardListRow({
  variant,
}: {
  variant: "patient" | "visit";
}) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {variant === "visit" ? (
          <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
        ) : (
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/5 max-w-[140px] rounded-md" />
          <Skeleton className="h-3 w-2/5 max-w-[100px] rounded-md" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <Skeleton className="h-5 w-10 rounded-full" />
        <Skeleton className="h-3.5 w-3.5 rounded" />
      </div>
    </div>
  );
}

function SkeletonDashboardListCard({
  titleWidth,
  rowVariant,
  rowCount,
}: {
  titleWidth: string;
  rowVariant: "patient" | "visit";
  rowCount: number;
}) {
  return (
    <div className="corioli-card overflow-hidden">
      <div className="corioli-card-header flex justify-between items-center">
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="h-4 w-4 rounded shrink-0" />
          <Skeleton className={`h-5 ${titleWidth} rounded-md`} />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
      </div>
      <div>
        {Array.from({ length: rowCount }).map((_, i) => (
          <SkeletonDashboardListRow key={i} variant={rowVariant} />
        ))}
      </div>
    </div>
  );
}

function HomePageSkeleton() {
  return (
    <>
      <SkeletonPageHeader withActions />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonKpiCard key={i} />
        ))}
      </div>
      {/* Tre colonne come la dashboard: pazienti, visite e "Da tenere
          d'occhio". Lo scheletro deve avere la forma della pagina che sta
          per arrivare, se no al caricamento il contenuto salta. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SkeletonDashboardListCard
          titleWidth="w-32"
          rowVariant="patient"
          rowCount={6}
        />
        <SkeletonDashboardListCard
          titleWidth="w-28"
          rowVariant="visit"
          rowCount={5}
        />
        <SkeletonDashboardListCard
          titleWidth="w-36"
          rowVariant="patient"
          rowCount={5}
        />
      </div>
    </>
  );
}

export function PatientGridSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-44 rounded-md mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    </>
  );
}

function GridPageSkeleton() {
  return (
    <>
      <div className="space-y-4">
        <SkeletonPageHeader withActions />
        <SkeletonSearchCard tall />
      </div>
      <PatientGridSkeleton />
    </>
  );
}

function TablePageSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <>
      <SkeletonPageHeader withActions={withAction} singleAction={withAction} />
      <CardSkeleton>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <Skeleton className="h-5 w-36 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-11 w-full sm:max-w-md rounded-xl mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </CardSkeleton>
    </>
  );
}

function SkeletonSettingsCardHeader({
  titleWidth,
  withSubtitle = false,
}: {
  titleWidth: string;
  withSubtitle?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-5 w-5 rounded shrink-0" />
      <div className="min-w-0">
        <Skeleton className={`h-6 ${titleWidth} rounded-md`} />
        {withSubtitle && <Skeleton className="h-3 w-56 rounded-md mt-1" />}
      </div>
    </div>
  );
}

function SkeletonProfiloCard() {
  return (
    <CardSkeleton className="h-full flex flex-col shadow-lg p-0">
      <div className="p-4 pb-2">
        <SkeletonSettingsCardHeader titleWidth="w-36" />
      </div>
      <div className="flex flex-1 flex-col gap-6 px-4 pb-4 min-h-0">
        <div className="flex items-center gap-4 flex-shrink-0">
          <Skeleton className="h-20 w-20 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-3 w-full max-w-[220px] rounded-md" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between gap-5 min-h-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-xl shrink-0" />
      </div>
    </CardSkeleton>
  );
}

function SkeletonAmbulatoriCard() {
  return (
    <CardSkeleton className="h-full flex flex-col shadow-lg p-0">
      <div className="p-4 pb-2">
        <SkeletonSettingsCardHeader titleWidth="w-28" />
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 min-h-0">
        <div className="rounded-lg border border-default-200 bg-default-50/50 p-3 flex-shrink-0">
          <Skeleton className="h-4 w-44 rounded-md mb-3" />
          <Skeleton className="h-4 w-full max-w-xs rounded-md" />
        </div>
        <div className="h-px bg-default-200 flex-shrink-0" />
        <div className="flex flex-col gap-2 mt-auto flex-shrink-0">
          <Skeleton className="h-4 w-48 rounded-md" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </CardSkeleton>
  );
}

function SkeletonBackupCard() {
  return (
    <CardSkeleton className="h-full flex flex-col shadow-lg">
      <SkeletonSettingsCardHeader titleWidth="w-32" />
      <div className="flex flex-1 flex-col justify-between gap-6 mt-2 min-h-0">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[4.5rem] rounded-lg" />
            ))}
          </div>
          <div className="rounded-lg border border-default-200 p-4 bg-default-50/30">
            <div className="flex justify-between items-center gap-3">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-28 rounded-md" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-default-200 p-4 space-y-3">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="space-y-3 mt-auto">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-3 w-4/5 mx-auto rounded-md" />
        </div>
      </div>
    </CardSkeleton>
  );
}

function SkeletonFunzionalitaVisiteCard() {
  return (
    <CardSkeleton className="h-full shadow-lg">
      <SkeletonSettingsCardHeader titleWidth="w-44" withSubtitle />
      <div className="space-y-4 mt-2">
        <div className="rounded-lg border border-default-200 bg-default-50/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 rounded-md" />
              <Skeleton className="h-3 w-full max-w-xs rounded-md" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full shrink-0" />
          </div>
        </div>
        <div className="rounded-lg border border-default-200 p-4 space-y-2">
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
        <div className="rounded-lg border border-default-200 p-4 space-y-3">
          <Skeleton className="h-4 w-36 rounded-md" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-6 w-11 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </CardSkeleton>
  );
}

function SkeletonDuplicatiCard() {
  return (
    <CardSkeleton className="shadow-lg p-0 overflow-hidden">
      <div className="p-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded shrink-0" />
            <Skeleton className="h-5 w-40 rounded-md" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 space-y-4">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="py-6 flex justify-center">
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>
      </div>
    </CardSkeleton>
  );
}

function SkeletonModelliCard() {
  return (
    <CardSkeleton className="shadow-lg">
      <SkeletonSettingsCardHeader titleWidth="w-52" />
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Skeleton className="h-5 w-5 rounded shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-52 rounded-md" />
            <Skeleton className="h-3 w-40 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-10 w-32 rounded-lg shrink-0" />
      </div>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-lg" />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-default-200 bg-default-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2 flex-1 min-w-0">
          <Skeleton className="h-4 w-full max-w-lg rounded-md" />
          <Skeleton className="h-3 w-3/4 max-w-md rounded-md" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg shrink-0" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex gap-6 pb-3 border-b border-default-200">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-36 rounded-md hidden sm:block" />
          <Skeleton className="h-4 w-16 rounded-md hidden sm:block" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </CardSkeleton>
  );
}

function SkeletonInfoAppCard() {
  return (
    <CardSkeleton className="shadow-lg py-6">
      <div className="flex flex-col items-center space-y-2">
        <Skeleton className="h-5 w-36 rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>
    </CardSkeleton>
  );
}

function SettingsPageSkeleton() {
  return (
    <>
      <SkeletonPageHeader />
      <CardSkeleton className="shadow-sm py-3 px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-4 w-full max-w-lg rounded-md" />
            <Skeleton className="h-4 w-4/5 max-w-md rounded-md" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      </CardSkeleton>

      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:items-stretch [&>*]:h-full">
          <SkeletonProfiloCard />
          <SkeletonAmbulatoriCard />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SkeletonBackupCard />
          <SkeletonFunzionalitaVisiteCard />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Skeleton className="h-6 w-52 rounded-md" />
          <Skeleton className="h-4 w-80 max-w-full rounded-md mt-2" />
        </div>
        <SkeletonDuplicatiCard />
      </div>

      <SkeletonModelliCard />
      <SkeletonInfoAppCard />
    </>
  );
}

function FormPageSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-56 rounded-md mb-2" />
      <SkeletonPageHeader />
      {Array.from({ length: 3 }).map((_, i) => (
        <CardSkeleton key={i}>
          <Skeleton className="h-6 w-48 rounded-md mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </CardSkeleton>
      ))}
      <div className="flex justify-end gap-3">
        <Skeleton className="h-10 w-28 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
    </>
  );
}

function PatientDetailSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-72 rounded-md" />
      <CardSkeleton className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <Skeleton className="h-20 w-20 rounded-full shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-56 max-w-full rounded-lg" />
            <Skeleton className="h-4 w-80 max-w-full rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-10 w-32 rounded-lg hidden md:block" />
        </div>
      </CardSkeleton>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-28 shrink-0 rounded-lg" />
        ))}
      </div>
      <CardSkeleton>
        <Skeleton className="h-5 w-32 rounded-md mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl mb-2 last:mb-0" />
        ))}
      </CardSkeleton>
    </>
  );
}

export function DocumentsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-52 rounded-2xl" />
      ))}
    </div>
  );
}

function DocumentsPageSkeleton() {
  return (
    <>
      <SkeletonPageHeader withActions singleAction />
      <CardSkeleton>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-11 rounded-xl md:col-span-2" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      </CardSkeleton>
      <DocumentsGridSkeleton />
    </>
  );
}

function HelpPageSkeleton() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSkeleton className="h-[420px] lg:h-[520px] flex flex-col">
          <Skeleton className="h-6 w-44 rounded-md mb-4" />
          <Skeleton className="h-11 w-full rounded-xl mb-4" />
          <div className="flex-1 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </CardSkeleton>
        <CardSkeleton className="h-[420px] lg:h-[520px] flex flex-col">
          <Skeleton className="h-6 w-36 rounded-md mb-4" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className={`h-14 rounded-xl ${i % 2 === 0 ? "w-4/5 ml-auto" : "w-4/5"}`}
              />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-xl mt-4" />
        </CardSkeleton>
      </div>
    </>
  );
}

function DefaultPageSkeleton() {
  return (
    <>
      <SkeletonPageHeader />
      <CardSkeleton className="min-h-[320px]">
        <Skeleton className="h-5 w-40 rounded-md mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl mb-2 last:mb-0" />
        ))}
      </CardSkeleton>
    </>
  );
}

export function PageSkeletonContent({
  variant,
  pathname,
}: {
  variant: PageSkeletonVariant;
  pathname?: string;
}) {
  switch (variant) {
    case "home":
      return <HomePageSkeleton />;
    case "grid":
      return <GridPageSkeleton />;
    case "table":
      return (
        <TablePageSkeleton withAction={pathname?.startsWith("/visite") ?? false} />
      );
    case "settings":
      return <SettingsPageSkeleton />;
    case "form":
      return <FormPageSkeleton />;
    case "patient":
      return <PatientDetailSkeleton />;
    case "documents":
      return <DocumentsPageSkeleton />;
    case "help":
      return <HelpPageSkeleton />;
    default:
      return <DefaultPageSkeleton />;
  }
}

export function PageLoadingSkeleton({
  variant,
  pathname,
}: {
  variant: PageSkeletonVariant;
  pathname?: string;
}) {
  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-300">
      <PageSkeletonContent variant={variant} pathname={pathname} />
    </div>
  );
}

export function RoutePageSkeleton({ pathname }: { pathname?: string }) {
  const location = useLocation();
  const resolvedPath = pathname ?? location.pathname;
  const variant = resolvePageSkeletonVariant(resolvedPath);

  return <PageLoadingSkeleton variant={variant} pathname={resolvedPath} />;
}

/** @deprecated Usa RoutePageSkeleton dentro DesktopShell */
export function AppStartupSkeleton() {
  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-300">
      <HomePageSkeleton />
    </div>
  );
}

export function AppStartupGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), STARTUP_MIN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready) {
    if (location.pathname === "/blocked") {
      return (
        <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-50 flex items-center justify-center p-6">
          <Skeleton className="h-48 w-full max-w-md rounded-2xl" />
        </div>
      );
    }

    return (
      <DesktopShell navbar={<NavbarSkeleton />}>
        <RoutePageSkeleton pathname={location.pathname} />
      </DesktopShell>
    );
  }

  return children;
}
