// Pure billing rules — no DB, no framework. Dates are "YYYY-MM-DD", months "YYYY-MM".

export type Status = "PAID" | "PARTIAL" | "UNPAID";

export const monthOf = (date: string) => date.slice(0, 7);

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const firstDay = (month: string) => `${month}-01`;
export const lastDay = (month: string) => `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function dueDateFor(month: string, dueDay: number): string {
  const d = Math.min(Math.max(1, dueDay), daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

/**
 * Rent from room history that applies to `month` (latest entry effective on/before the 1st).
 * Only MONTHLY-tagged rows are considered, so a DAILY-rate row from a past rental-type switch
 * is never misread as a monthly rent (and vice versa).
 */
export function rentForMonth(
  history: { rent: number; effectiveFrom: string; rentalType?: string }[],
  month: string,
  fallback: number,
): number {
  const first = firstDay(month);
  const monthly = history.filter((h) => h.rentalType == null || h.rentalType === "MONTHLY");
  let best: { rent: number; effectiveFrom: string } | undefined;
  for (const h of monthly) {
    if (h.effectiveFrom <= first && (!best || h.effectiveFrom > best.effectiveFrom)) best = h;
  }
  // Tenancy started before any history entry → earliest known rent.
  if (!best && monthly.length) best = [...monthly].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  return best ? best.rent : fallback;
}

export interface ChargeInput {
  rent: number;
  startDate: string;
  endDate: string | null;
  month: string;
  prorate: boolean;
}

/** Amount due for a tenancy in a month. 0 if the tenancy does not overlap the month. */
export function chargeAmount({ rent, startDate, endDate, month, prorate }: ChargeInput): number {
  const mStart = firstDay(month);
  const mEnd = lastDay(month);
  if (startDate > mEnd || (endDate && endDate < mStart)) return 0;
  if (!prorate) return rent;
  const from = startDate > mStart ? startDate : mStart;
  const to = endDate && endDate < mEnd ? endDate : mEnd;
  const days = daysBetween(from, to) + 1;
  const dim = daysInMonth(month);
  return days >= dim ? rent : Math.round((rent * days) / dim);
}

/**
 * Nights billed for a stay: the number of calendar days between check-in and check-out,
 * excluding the checkout day itself (standard hotel convention — a guest who checks in on
 * the 1st and out on the 3rd stays 2 nights). An open stay (no checkOut yet) is billed
 * through `asOf` (default: check-in day itself, i.e. 0 nights so far).
 */
export function nightsBetween(checkIn: string, checkOut: string | null, asOf?: string): number {
  const end = checkOut ?? asOf ?? checkIn;
  return Math.max(0, daysBetween(checkIn, end));
}

export function stayAmountDue(dailyRate: number, nights: number): number {
  return dailyRate * Math.max(0, nights);
}

export function statusFor(due: number, paid: number): Status {
  if (paid <= 0) return due <= 0 ? "PAID" : "UNPAID";
  return paid >= due ? "PAID" : "PARTIAL";
}

export interface OpenCharge {
  id: number;
  month: string;
  amountDue: number;
  paid: number;
}

/**
 * Split `amount` across charges. If `targetId` is given that charge is filled first,
 * then the oldest unpaid ones. Whatever is left over is advance credit.
 */
export function allocate(
  charges: OpenCharge[],
  amount: number,
  targetId?: number | null,
): { allocations: { chargeId: number; amount: number }[]; credit: number } {
  const order = [...charges].sort((a, b) => a.month.localeCompare(b.month));
  if (targetId) {
    const i = order.findIndex((c) => c.id === targetId);
    if (i > 0) order.unshift(...order.splice(i, 1));
  }
  let left = amount;
  const allocations: { chargeId: number; amount: number }[] = [];
  for (const c of order) {
    if (left <= 0) break;
    const open = c.amountDue - c.paid;
    if (open <= 0) continue;
    const take = Math.min(open, left);
    allocations.push({ chargeId: c.id, amount: take });
    left -= take;
  }
  return { allocations, credit: left };
}
