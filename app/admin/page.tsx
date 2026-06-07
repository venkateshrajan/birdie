import { requireAdmin } from "@/lib/session";
import { getAdminData } from "@/lib/ledger";
import { todayStr } from "@/lib/dates";
import { AdminConsole } from "./admin-console";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const data = await getAdminData();
  return <AdminConsole initialData={data} today={todayStr()} />;
}
