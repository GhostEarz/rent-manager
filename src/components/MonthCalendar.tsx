import Link from "next/link";
import { daysInMonth } from "@/server/services/billing-core";

export interface CalendarStay {
  id: number;
  guestName: string;
  checkIn: string;
  checkOut: string | null;
  status: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid for one daily room. A night belongs to a stay when checkIn <= night < checkOut,
 * so the check-out day shows as free (the next guest can arrive that day). An open-ended stay is
 * shown as occupied up to and including today. Vacant nights link to
 * `bookHref(date)` to start a booking from that date.
 */
export function MonthCalendar({
  month, stays, today, bookHref,
}: { month: string; stays: CalendarStay[]; today: string; bookHref: (date: string) => string }) {
  const days = daysInMonth(month);
  const firstDow = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // Monday-first

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`pad-${i}`} />);
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const s = stays.find((x) => x.checkIn <= date && (x.checkOut === null ? date <= today : date < x.checkOut));
    const isToday = date === today;
    const ring = isToday ? "ring-2 ring-indigo-500" : "";
    if (s) {
      const first = s.checkIn === date || d === 1;
      const tone = s.status === "BOOKED" ? "bg-amber-500/20 border-amber-500/50" : "bg-indigo-500/20 border-indigo-500/50";
      cells.push(
        <div key={date} title={`${s.guestName}: ${s.checkIn} → ${s.checkOut ?? "open"}`} className={`min-h-14 rounded-lg border p-1 text-[11px] ${tone} ${ring}`}>
          <span className="font-semibold">{d}</span>
          {first && <p className="truncate leading-tight">{s.guestName}</p>}
        </div>,
      );
    } else {
      cells.push(
        <Link key={date} href={bookHref(date)} aria-label={`Book from ${date}`} className={`min-h-14 rounded-lg border border-line p-1 text-[11px] text-muted hover:bg-black/5 dark:hover:bg-white/10 ${ring}`}>
          <span className="font-semibold">{d}</span>
          <p className="leading-tight text-emerald-600 dark:text-emerald-400">free</p>
        </Link>,
      );
    }
  }
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">{cells}</div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-indigo-500/50 bg-indigo-500/20" />Occupied</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-amber-500/50 bg-amber-500/20" />Booked</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-line" />Vacant (tap to book)</span>
      </div>
    </div>
  );
}
