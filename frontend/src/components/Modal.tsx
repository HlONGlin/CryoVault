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
  full: "max-w-[95vw] h-[90vh]",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "var(--overlay)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          "card relative flex w-full flex-col overflow-hidden shadow-glow animate-fade-up",
          sizes[size]
        )}
      >
        {(title || subtitle) && (
          <header className="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-base font-semibold text-app-text">
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
              className="btn-ghost -mr-2 -mt-1 p-2"
              onClick={onClose}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
        )}
        <div className={clsx("min-h-0 flex-1 overflow-auto", padded && "p-5")}>
          {children}
        </div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-app-border px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
