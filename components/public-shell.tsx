import { BottomNav } from "@/components/bottom-nav";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <ServiceWorkerRegistration />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-paper"
      >
        Skip to content
      </a>
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="min-h-[60dvh] focus:outline-none">
        {children}
      </main>
      <PublicFooter />
      <BottomNav />
    </div>
  );
}
