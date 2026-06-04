import type { ReactNode, SVGProps } from "react";

// Icon provider: Streamline HQ Pro (locked in the Sweepza Design System).
//
// These are lightweight interim stroke glyphs that follow Streamline's 24px,
// 1.5 stroke, rounded-cap style. When the licensed Streamline HQ Pro asset
// package is imported, replace the GLYPHS registry below with the licensed SVG
// bodies — the <Icon /> API (name + props) stays identical so no call site has
// to change.

export type IconName =
  | "calendar"
  | "repeat"
  | "verified"
  | "bookmark"
  | "check"
  | "skip"
  | "share"
  | "trophy"
  | "location"
  | "gift";

const GLYPHS: Record<IconName, ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  repeat: <path d="M4 9a5 5 0 0 1 5-5h7l-2.5-2.5M20 15a5 5 0 0 1-5 5H8l2.5 2.5" />,
  verified: (
    <>
      <path d="M12 2.5l2.4 1.7 2.9-.2 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.8-2.9-.2L12 21.5l-2.4-1.7-2.9.2-1-2.8L3.3 15.5l.9-2.8-.9-2.8 2.4-1.7 1-2.8 2.9.2z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  bookmark: <path d="M6 3.5h12v17l-6-4-6 4z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  skip: <path d="M6 6l12 12M18 6L6 18" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4.5h10v4a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5v1.5A3 3 0 0 0 7 10.4M17 6h2.5v1.5A3 3 0 0 1 17 10.4M9.5 14.5h5M9 20.5h6M12 14.5v6" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="9" width="17" height="11.5" rx="1.5" />
      <path d="M3 9h18v4H3zM12 9v11.5" />
      <path d="M12 9S10.5 4.5 8 4.5 5.5 8 8 9M12 9s1.5-4.5 4-4.5S18.5 8 16 9" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {GLYPHS[name]}
    </svg>
  );
}
