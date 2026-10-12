"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/dashboard", "Dashboard"], ["/rent", "Rent"], ["/rooms", "Rooms"], ["/tenants", "Tenants"],
  ["/payments", "Payments"], ["/expenses", "Expenses"], ["/reports", "Reports"], ["/settings", "Settings"],
] as const;

export function Nav({ role }: { role: "ADMIN" | "STAFF" }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.filter(([h]) => role === "ADMIN" || h !== "/settings").map(([href, label]) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
