import Link from "next/link";

export function PageHeader({ title, children, sub }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export const Row = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-3">{children}</div>;

const tones: Record<string, string> = {
  PAID: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PARTIAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  UNPAID: "bg-red-500/15 text-red-700 dark:text-red-300",
  VACANT: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  OCCUPIED: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  MAINTENANCE: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ENDED: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  ADMIN: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  STAFF: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};
export const Badge = ({ v, children }: { v: string; children?: React.ReactNode }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[v] ?? tones.VACANT}`}>{children ?? v}</span>
);

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "good" | "bad"; sub?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-3 py-8 text-center text-sm text-muted">{children}</p>;

export const TableWrap = ({ children }: { children: React.ReactNode }) => <div className="card overflow-x-auto p-0">{children}</div>;

export const ALink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-indigo-600 hover:underline dark:text-indigo-400">{children}</Link>
);

export const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
