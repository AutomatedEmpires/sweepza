import { BottomNav } from "@/components/bottom-nav";
import { SideRail } from "@/components/side-rail";

// Responsive app shell. Below lg this is the original mobile column with a
// persistent bottom nav; at lg and up the bottom nav is replaced by a side
// rail and the content column widens so grids can breathe. One IA, one shell.
export function MobileShell({
  children,
  utility,
}: {
  children: React.ReactNode;
  utility?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-cream lg:flex">
      <SideRail />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:mx-0 lg:max-w-none lg:flex-1">
        {utility ? (
          <div className="border-b border-sand bg-white/70">{utility}</div>
        ) : null}
        <main className="w-full flex-1 pb-20 lg:mx-auto lg:max-w-5xl lg:px-8 lg:pb-10">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
