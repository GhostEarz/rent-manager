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
  await ensureCharges(user.orgId).catch((e) => console.error("ensureCharges failed", e)); // lazy monthly generation
  const [settings, houses, houseId] = await Promise.all([getSettings(user.orgId), Q.houseOptions(user), activeHouseId(user)]);
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1600px] pb-20 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-6 lg:p-4 lg:pb-4">
      <aside className="no-print sticky top-0 z-10 border-b border-line bg-card px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:top-4 lg:h-fit lg:rounded-xl lg:border lg:p-3">
        <div className="flex items-center justify-between gap-2 lg:mb-4 lg:block">
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{settings.propertyName}</p>
            <p className="truncate text-xs text-muted">{user.name} · {user.role === "OWNER" ? "Owner" : "Manager"}</p>
          </div>
          <form action={logoutAction} className="shrink-0 lg:mt-2"><button className="btn btn-sm">Sign out</button></form>
        </div>
        {houses.length > 1 && <div className="mt-2 lg:mt-0"><HouseSwitcher houses={houses as never} houseId={houseId} /></div>}
        <Nav role={user.role} />
      </aside>
      <main className="min-w-0 p-3 lg:p-0">{children}</main>
    </div>
  );
}
