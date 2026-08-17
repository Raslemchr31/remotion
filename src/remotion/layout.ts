import type { CSSProperties } from "react";

import type { Position } from "../lib/schema";

/**
 * Turns a nine-point position into flexbox alignment on an AbsoluteFill, plus
 * edge padding. Every layer in the composition positions itself this way so a
 * caption, an overlay and the logo all interpret "top-right" identically.
 */
export function positionStyle(position: Position, marginPct: number): CSSProperties {
  const [vertical, horizontal] = position.split("-") as [
    "top" | "center" | "bottom",
    "left" | "center" | "right",
  ];

  const justifyContent =
    vertical === "top" ? "flex-start" : vertical === "bottom" ? "flex-end" : "center";
  const alignItems =
    horizontal === "left" ? "flex-start" : horizontal === "right" ? "flex-end" : "center";

  return {
    display: "flex",
    flexDirection: "column",
    justifyContent,
    alignItems,
    // Percentage padding on an AbsoluteFill resolves against the frame width for
    // both axes, which keeps a "bottom-center" caption the same visual distance
    // from the edge in 9:16 and 16:9.
    padding: `${marginPct * 100}%`,
  };
}

/**
 * Text alignment matching a position's horizontal component, so multi-line
 * captions stay visually anchored to the side they sit on.
 */
export function textAlignFor(position: Position): CSSProperties["textAlign"] {
  const horizontal = position.split("-")[1];
  if (horizontal === "left") return "left";
  if (horizontal === "right") return "right";
  return "center";
}

/** #rrggbb (or #rgb) plus an alpha 0..1 as an rgba() string. */
export function withOpacity(hex: string, opacity: number): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
