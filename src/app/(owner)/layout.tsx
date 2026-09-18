import { redirect } from "next/navigation";
import { OwnerShell } from "@/components/owner-shell";
import { getOwnerSession } from "@/lib/auth";
import { getBrand } from "@/lib/brand";

export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  const owner = await getOwnerSession();
  if (!owner) redirect("/login");

  const { name, city, logoUrl, initials } = await getBrand();

  return (
    <OwnerShell brand={{ name, city, logoUrl, initials }} owner={owner}>
      {children}
    </OwnerShell>
  );
}
