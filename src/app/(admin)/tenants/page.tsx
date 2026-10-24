import Link from "next/link";
import { TenantDialog } from "@/components/forms";
import { Badge, Empty, PageHeader, TableWrap } from "@/components/ui";
import { fmtDate, rupees } from "@/lib/format";
import { activeHouseId } from "@/lib/house";
import { requireUser } from "@/lib/session";
import * as Q from "@/server/services/queries";

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const houseId = await activeHouseId(user);
  const search = (await searchParams).q?.trim();
  const [rows, houses] = await Promise.all([Q.tenantsList(user, search, houseId), Q.houseOptions(user)]);
  return (
    <>
      <PageHeader title="Tenants" sub={`${rows.length} shown`}>
        <form className="flex gap-1">
          <input name="q" defaultValue={search} placeholder="Search name, phone, room" className="input w-52" />
          <button className="btn">Search</button>
        </form>
        <TenantDialog label="Add tenant" houses={houses as never} defaultHouseId={houseId} />
      </PageHeader>
      <TableWrap>
        {rows.length === 0 ? <Empty>No tenants found.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th>Room</th><th>Since</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td><Link className="font-medium hover:underline" href={`/tenants/${t.id}`}>{t.name}</Link></td>
                  <td>{t.phone ?? "—"}</td>
                  <td>{t.roomNumber ?? "—"}</td>
                  <td>{fmtDate(t.startDate)}</td>
                  <td className={`text-right font-medium ${t.balance > 0 ? "text-red-600" : t.balance < 0 ? "text-emerald-600" : ""}`}>
                    {t.balance < 0 ? `${rupees(-t.balance)} credit` : rupees(t.balance)}
                  </td>
                  <td><Badge v={t.tenancyId ? "ACTIVE" : "VACANT"}>{t.tenancyId ? "Living" : "No room"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>
    </>
  );
}
