/**
 * Onboard a user for free — bypasses Stripe entirely.
 * Creates org, links user, sets to ACTIVE with chosen tier limits.
 *
 * Usage:
 *   npx tsx src/cli/index.ts onboard-free <email> --name "My Cousin's Brand" --tier MULTIPLIER
 */
import { db } from "@/lib/db";

interface OnboardFreeOpts {
  name?: string;
  tier?: string;
  niche?: string;
}

const TIER_LIMITS: Record<string, {
  maxAccounts: number;
  maxWorkflowRuns: number;
  maxVideosPerMonth: number;
  dailyLlmBudgetCents: number;
  mlFeaturesEnabled: boolean;
  multiplierEnabled: boolean;
}> = {
  PRO: {
    maxAccounts: 3,
    maxWorkflowRuns: 50,
    maxVideosPerMonth: 30,
    dailyLlmBudgetCents: 500,
    mlFeaturesEnabled: false,
    multiplierEnabled: false,
  },
  MULTIPLIER: {
    maxAccounts: 25,
    maxWorkflowRuns: 500,
    maxVideosPerMonth: 300,
    dailyLlmBudgetCents: 1500,
    mlFeaturesEnabled: true,
    multiplierEnabled: true,
  },
  ENTERPRISE: {
    maxAccounts: 100,
    maxWorkflowRuns: 10000,
    maxVideosPerMonth: 10000,
    dailyLlmBudgetCents: 10000,
    mlFeaturesEnabled: true,
    multiplierEnabled: true,
  },
};

export async function onboardFree(email: string, opts: OnboardFreeOpts): Promise<void> {
  const tier = (opts.tier?.toUpperCase() ?? "MULTIPLIER") as keyof typeof TIER_LIMITS;
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.MULTIPLIER;
  const orgName = opts.name ?? `${email.split("@")[0]}'s Brand`;

  console.log(`\n🚀 Onboarding free user: ${email}`);
  console.log(`   Org: ${orgName}`);
  console.log(`   Tier: ${tier} (${limits.maxAccounts} accounts, $${limits.dailyLlmBudgetCents / 100}/day LLM budget)\n`);

  // Step 1: Find or create user
  let user = await db.user.findFirst({ where: { email } });

  if (!user) {
    user = await db.user.create({
      data: {
        email,
        name: email.split("@")[0],
      },
    });
    console.log(`✅ Created user: ${user.id}`);
  } else {
    console.log(`✅ Found existing user: ${user.id}`);
  }

  // Step 2: Check if user already has an org
  const existingMembership = await db.orgMember.findFirst({
    where: { userId: user.id },
    include: { organization: true },
  });

  if (existingMembership) {
    const org = existingMembership.organization;
    if (org.onboardingStatus === "ACTIVE" && org.subscriptionStatus === "ACTIVE") {
      console.log(`⚠️  User already has an active org: ${org.name} (${org.id})`);
      console.log(`   Onboarding status: ${org.onboardingStatus}`);
      console.log(`   Nothing to do — they're already set up.\n`);
      return;
    }

    // Reactivate existing org
    await db.organization.update({
      where: { id: org.id },
      data: {
        subscriptionStatus: "ACTIVE",
        onboardingStatus: "ACTIVE",
        pricingTier: tier as any,
        ...limits,
      },
    });
    console.log(`✅ Reactivated existing org: ${org.name} (${org.id})\n`);
    printNextSteps(org.id, email);
    return;
  }

  // Step 3: Create organization
  const org = await db.organization.create({
    data: {
      name: orgName,
      subscriptionStatus: "ACTIVE",
      onboardingStatus: "ACTIVE",
      pricingTier: tier as any,
      ...limits,
      brandConfig: opts.niche
        ? { niche: opts.niche }
        : undefined,
    },
  });
  console.log(`✅ Created org: ${org.name} (${org.id})`);

  // Step 4: Add user as OWNER
  await db.orgMember.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
    },
  });
  console.log(`✅ Added ${email} as OWNER`);

  // Step 5: Create account for NextAuth session linking
  const existingAccount = await db.account.findFirst({
    where: { userId: user.id },
  });

  if (!existingAccount) {
    await db.account.create({
      data: {
        userId: user.id,
        type: "credentials",
        provider: "free-onboard",
        providerAccountId: user.id,
      },
    });
    console.log(`✅ Created auth account link`);
  }

  console.log(`\n🎉 Done! Org ${org.id} is ACTIVE on ${tier} tier.\n`);
  printNextSteps(org.id, email);
}

function printNextSteps(orgId: string, email: string) {
  console.log(`📋 Next steps:`);
  console.log(`   1. Have ${email} sign in at your app URL (Google OAuth or magic link)`);
  console.log(`   2. They'll land directly on /dashboard (no payment/onboarding gates)`);
  console.log(`   3. Optionally provision burner accounts:`);
  console.log(`      npx tsx src/cli/index.ts provision ${orgId} --burners 5`);
  console.log(`   4. Optionally generate workflows:`);
  console.log(`      npx tsx src/cli/index.ts generate-workflows ${orgId}`);
  console.log(``);
}
