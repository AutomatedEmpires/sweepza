import { Icon, type IconName } from "@/components/icon";

// The signed-out homepage hero. Replaces a single static 4.8MB brand PNG with a
// dynamic, self-contained scene built entirely from design tokens (app/tokens.css)
// and Tailwind keyframes (tailwind.config.ts). It is theme-aware for free — every
// color is a semantic token, so Sunrise (warm) and Midnight (jewel) both render
// correctly with no per-theme code. All motion is transform/opacity only, so it
// is cheap; the global prefers-reduced-motion clamp freezes it to a clean static
// composition. Labels are plain Sweepza prize categories — decorative, never a
// claim about any specific promotion.

type FloatingChip = {
  icon: IconName;
  label: string;
  tone: "ember" | "gold" | "ocean" | "pine";
  position: string;
  delay: string;
};

const CHIPS: FloatingChip[] = [
  { icon: "location", label: "Travel", tone: "ocean", position: "left-3 top-6 sm:left-5", delay: "0s" },
  { icon: "gift", label: "Gift cards", tone: "ember", position: "right-3 top-16 sm:right-6", delay: "1.1s" },
  { icon: "sparkle", label: "Electronics", tone: "pine", position: "bottom-6 left-6", delay: "2.2s" },
];

const TONE_DISC: Record<FloatingChip["tone"], string> = {
  ember: "bg-ember/12 text-ember",
  gold: "bg-gold/14 text-gold",
  ocean: "bg-ocean/12 text-ocean",
  pine: "bg-pine/14 text-pine",
};

const SPARKLES = [
  { className: "left-[18%] top-[22%] h-1.5 w-1.5", delay: "0s" },
  { className: "right-[16%] top-[38%] h-2 w-2", delay: "0.7s" },
  { className: "left-[28%] bottom-[24%] h-1 w-1", delay: "1.4s" },
  { className: "right-[26%] bottom-[30%] h-1.5 w-1.5", delay: "2.1s" },
];

export function HeroShowcase() {
  return (
    <div
      role="img"
      aria-label="Sweepza surfaces sweepstakes worth entering and remembers them for you."
      className="relative order-first aspect-[5/4] w-full select-none overflow-hidden rounded-sheet border border-line bg-surface shadow-e2 lg:order-last"
    >
      {/* Aurora — three drifting token-colored blobs behind everything. */}
      <div aria-hidden className="absolute inset-0">
        <span className="absolute -left-[15%] -top-[18%] h-[70%] w-[70%] rounded-full bg-ember/25 blur-3xl animate-hero-drift" />
        <span
          className="absolute -right-[18%] top-[6%] h-[62%] w-[62%] rounded-full bg-gold/25 blur-3xl animate-hero-drift"
          style={{ animationDelay: "-6s", animationDuration: "19s" }}
        />
        <span
          className="absolute -bottom-[22%] left-[16%] h-[66%] w-[66%] rounded-full bg-ocean/20 blur-3xl animate-hero-drift"
          style={{ animationDelay: "-11s", animationDuration: "22s" }}
        />
      </div>

      {/* Sparkles. */}
      <div aria-hidden className="absolute inset-0">
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className={`absolute rounded-full bg-gold shadow-[0_0_8px_rgb(var(--color-won)/0.6)] animate-hero-twinkle ${s.className}`}
            style={{ animationDelay: s.delay }}
          />
        ))}
      </div>

      {/* Layered "deck" — two ghost cards behind the focus card. */}
      <div aria-hidden className="absolute inset-0 grid place-items-center">
        <div className="relative h-[62%] w-[68%]">
          <div className="absolute inset-0 -rotate-6 rounded-card border border-line bg-surface-2/80 shadow-e1" />
          <div className="absolute inset-0 rotate-[7deg] rounded-card border border-line bg-surface-2/90 shadow-e1" />

          {/* Focus card — the sweep Sweepza surfaced for you. */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-card border border-line bg-surface p-4 shadow-e3 animate-hero-float">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-ember font-display text-base font-semibold leading-none text-on-accent shadow-e1">
                  S
                </span>
                <span className="font-display text-sm font-semibold tracking-tight text-ink">
                  Sweepza
                </span>
              </div>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-pine/12 text-pine ring-1 ring-pine/20 animate-ready-glow">
                <Icon name="check" size={14} weight="bold" />
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold/14 text-gold">
                <Icon name="trophy" size={26} weight="fill" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-graphite">
                  Featured sweepstakes
                </p>
                <p className="truncate font-display text-lg font-semibold leading-tight text-ink">
                  Grand prize
                </p>
              </div>
            </div>

            {/* A calm shimmer bar — the "one sweep from discovery to win" motif. */}
            <div className="relative h-2 overflow-hidden rounded-pill bg-line">
              <span className="absolute inset-y-0 left-0 w-2/3 rounded-pill bg-gradient-to-r from-ember to-gold" />
              <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-white/40 blur-[2px] animate-hero-sheen" />
            </div>
          </div>
        </div>
      </div>

      {/* Floating category chips that drift in around the deck. */}
      <div aria-hidden className="absolute inset-0">
        {CHIPS.map((chip) => (
          <div
            key={chip.label}
            className={`absolute flex items-center gap-2 rounded-pill border border-line bg-surface/90 px-3 py-1.5 shadow-e2 backdrop-blur-sm animate-hero-float ${chip.position}`}
            style={{ animationDelay: chip.delay, animationDuration: "7s" }}
          >
            <span className={`grid h-6 w-6 place-items-center rounded-full ${TONE_DISC[chip.tone]}`}>
              <Icon name={chip.icon} size={13} weight="fill" />
            </span>
            <span className="text-xs font-semibold text-ink">{chip.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
