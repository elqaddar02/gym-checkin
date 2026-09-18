/** The gym's identity, as every screen consumes it. */
export interface Brand {
  name: string;
  city: string | null;
  logoUrl: string | null;
  /** Up to two letters, drawn when there is no logo. */
  initials: string;
  primary: string;
  secondary: string;
  onPrimary: string;
}

export const DEFAULT_BRAND: Brand = {
  name: "Ma salle",
  city: null,
  logoUrl: null,
  initials: "MS",
  primary: "#e3a008",
  secondary: "#b45309",
  onPrimary: "#1b1403",
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Colours end up in a style attribute, so anything that isn't #rrggbb is dropped. */
export function safeHex(value: string | null | undefined, fallback: string): string {
  return value && HEX.test(value) ? value.toLowerCase() : fallback;
}

/** Only same-origin paths and data URIs: a third-party URL would leak the tablet's IP. */
export function safeLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  return null;
}

export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
  return (letters.slice(0, 2) || "MS").toUpperCase();
}

/**
 * The three variables every other colour derives from. Set once on <html>; the
 * stylesheet mixes the rest (tints, rings, gauges) with color-mix().
 */
export function brandVars(brand: Brand): Record<string, string> {
  return {
    "--brand": brand.primary,
    "--brand-2": brand.secondary,
    "--on-brand": brand.onPrimary,
  };
}
