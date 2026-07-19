import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
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
    <div className="min-h-dvh bg-paper lg:flex">
      <ServiceWorkerRegistration />
      {/* Keyboard/SR shortcut past the utility bar and rail on every page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-paper"
      >
        Skip to content
      </a>
      <SideRail />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:mx-0 lg:max-w-none lg:flex-1">
        {utility ? (
          <div className="border-b border-line bg-surface/70">{utility}</div>
        ) : null}
        {/* tabIndex={-1} lets the skip link move programmatic focus here so the
            next Tab lands inside the content, not back at the top of the page. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="w-full flex-1 pb-20 focus:outline-none lg:mx-auto lg:max-w-5xl lg:px-8 lg:pb-10"
        >
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
