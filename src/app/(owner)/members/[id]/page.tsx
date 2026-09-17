import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMemberDetail } from "@/lib/queries";
import { MemberEditor } from "./member-editor";

export const metadata: Metadata = { title: "Membre" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const { id } = await props.params;
  const { renew } = await props.searchParams;
  if (!UUID_RE.test(id)) notFound();

  const member = await getMemberDetail(id);
  if (!member) notFound();

  return <MemberEditor member={member} openRenew={renew === "1"} />;
}
