import type { Metadata } from "next";
import { nextCode } from "@/lib/member-code";
import { prisma } from "@/lib/prisma";
import { NewMemberForm } from "./new-member-form";

export const metadata: Metadata = { title: "Nouveau membre" };

export default async function NewMemberPage() {
  // A preview only: the code is fixed when the member is saved, in case another
  // member was added in the meantime.
  const last = await prisma.member.aggregate({ _max: { code: true } });
  return <NewMemberForm expectedCode={nextCode(last._max.code)} />;
}
