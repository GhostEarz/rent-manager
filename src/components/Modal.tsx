"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";

const Ctx = createContext<(() => void) | null>(null);
export const useCloseModal = () => useContext(Ctx);

export function Modal({
  trigger, title, children, variant = "", small = false,
}: {
  trigger: React.ReactNode; title: string; children: React.ReactNode; variant?: "primary" | "danger" | ""; small?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const cls = `btn ${variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : ""} ${small ? "btn-sm" : ""}`;
  return (
    <>
      <button type="button" className={cls} onClick={() => setOpen(true)}>{trigger}</button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-auto w-[min(32rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-card p-0 shadow-xl"
      >
        {open && (
          <div className="max-h-[85vh] overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{title}</h2>
              <button type="button" aria-label="Close" className="text-muted hover:text-fg" onClick={() => setOpen(false)}>✕</button>
            </div>
            <Ctx.Provider value={() => setOpen(false)}>{children}</Ctx.Provider>
          </div>
        )}
      </dialog>
    </>
  );
}
