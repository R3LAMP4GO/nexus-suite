// Seed script — creates the platform admin user + organization.
// Run: npx tsx prisma/seed.ts
//
// This is for YOUR account (the platform operator), not client accounts.
// Client accounts are created via Stripe checkout → webhook.

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@nexus-suite.com";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Nexus Admin";

async function main() {
  console.log("\n  🌱 Nexus Suite — Seed Script\n");

  // 1. Check if any users exist
  const userCount = await db.user.count();
  if (userCount > 0) {
    console.log("  ⚠️  Users already exist. Skipping seed.");
    console.log("  To re-seed, clear the database first: npx prisma migrate reset\n");
    return;
  }

  // 2. Create admin user
  const admin = await db.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      emailVerified: new Date(),
    },
  });
  console.log(`  ✅ Created admin user: ${admin.email} (${admin.id})`);

  // 3. Create platform operator org (ACTIVE, no Stripe — it's yours)
  const org = await db.organization.create({
    data: {
      name: "Nexus Operations",
      slug: "nexus-ops",
      subscriptionStatus: "ACTIVE",
      onboardingStatus: "ACTIVE",
      pricingTier: "ENTERPRISE",
      maxAccounts: 999,
      maxWorkflowRuns: 9999,
      maxVideosPerMonth: 9999,
      mlFeaturesEnabled: true,
      multiplierEnabled: true,
      dailyLlmBudgetCents: 10000, // $100/day for internal use
      members: {
        create: {
          userId: admin.id,
          role: "OWNER",
        },
      },
    },
  });
  console.log(`  ✅ Created org: ${org.name} (${org.id})`);

  // 4. Summary
  console.log("\n  ────────────────────────────────────────");
  console.log("  Seed complete!\n");
  console.log(`  Admin email:  ${ADMIN_EMAIL}`);
  console.log(`  Org ID:       ${org.id}`);
  console.log(`  Org slug:     ${org.slug}`);
  console.log("\n  Next steps:");
  console.log("    1. Start the app:     docker compose up -d && npm run dev");
  console.log("    2. Sign in at /login with Google (using the admin email above)");
  console.log("    3. You'll land on the dashboard as OWNER of Nexus Operations");
  console.log("    4. Your clients sign up via /pricing → Stripe checkout\n");
}

main()
  .catch((err) => {
    console.error("  ❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
