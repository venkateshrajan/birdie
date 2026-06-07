import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getChatMessages, getStats } from "@/lib/queries";
import { splitwiseApiKey, splitwiseGroupName } from "@/lib/env";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await requireAdmin();

  const messages = getChatMessages();
  const stats = getStats();
  const group = splitwiseGroupName();
  const keyConfigured = splitwiseApiKey().length > 0;

  return (
    <>
      <SiteHeader
        total={stats.total}
        right={
          <Link
            href="/admin"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "nb-press h-9 border-[3px] bg-paper-2 font-bold text-ink",
            )}
          >
            ← Console
          </Link>
        }
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        <ChatClient
          initialMessages={messages.map((m) => ({ role: m.role, content: m.content }))}
          group={group}
          keyConfigured={keyConfigured}
        />
      </main>
    </>
  );
}
