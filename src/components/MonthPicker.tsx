"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function MonthPicker({ value, param = "month" }: { value: string; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <input
      type="month"
      aria-label="Month"
      className="input w-auto"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set(param, e.target.value);
        router.push(`${path}?${next.toString()}`);
      }}
    />
  );
}

export function PrintButton() {
  return <button type="button" className="btn no-print" onClick={() => window.print()}>Print / Save PDF</button>;
}
