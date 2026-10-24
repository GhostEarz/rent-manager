"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function AnalyticsFilters({
  month, locations, houses,
}: {
  month: string;
  locations: { id: number; name: string }[];
  houses: { id: number; name: string; locationName: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${path}?${next.toString()}`);
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <input type="month" aria-label="Month" className="input w-auto" value={month} onChange={(e) => set("month", e.target.value)} />
      <select aria-label="Location" className="input w-auto" value={sp.get("locationId") ?? ""} onChange={(e) => set("locationId", e.target.value)}>
        <option value="">All locations</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <select aria-label="House" className="input w-auto" value={sp.get("houseId") ?? ""} onChange={(e) => set("houseId", e.target.value)}>
        <option value="">All buildings</option>
        {houses.map((h) => <option key={h.id} value={h.id}>{h.locationName} — {h.name}</option>)}
      </select>
      <select aria-label="Rental type" className="input w-auto" value={sp.get("rentalType") ?? ""} onChange={(e) => set("rentalType", e.target.value)}>
        <option value="">All types</option>
        <option value="MONTHLY">Monthly</option>
        <option value="DAILY">Daily</option>
      </select>
    </div>
  );
}
