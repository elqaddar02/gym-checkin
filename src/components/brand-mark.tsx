import type { Brand } from "@/lib/brand-format";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 rounded-[9px] text-[13px]",
  md: "size-10 rounded-[11px] text-[16px]",
  lg: "size-14 rounded-[14px] text-[22px]",
} as const;

/** The gym's logo, or its initials on a tile in the gym's colours when it has none. */
export function BrandMark({
  brand,
  size = "md",
  className,
}: {
  brand: Pick<Brand, "name" | "logoUrl" | "initials">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (brand.logoUrl) {
    return (
      // A logo can be a data URI, which next/image cannot optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        alt={brand.name}
        className={cn(SIZES[size], "shrink-0 object-contain", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        SIZES[size],
        "brand-fill grid shrink-0 place-items-center font-display font-bold",
        className,
      )}
    >
      {brand.initials}
    </span>
  );
}
