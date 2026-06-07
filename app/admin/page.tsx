import { requireAdmin } from "@/lib/session";
import {
  getDaysMap,
  getLog,
  getPeople,
  getSettings,
  getStats,
  getSummary,
} from "@/lib/queries";
import { todayStr } from "@/lib/dates";
import type { AdminData } from "@/lib/admin-types";
import { AdminConsole } from "./admin-console";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();

  const data: AdminData = {
    people: getPeople(),
    settings: getSettings(),
    days: getDaysMap(),
    summary: getSummary(),
    stats: getStats(),
    log: getLog(),
  };

  return <AdminConsole initialData={data} today={todayStr()} />;
}
