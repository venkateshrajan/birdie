import { redirect } from "next/navigation";
import { clearSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearSession();
  redirect("/login");
}

export async function GET() {
  await clearSession();
  redirect("/login");
}
