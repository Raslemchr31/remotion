import type { SVGProps } from "react";

/**
 * Hand-authored icons on a 24px grid with a uniform 1.5 stroke. Kept in one file
 * so the stroke weight, cap style and optical sizing cannot drift apart, and
 * drawn rather than borrowed from a font so nothing depends on emoji rendering
 * differing between the client's phone and a desktop.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
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
      {children}
    </svg>
  );
}

/** Points toward the start of the reading direction; the layout is RTL. */
export const ArrowBack = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

export const Plus = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const Play = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const Pause = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 5v14M15 5v14" strokeWidth={2} />
  </Icon>
);

/** The comment mark. Its diamond shape is repeated as the timeline pin. */
export const Pin = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z" />
  </Icon>
);

export const Upload = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </Icon>
);

export const Download = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </Icon>
);

export const Check = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 13 4.5 4.5L19 7" />
  </Icon>
);

export const Trash = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M6.5 7l.8 11.1A1.5 1.5 0 0 0 8.8 19.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </Icon>
);

export const Warning = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4.5 21 19.5H3L12 4.5Z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.2h.01" strokeWidth={2} />
  </Icon>
);

export const Film = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9.5h18M3 14.5h18M8 5v14M16 5v14" />
  </Icon>
);

/** Rotates via a CSS class supplied by the caller. */
export const Spinner = ({ size = 20, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <circle cx="12" cy="12" r="8.5" opacity={0.25} />
    <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" />
  </svg>
);
