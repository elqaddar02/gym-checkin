import "server-only";
import bcrypt from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { normalizeUsername } from "./username";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Identifiant",
      credentials: {
        username: { label: "Identifiant", type: "text" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const username = normalizeUsername(credentials?.username ?? "");
        const password = credentials?.password;
        if (!username || !password) return null;

        // The email is still accepted: an owner who had the account before
        // identifiants existed should not be locked out by the change.
        const owner = await prisma.owner.findFirst({
          where: { OR: [{ username }, { email: username }] },
        });
        if (!owner || !(await bcrypt.compare(password, owner.passwordHash))) return null;
        return { id: owner.id, email: owner.email, name: owner.username };
      },
    }),
  ],
};

export interface OwnerSession {
  /** What the owner signs in with, and what the app calls them. */
  username: string;
  email: string;
}

export async function getOwnerSession(): Promise<OwnerSession | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  // Sessions issued before identifiants existed carry no name.
  return { username: session.user?.name || email, email };
}

export async function getOwnerEmail(): Promise<string | null> {
  return (await getOwnerSession())?.email ?? null;
}

/** For API routes: returns the owner email, or a 401 response to return as-is. */
export async function requireOwner(): Promise<string | NextResponse> {
  const email = await getOwnerEmail();
  return email ?? NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}
