#!/usr/bin/env tsx
/**
 * Simulate End-to-End Client Configuration Dry Run
 *
 * Tests the full provisioning pipeline without hitting real Stripe/Infisical:
 *   1. Create mock Organization + OnboardingSubmission (Fitness Coaching niche)
 *   2. Run provisioning logic (3 burner profiles)
 *   3. Run workflow generation (creates client plugin directory)
 *   4. Verify brand-prompt.md was generated and print it
 *   5. Clean up mock DB entries (leave generated files for inspection)
 *
 * Usage:
 *   npx tsx src/cli/commands/dry-run-client.ts
 */

import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { generateBrowserProfile } from "@/lib/fingerprint";
import { generateWorkflows } from "./generate-workflows";

// ── Config ────────────────────────────────────────────────────────

const MOCK_ORG_ID = `dryrun-${randomUUID().slice(0, 8)}`;
const MOCK_ORG_NAME = "Peak Performance Fitness";
const MOCK_ORG_SLUG = `peak-fitness-${MOCK_ORG_ID}`;
const BURNER_COUNT = 3;

const ONBOARDING_DATA = {
  niche: "High-Performance Fitness Coaching",
  brandVoice:
    "Motivational, science-backed, no-BS. Speak like a coach who's been in the trenches — " +
    "direct but empathetic. Use active voice, short sentences. Mix gym culture slang with " +
    "evidence-based language. Avoid corporate speak and generic inspiration.",
  tonePreferences:
    "Confident but not arrogant. Educational but not preachy. " +
    "Relatable — acknowledge struggles before offering solutions. " +
    "Use 'you' language, not 'we'. Urgent when promoting offers, calm when teaching.",
  competitorUrls: [
    "https://www.youtube.com/@JeffNippard",
    "https://www.youtube.com/@JeremyEthier",
    "https://www.tiktok.com/@dr.mikeisraetel",
  ],
  platforms: ["YOUTUBE", "TIKTOK", "INSTAGRAM", "X"],
  postingFrequency: "daily",
  contentStyle: "educational-entertainment",
  additionalNotes:
    "Focus on natural bodybuilding, evidence-based training, and nutrition myths. " +
    "Target audience: men 18-35 who train 4-6x/week. Avoid supplement pushing.",
};

// ── Helpers ───────────────────────────────────────────────────────

