import { logoutAction } from "@/actions/auth";
import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/session";
import { ensureCharges } from "@/server/services/billing";
import { getSettings } from "@/server/services/common";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureCharges().catch((e) => console.error("ensureCharges failed", e)); // lazy monthly generation
  const settings = await getSettings();
  return (
    <div className="mx-auto min-h-screen max-w-7xl lg:grid lg:grid-cols-[13rem_1fr] lg:gap-6 lg:p-4">
      <aside className="no-print border-b border-line bg-card p-3 lg:sticky lg:top-4 lg:h-fit lg:rounded-xl lg:border">
        <div className="mb-2 flex items-center justify-between lg:mb-4 lg:block">
          <div>
            <p className="font-semibold leading-tight">{settings.propertyName}</p>
            <p className="text-xs text-muted">{user.name} · {user.role}</p>
          </div>
          <form action={logoutAction} className="lg:mt-2"><button className="btn btn-sm">Sign out</button></form>
        </div>
        <Nav role={user.role} />
      </aside>
      <main className="min-w-0 p-3 lg:p-0">{children}</main>
    </div>
  );
}
