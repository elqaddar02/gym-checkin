import "server-only";
import { cache } from "react";
import {
  DEFAULT_BRAND,
  initialsOf,
  safeHex,
  safeLogoUrl,
  type Brand,
} from "./brand-format";
import { prisma } from "./prisma";

export { DEFAULT_BRAND, brandVars, initialsOf, safeHex, safeLogoUrl } from "./brand-format";
export type { Brand } from "./brand-format";

/**
 * The gym on this installation. One row today; resolving it here is what makes
 * a second gym a row rather than a deploy.
 *
 * Falls back to the default brand when the table is empty or unreachable, so the
 * app renders during a build with no database and before the owner has set anything.
 */
export const getBrand = cache(async (): Promise<Brand> => {
  try {
    const gym = await prisma.gym.findFirst({ orderBy: { createdAt: "asc" } });
    if (!gym) return DEFAULT_BRAND;
    return {
      name: gym.name || DEFAULT_BRAND.name,
      city: gym.city,
      logoUrl: safeLogoUrl(gym.logoUrl),
      initials: initialsOf(gym.name || DEFAULT_BRAND.name),
      primary: safeHex(gym.primaryColor, DEFAULT_BRAND.primary),
      secondary: safeHex(gym.secondaryColor, DEFAULT_BRAND.secondary),
      onPrimary: safeHex(gym.onPrimaryColor, DEFAULT_BRAND.onPrimary),
    };
  } catch {
    return DEFAULT_BRAND;
  }
});
