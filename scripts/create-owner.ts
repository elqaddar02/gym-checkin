// Create or reset the owner account.
// Usage: npm run owner -- mouad owner@example.com "a-long-password"
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { isValidUsername, normalizeUsername } from "../src/lib/username";

async function main() {
  const [usernameArg, emailArg, password] = process.argv.slice(2);
  const username = normalizeUsername(usernameArg ?? "");
  const email = emailArg?.trim().toLowerCase();
  if (!username || !email || !password) {
    console.error('Usage: npm run owner -- <identifiant> <email> "<password>"');
    process.exit(1);
  }
  if (!isValidUsername(username)) {
    console.error("Identifiant: 3 to 32 characters, starting with a letter or digit, then letters, digits, . _ or -");
    process.exit(1);
  }
  if (!email.includes("@")) {
    console.error("That does not look like an email address.");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await prisma.owner.upsert({
    where: { username },
    create: { username, email, passwordHash },
    update: { email, passwordHash },
  });
  console.log(`Owner ready: ${owner.username} (${owner.email})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
