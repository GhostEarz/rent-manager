"use client";
import { switchHouseAction } from "@/actions/properties";

export function HouseSwitcher({
  houses, houseId,
}: {
  houses: { id: number; name: string; locationName: string }[]; houseId: number | null;
}) {
  return (
    <form action={switchHouseAction} className="mb-3">
      <select
        name="houseId"
        defaultValue={houseId ?? ""}
        className="input text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">All houses</option>
        {houses.map((h) => <option key={h.id} value={h.id}>{h.locationName} — {h.name}</option>)}
      </select>
    </form>
  );
}
