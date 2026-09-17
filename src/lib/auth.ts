import "server-only";
import bcrypt from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const owner = await prisma.owner.findUnique({ where: { email } });
        if (!owner || !(await bcrypt.compare(password, owner.passwordHash))) return null;
        return { id: owner.id, email: owner.email };
      },
    }),
  ],
};

export async function getOwnerEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

/** For API routes: returns the owner email, or a 401 response to return as-is. */
export async function requireOwner(): Promise<string | NextResponse> {
  const email = await getOwnerEmail();
  return email ?? NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}
