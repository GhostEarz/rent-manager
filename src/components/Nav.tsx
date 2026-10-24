"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = readonly [href: string, label: string, icon: string];

// Primary tabs (bottom bar on phones). Everything else lives under "More".
const tabs: Item[] = [
  ["/dashboard", "Home", "▦"],
  ["/buildings", "Buildings", "⌂"],
  ["/rent", "Rent", "₹"],
  ["/expenses", "Expenses", "▤"],
];
const more: Item[] = [
  ["/stays", "Daily stays", "☾"],
  ["/tenants", "Tenants", "☺"],
  ["/payments", "Payments", "✓"],
  ["/reports", "Reports", "≡"],
  ["/analytics", "Analytics", "◔"],
  ["/properties", "Locations & buildings", "⚑"],
  ["/team", "Team", "☻"],
  ["/settings", "Settings", "⚙"],
];
const ownerOnly = new Set(["/properties", "/team", "/settings"]);

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function Nav({ role }: { role: "OWNER" | "MANAGER" }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const extra = more.filter(([h]) => role === "OWNER" || !ownerOnly.has(h));
  const moreActive = extra.some(([h]) => isActive(path, h));

  return (
    <>
      {/* Desktop: full sidebar list */}
      <nav className="hidden flex-col gap-1 lg:flex">
        {[...tabs, ...extra].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive(path, href) ? "bg-indigo-600 text-white" : "text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile: bottom tab bar + "More" sheet */}
      <nav aria-label="Primary" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {tabs.map(([href, label, icon]) => (
            <li key={href} className="flex-1">
              <Link href={href} onClick={() => setOpen(false)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive(path, href) ? "text-indigo-600 dark:text-indigo-400" : "text-muted"}`}>
                <span aria-hidden className="text-lg leading-none">{icon}</span>{label}
              </Link>
            </li>
          ))}
          <li className="flex-1">
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${moreActive || open ? "text-indigo-600 dark:text-indigo-400" : "text-muted"}`}>
              <span aria-hidden className="text-lg leading-none">⋯</span>More
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="no-print fixed inset-0 z-20 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-14 rounded-t-2xl border border-line bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <ul className="grid grid-cols-2 gap-2">
              {extra.map(([href, label, icon]) => (
                <li key={href}>
                  <Link href={href} onClick={() => setOpen(false)} className={`flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium ${isActive(path, href) ? "bg-indigo-600 text-white" : ""}`}>
                    <span aria-hidden>{icon}</span>{label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
