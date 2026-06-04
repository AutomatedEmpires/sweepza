import { BottomNav } from "@/components/bottom-nav";

export function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
