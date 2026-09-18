import { redirect } from "next/navigation";
import { OwnerShell } from "@/components/owner-shell";
import { getOwnerEmail } from "@/lib/auth";
import { getBrand } from "@/lib/brand";

export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  const email = await getOwnerEmail();
  if (!email) redirect("/login");

  const { name, city, logoUrl, initials } = await getBrand();

  return (
    <OwnerShell brand={{ name, city, logoUrl, initials }} email={email}>
      {children}
    </OwnerShell>
  );
}
