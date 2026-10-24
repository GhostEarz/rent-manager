import Link from "next/link";
import { MonthPicker } from "@/components/MonthPicker";
import { Empty, PageHeader } from "@/components/ui";
import { fmtMonth, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import * as A from "@/server/services/analytics";
import { currentMonth } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function BuildingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const month = (await searchParams).month?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const [houses, stats, rooms] = await Promise.all([
    Q.listHouses(user), A.revenueByHouse(user, A.monthFilter(month)), Q.listRooms(user),
  ]);
  const byId = new Map(stats.map((s: any) => [s.houseId as number, s]));

  return (
    <>
      <PageHeader title="Buildings" sub={`${houses.length} building${houses.length === 1 ? "" : "s"} · ${fmtMonth(month)}`}>
        <MonthPicker value={month} />
        {user.role === "OWNER" && <Link href="/properties" className="btn btn-primary">Add / manage</Link>}
      </PageHeader>
      {houses.length === 0 ? (
        <Empty>{user.role === "OWNER" ? <>No buildings yet. <Link href="/properties" className="text-indigo-600 underline">Add your first location and building.</Link></> : "No buildings are assigned to you yet. Ask the owner to assign one."}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {houses.map((h: any) => {
            const s: any = byId.get(h.id) ?? { revenue: 0, expenses: 0, net: 0 };
            const rs = rooms.filter((r) => r.houseId === h.id);
            const monthly = rs.filter((r) => r.rentalType === "MONTHLY");
            const daily = rs.filter((r) => r.rentalType === "DAILY");
            return (
              <Link key={h.id} href={`/buildings/${h.id}?month=${month}`} className="card block space-y-3 transition hover:shadow-md">
                <div>
                  <p className="text-xs text-muted">{h.locationName}</p>
                  <p className="text-lg font-semibold leading-tight">{h.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {rs.length} rooms · {monthly.length} monthly ({monthly.filter((r) => r.status === "OCCUPIED").length} occupied) · {daily.length} daily
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted">Revenue</p><p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{rupees(s.revenue)}</p></div>
                  <div><p className="text-muted">Expenses</p><p className="text-sm font-semibold">{rupees(s.expenses)}</p></div>
                  <div><p className="text-muted">Net</p><p className={`text-sm font-semibold ${s.net < 0 ? "text-red-600" : ""}`}>{rupees(s.net)}</p></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
