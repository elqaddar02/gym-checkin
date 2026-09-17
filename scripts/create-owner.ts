// Create or reset the owner account.
// Usage: npm run owner -- owner@example.com "a-long-password"
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const [emailArg, password] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email || !password) {
    console.error('Usage: npm run owner -- <email> "<password>"');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await prisma.owner.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });
  console.log(`Owner ready: ${owner.email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
