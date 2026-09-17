import type { Metadata } from "next";
import { NewMemberForm } from "./new-member-form";

export const metadata: Metadata = { title: "Nouveau membre" };

export default function NewMemberPage() {
  return <NewMemberForm />;
}
