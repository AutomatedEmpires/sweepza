import type { SVGProps } from "react";
import {
  ArrowsClockwise,
  Bell,
  BookmarkSimple,
  CalendarBlank,
  CaretRight,
  ChartBar,
  Check,
  CircleHalf,
  Clock,
  ClockCounterClockwise,
  Compass,
  FileText,
  Flag,
  Funnel,
  GearSix,
  Gift,
  Info,
  MagnifyingGlass,
  MapPin,
  Moon,
  PaperPlaneTilt,
  SealCheck,
  ShareNetwork,
  ShieldCheck,
  SignOut,
  Sparkle,
  Stack,
  Storefront,
  Sun,
  Trophy,
  UserCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type {
  Icon as PhosphorIcon,
  IconWeight,
} from "@phosphor-icons/react";

// Semantic icon registry — the single icon system for Sweepza, backed by
// Phosphor (AutomatedEmpires standard). Call sites use semantic names, never
// glyph names, so the visual language can evolve in one place. Add a name
// here rather than importing a Phosphor icon directly in a component.

const REGISTRY = {
  // Actions & states
  bookmark: BookmarkSimple,
  check: Check,
  skip: X,
  share: ShareNetwork,
  send: PaperPlaneTilt,
  repeat: ArrowsClockwise,
  search: MagnifyingGlass,
  filter: Funnel,
  caretRight: CaretRight,
  signOut: SignOut,

  // Trust & provenance
  verified: SealCheck,
  rules: FileText,
  flag: Flag,
  info: Info,
  shield: ShieldCheck,

  // Domain
  gift: Gift,
  trophy: Trophy,
  calendar: CalendarBlank,
  clock: Clock,
  history: ClockCounterClockwise,
  sparkle: Sparkle,
  location: MapPin,

  // Navigation & roles
  today: Sun,
  discover: Compass,
  sweeps: Stack,
  profile: UserCircle,
  host: Storefront,
  settings: GearSix,
  chart: ChartBar,
  bell: Bell,

  // Theme
  sun: Sun,
  moon: Moon,
  themeAuto: CircleHalf,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  weight?: IconWeight;
}

export function Icon({ name, size = 18, weight = "regular", ...props }: IconProps) {
  const Glyph = REGISTRY[name];
  return (
    <Glyph
      size={size}
      weight={weight}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}
