import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  padded?: boolean;
}

const sizes: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[95vw] sm:h-[90vh]",
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  padded = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md transition-opacity duration-200"
        style={{ background: "var(--overlay)" }}
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          "card relative flex w-full flex-col overflow-hidden border border-app-border bg-app-panel shadow-2xl transition-all duration-200 animate-fade-up",
          "h-[calc(100dvh-1rem)] rounded-t-2xl sm:max-h-[90vh] sm:rounded-2xl",
          sizes[size]
        )}
      >
        {(title || subtitle) && (
          <header className="flex items-start justify-between gap-4 border-b border-app-border/80 px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-base font-bold text-app-text">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-app-muted">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              className="btn-ghost -mr-1.5 -mt-0.5 h-9 w-9 shrink-0 rounded-xl p-0 text-app-muted hover:text-app-text sm:-mr-2 sm:-mt-1 sm:h-8 sm:w-8"
              onClick={onClose}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
        )}

        <div
          className={clsx(
            "min-h-0 flex-1 overflow-auto overscroll-contain",
            padded && "p-4 sm:p-6"
          )}
        >
          {children}
        </div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-app-border/80 bg-app-panel2/30 px-4 py-3 pb-safe sm:flex-nowrap sm:px-6 sm:py-3.5 [&>*]:grow sm:[&>*]:grow-0">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
