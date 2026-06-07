import { redirect } from "next/navigation";
import { Shuttlecock } from "@/components/shuttlecock";
import { getSessionUser } from "@/lib/session";
import { splitwiseGroupName } from "@/lib/env";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  not_member: "That Splitwise account isn't in this group. Ask the admin to add you on Splitwise first.",
  state: "Login session expired. Please try again.",
  oauth: "Couldn't sign you in with Splitwise. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/");

  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? "Login failed. Please try again.") : null;
  const group = splitwiseGroupName();

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
              {group}
            </p>
          </div>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          Sign in with your Splitwise account to see who owes what.
        </p>

        {message && (
          <p className="nb-sm mb-4 bg-red px-3 py-2 text-sm font-bold text-paper">
            {message}
          </p>
        )}

        <a
          href="/api/auth/login"
          className="nb-press flex h-12 w-full items-center justify-center gap-2 border-[3px] border-ink bg-lime text-base font-bold text-ink hover:bg-lime-d"
        >
          Log in with Splitwise →
        </a>
      </div>
    </main>
  );
}
