"use client";
import { useActionState, useEffect } from "react";
import { useCloseModal } from "./Modal";

type Result = { ok?: true; error?: string } | undefined;

export function ActionForm({
  action, submit = "Save", children, danger = false, confirm, inline = false, className = "",
}: {
  action: (prev: unknown, fd: FormData) => Promise<Result>;
  submit?: string; children?: React.ReactNode; danger?: boolean; confirm?: string; inline?: boolean; className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined as Result);
  const close = useCloseModal();
  useEffect(() => {
    if (state?.ok) close?.();
  }, [state, close]);
  return (
    <form
      action={formAction}
      className={inline ? `inline ${className}` : `space-y-3 ${className}`}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button type="submit" disabled={pending} className={`btn ${danger ? "btn-danger" : "btn-primary"} ${inline ? "btn-sm" : ""}`}>
        {pending ? "…" : submit}
      </button>
    </form>
  );
}

/** Tiny "delete"-style button: a form that posts hidden fields after a confirm(). */
export function ConfirmAction({
  action, fields, label, confirm, className = "",
}: {
  action: (prev: unknown, fd: FormData) => Promise<Result>;
  fields: Record<string, string | number>; label: string; confirm: string; className?: string;
}) {
  return (
    <ActionForm action={action} submit={label} danger confirm={confirm} inline className={className}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </ActionForm>
  );
}
