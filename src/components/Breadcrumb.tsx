import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useUnsavedChanges } from "../contexts/UnsavedChangesContext";

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const navigate = useNavigate();
  const { requestNavigation } = useUnsavedChanges();

  if (items.length === 0) return null;

  const goTo = (path: string) => {
    if (requestNavigation(path)) navigate(path);
  };

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 mb-2" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
          {item.path ? (
            <button
              type="button"
              onClick={() => goTo(item.path!)}
              className="hover:text-primary transition-colors truncate max-w-[140px]"
            >
              {item.label}
            </button>
          ) : (
            <span className="font-medium text-gray-700 truncate max-w-[180px]">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
