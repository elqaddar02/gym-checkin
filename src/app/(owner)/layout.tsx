import { redirect } from "next/navigation";
import { OwnerNav } from "@/components/owner-nav";
import { getOwnerEmail } from "@/lib/auth";

export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  const email = await getOwnerEmail();
  if (!email) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <OwnerNav email={email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
