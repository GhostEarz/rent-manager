import { logoutAction } from "@/actions/auth";
import { HouseSwitcher } from "@/components/HouseSwitcher";
import { Nav } from "@/components/Nav";
import { activeHouseId } from "@/lib/house";
import { requireUser } from "@/lib/session";
import { ensureCharges } from "@/server/services/billing";
import { getSettings } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureCharges().catch((e) => console.error("ensureCharges failed", e)); // lazy monthly generation
  const [settings, houses, houseId] = await Promise.all([getSettings(), Q.houseOptions(), activeHouseId()]);
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1600px] lg:grid lg:grid-cols-[13rem_1fr] lg:gap-6 lg:p-4">
      <aside className="no-print border-b border-line bg-card p-3 lg:sticky lg:top-4 lg:h-fit lg:rounded-xl lg:border">
        <div className="mb-2 flex items-center justify-between lg:mb-4 lg:block">
          <div>
            <p className="font-semibold leading-tight">{settings.propertyName}</p>
            <p className="text-xs text-muted">{user.name} · {user.role}</p>
          </div>
          <form action={logoutAction} className="lg:mt-2"><button className="btn btn-sm">Sign out</button></form>
        </div>
        {houses.length > 1 && <HouseSwitcher houses={houses as never} houseId={houseId} />}
        <Nav role={user.role} />
      </aside>
      <main className="min-w-0 p-3 lg:p-0">{children}</main>
    </div>
  );
}
