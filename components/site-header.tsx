import Link from "next/link";
import { Shuttlecock } from "./shuttlecock";

function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

export function SiteHeader({
  total,
  right,
}: {
  total: number;
  right?: React.ReactNode;
}) {
  return (
    <header className="bg-court text-paper border-b-[3px] border-ink">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-lime">
            <Shuttlecock className="h-10 w-10" />
          </span>
          <span className="display text-3xl leading-none text-paper sm:text-4xl">
            Birdie
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <div className="nb-sm bg-lime px-4 py-2 text-ink">
            <div className="text-[10px] font-bold uppercase tracking-widest">
              Total collectable
            </div>
            <div className="money text-2xl font-bold leading-none">
              {formatINR(total)}
            </div>
          </div>
          {right}
        </div>
      </div>
    </header>
  );
}
