import Link from "next/link";
import { redirect } from "next/navigation";
import { Shuttlecock } from "@/components/shuttlecock";
import { isAdmin } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="nb w-full max-w-sm bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-court">
            <Shuttlecock className="h-12 w-12" />
          </span>
          <div>
            <h1 className="display text-3xl leading-none">Birdie</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Admin access
            </p>
          </div>
        </div>

        <LoginForm />

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Back to public view
          </Link>
        </div>
      </div>
    </main>
  );
}