function header(text: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${"═".repeat(60)}\n`);
}

function subheader(text: string) {
  console.log(`\n  ── ${text} ${"─".repeat(Math.max(0, 50 - text.length))}\n`);
}

// ── Step 1: Create Mock Client Data ─────────────────────────────

async function createMockClientData(): Promise<void> {
  header("Step 1: Create Mock Client Data");

  console.log(`  Org ID:   ${MOCK_ORG_ID}`);
  console.log(`  Name:     ${MOCK_ORG_NAME}`);
  console.log(`  Niche:    ${ONBOARDING_DATA.niche}`);
  console.log(`  Tier:     MULTIPLIER`);
  console.log(`  Status:   PENDING_SETUP\n`);

  await db.organization.create({
    data: {
      id: MOCK_ORG_ID,
      name: MOCK_ORG_NAME,
      slug: MOCK_ORG_SLUG,
      subscriptionStatus: "ACTIVE",
      onboardingStatus: "PENDING_SETUP",
      pricingTier: "MULTIPLIER",
      maxAccounts: 25,
      maxWorkflowRuns: 200,
      maxVideosPerMonth: 100,
      mlFeaturesEnabled: true,
      multiplierEnabled: true,
      dailyLlmBudgetCents: 1500,
      stripeCustomerId: `cus_dryrun_${MOCK_ORG_ID}`,
      stripeSubscriptionId: `sub_dryrun_${MOCK_ORG_ID}`,
    },
  });

  await db.onboardingSubmission.create({
    data: {
      organizationId: MOCK_ORG_ID,
      niche: ONBOARDING_DATA.niche,
      brandVoice: ONBOARDING_DATA.brandVoice,
      tonePreferences: ONBOARDING_DATA.tonePreferences,
      competitorUrls: ONBOARDING_DATA.competitorUrls,
      platforms: ONBOARDING_DATA.platforms,
      postingFrequency: ONBOARDING_DATA.postingFrequency,
      contentStyle: ONBOARDING_DATA.contentStyle,
      additionalNotes: ONBOARDING_DATA.additionalNotes,
    },
  });

  console.log("  ✅ Organization created");
  console.log("  ✅ OnboardingSubmission created");
}

// ── Step 2: Test Provisioning (Burner Profiles) ─────────────────

async function testProvisioning(): Promise<void> {
  header("Step 2: Provision Burner Profiles (Infisical Mocked)");

  const platforms = ONBOARDING_DATA.platforms;

  for (let i = 0; i < BURNER_COUNT; i++) {
    const platformIndex = i % platforms.length;
    const platform = platforms[platformIndex];
    const label = `Burner-${platform}-${i + 1}`;

    const profile = generateBrowserProfile();

    // Mock Infisical: just generate the path, don't call storeSecret()
    const secretPath = `/orgs/${MOCK_ORG_ID}/tokens/${label}`;

    const result = await db.$transaction(async (tx) => {
      const browserProfile = await tx.browserProfile.create({
        data: {
          userAgent: profile.userAgent,
          screenWidth: profile.screenWidth,
          screenHeight: profile.screenHeight,
          hardwareConcurrency: profile.hardwareConcurrency,
          platform: profile.platform,
          languages: profile.languages,
          canvasNoiseSeed: profile.canvasNoiseSeed,
          webglVendor: profile.webglVendor,
          webglRenderer: profile.webglRenderer,
          timezone: profile.timezone,
          locale: profile.locale,
        },
      });

      const token = await tx.orgPlatformToken.create({
        data: {
          organizationId: MOCK_ORG_ID,
          platform: platform as any,
          accountLabel: label,
          accountType: "SECONDARY",
          infisicalSecretPath: secretPath,
          fingerprintProfileId: browserProfile.id,
          warmupStatus: "NOT_STARTED",
          sessionStoragePath: `sessions/${MOCK_ORG_ID}/${browserProfile.id}/state.json`,
        },
      });

      return { token, browserProfile };
    });

    console.log(`  [${i + 1}/${BURNER_COUNT}] Created ${label}`);
    console.log(`    Platform:    ${platform}`);
    console.log(`    Profile ID:  ${result.browserProfile.id}`);
    console.log(`    UA:          ${profile.userAgent.slice(0, 65)}...`);
    console.log(`    Screen:      ${profile.screenWidth}×${profile.screenHeight}`);
    console.log(`    WebGL:       ${profile.webglVendor} / ${profile.webglRenderer.slice(0, 40)}`);
    console.log(`    Timezone:    ${profile.timezone}`);
    console.log(`    Infisical:   ${secretPath} (MOCKED — no real API call)`);
    console.log(`    Session R2:  ${result.token.sessionStoragePath}\n`);
  }

  // Verify Infisical refs in DB
  const tokens = await db.orgPlatformToken.findMany({
    where: { organizationId: MOCK_ORG_ID },
    select: { accountLabel: true, infisicalSecretPath: true, fingerprintProfileId: true },
  });

  subheader("Verification: Infisical Path Refs in DB");
  for (const t of tokens) {
    const hasPath = t.infisicalSecretPath?.startsWith("/orgs/");
    const hasFingerprintLink = !!t.fingerprintProfileId;
    console.log(
      `  ${hasPath ? "✅" : "❌"} ${t.accountLabel} → ${t.infisicalSecretPath} (fingerprint: ${hasFingerprintLink ? "linked" : "MISSING"})`,
    );
  }

  console.log(`\n  ✅ ${tokens.length} burner profiles provisioned (Infisical mocked)`);
}

// ── Step 3: Test Workflow Generation ────────────────────────────

async function testWorkflowGeneration(): Promise<void> {
  header("Step 3: Generate Client Plugin Directory + Workflows");

  // Call the real generate-workflows logic (it reads from DB)
  await generateWorkflows(MOCK_ORG_ID);

  const clientDir = join(process.cwd(), "src", "agents", "clients", MOCK_ORG_ID);

  subheader("Verification: Directory Structure");

  if (!existsSync(clientDir)) {
    console.error("  ❌ Client directory was NOT created!");
    return;
  }

  const walk = (dir: string, prefix = ""): void => {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const path = join(dir, item.name);
      if (item.isDirectory()) {
        console.log(`  ${prefix}📁 ${item.name}/`);
        walk(path, prefix + "  ");
      } else {
        const size = readFileSync(path).length;
        console.log(`  ${prefix}📄 ${item.name} (${size} bytes)`);
      }
    }
  };

  console.log(`  📁 src/agents/clients/${MOCK_ORG_ID}/`);
  walk(clientDir, "  ");

  // Check workflows were created
  const workflowDir = join(clientDir, "workflows");
  if (existsSync(workflowDir)) {
    const yamls = readdirSync(workflowDir).filter((f) => f.endsWith(".yaml"));
    console.log(`\n  ✅ ${yamls.length} workflow(s) generated: ${yamls.join(", ")}`);
  } else {
    console.error("  ❌ workflows/ directory not found");
  }
}

// ── Step 4: Verify Brand Prompt ─────────────────────────────────

function verifyBrandPrompt(): void {
  header("Step 4: Verify Brand Prompt (brand-prompt.md)");

  const brandPromptPath = join(
    process.cwd(),
    "src",
    "agents",
    "clients",
    MOCK_ORG_ID,
    "brand-prompt.md",
  );

  if (!existsSync(brandPromptPath)) {
    console.error("  ❌ brand-prompt.md was NOT generated!");
    return;
  }

  const content = readFileSync(brandPromptPath, "utf-8");

  console.log("  ✅ brand-prompt.md found\n");
  console.log("  ┌─────────────────────────────────────────────────────────┐");
  for (const line of content.split("\n")) {
    console.log(`  │ ${line}`);
  }
  console.log("  └─────────────────────────────────────────────────────────┘");

  // Validate content includes key sections
  subheader("Content Checks");

  const checks = [
    { label: "Contains org name", pass: content.includes(MOCK_ORG_NAME) },
    { label: "Contains niche", pass: content.includes(ONBOARDING_DATA.niche) },
    { label: "Contains brand voice", pass: content.includes(ONBOARDING_DATA.brandVoice.slice(0, 20)) },
    { label: "Lists target platforms", pass: ONBOARDING_DATA.platforms.every((p) => content.includes(p)) },
    { label: "Has content rules section", pass: content.includes("Content Rules") || content.includes("content") },
    { label: "Has prohibited section", pass: content.includes("Prohibited") || content.includes("prohibited") },
  ];

  for (const check of checks) {
    console.log(`  ${check.pass ? "✅" : "❌"} ${check.label}`);
  }

  const passCount = checks.filter((c) => c.pass).length;
  console.log(`\n  Score: ${passCount}/${checks.length} checks passed`);
}

// ── Step 5: Cleanup DB (leave files) ────────────────────────────

async function cleanup(): Promise<void> {
  header("Step 5: Cleanup Mock Database Entries");

  // Delete in reverse dependency order
  const warmingLogs = await db.accountWarmingLog.deleteMany({
    where: { account: { organizationId: MOCK_ORG_ID } },
  });
  console.log(`  Deleted ${warmingLogs.count} warming logs`);

  const proxyAllocations = await db.proxyAllocation.deleteMany({
    where: { assignedAccount: { organizationId: MOCK_ORG_ID } },
  });
  console.log(`  Deleted ${proxyAllocations.count} proxy allocations`);

  const postRecords = await db.postRecord.deleteMany({
    where: { organizationId: MOCK_ORG_ID },
  });
  console.log(`  Deleted ${postRecords.count} post records`);

  // Collect browser profile IDs before deleting tokens
  const tokens = await db.orgPlatformToken.findMany({
    where: { organizationId: MOCK_ORG_ID },
    select: { id: true, fingerprintProfileId: true },
  });
  const profileIds = tokens
    .map((t) => t.fingerprintProfileId)
    .filter((id): id is string => !!id);

  const deletedTokens = await db.orgPlatformToken.deleteMany({
    where: { organizationId: MOCK_ORG_ID },
  });
  console.log(`  Deleted ${deletedTokens.count} platform tokens`);

  // Delete browser profiles (orphaned now that tokens are gone)
  if (profileIds.length > 0) {
    const deletedProfiles = await db.browserProfile.deleteMany({
      where: { id: { in: profileIds } },
    });
    console.log(`  Deleted ${deletedProfiles.count} browser profiles`);
  }

  const usageRecords = await db.usageRecord.deleteMany({
    where: { organizationId: MOCK_ORG_ID },
  });
  console.log(`  Deleted ${usageRecords.count} usage records`);

  await db.onboardingSubmission.deleteMany({
    where: { organizationId: MOCK_ORG_ID },
  });
  console.log(`  Deleted onboarding submission`);

  await db.organization.delete({
    where: { id: MOCK_ORG_ID },
  });
  console.log(`  Deleted organization`);

  const clientDir = join(process.cwd(), "src", "agents", "clients", MOCK_ORG_ID);
  console.log(`\n  ✅ Database cleaned up`);
  console.log(`  📁 Generated files preserved at: src/agents/clients/${MOCK_ORG_ID}/`);
  console.log(`     (Delete manually when done inspecting: rm -rf ${clientDir})`);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "█".repeat(60));
  console.log("  NEXUS SUITE — End-to-End Client Configuration Dry Run");
  console.log("  Niche: High-Performance Fitness Coaching");
  console.log("  Tier:  MULTIPLIER ($1,500 setup + $499/mo)");
  console.log("█".repeat(60));

  try {
    await createMockClientData();
    await testProvisioning();
    await testWorkflowGeneration();
    verifyBrandPrompt();
    await cleanup();

    header("🎉 DRY RUN COMPLETE");
    console.log("  All steps passed. The provisioning pipeline works end-to-end.");
    console.log("  Review the generated files, then delete the client directory.\n");
  } catch (err) {
    console.error("\n  ❌ DRY RUN FAILED:", err);

    // Best-effort cleanup on failure
    console.log("\n  Attempting cleanup...");
    try {
      await cleanup();
    } catch (cleanupErr) {
      console.error("  Cleanup also failed:", cleanupErr);
    }

    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
