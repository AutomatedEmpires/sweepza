import { BottomNav } from "@/components/bottom-nav";

export function MobileShell({
  children,
  utility,
}: {
  children: React.ReactNode;
  utility?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream">
      {utility ? <div className="border-b border-sand bg-white/70">{utility}</div> : null}
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
