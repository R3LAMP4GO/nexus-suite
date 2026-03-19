import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

// ── Mock Prisma Client ──────────────────────────────────────────
export const prismaMock = mockDeep<PrismaClient>();

// ── Factory: Organization ───────────────────────────────────────
let orgCounter = 0;
export function createOrganization(overrides: Record<string, unknown> = {}) {
  orgCounter++;
  return {
    id: `org_${orgCounter}`,
    name: `Test Org ${orgCounter}`,
    slug: `test-org-${orgCounter}`,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    stripeCustomerId: `cus_test_${orgCounter}`,
    stripeSubscriptionId: `sub_test_${orgCounter}`,
    setupPaymentIntentId: null,
    subscriptionStatus: "ACTIVE" as const,
    onboardingStatus: "ACTIVE" as const,
    pricingTier: "PRO" as const,
    maxAccounts: 3,
    maxWorkflowRuns: 50,
    maxVideosPerMonth: 30,
    mlFeaturesEnabled: false,
    multiplierEnabled: false,
    dailyLlmBudgetCents: 500,
    brandConfig: null,
    ...overrides,
  };
}

// ── Factory: User ───────────────────────────────────────────────
let userCounter = 0;
export function createUser(overrides: Record<string, unknown> = {}) {
  userCounter++;
  return {
    id: `user_${userCounter}`,
    name: `Test User ${userCounter}`,
    email: `user${userCounter}@test.com`,
    emailVerified: new Date("2026-01-01"),
    image: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ── Factory: OnboardingSubmission ────────────────────────────────
export function createOnboardingSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: `onb_${Date.now()}`,
    organizationId: "org_1",
    submittedAt: new Date("2026-01-01"),
    niche: "tech",
    brandVoice: "professional and concise",
    tonePreferences: "informative",
    competitorUrls: ["https://example.com"],
    platforms: ["YOUTUBE", "TIKTOK"],
    postingFrequency: "daily",
    contentStyle: "educational",
    additionalNotes: null,
    ...overrides,
  };
}

// ── Factory: StripeEvent ────────────────────────────────────────
export function createStripeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_test_${Date.now()}`,
    type: "checkout.session.completed",
    processedAt: new Date("2026-01-01"),
    organizationId: "org_1",
    payload: {},
    ...overrides,
  };
}

// ── Factory: OrgPlatformToken ──────────────────────────────────
let tokenCounter = 0;
export function createOrgPlatformToken(overrides: Record<string, unknown> = {}) {
  tokenCounter++;
  return {
    id: `token_${tokenCounter}`,
    organizationId: "org_1",
    platform: "YOUTUBE" as const,
    accountType: "PRIMARY" as const,
    accountLabel: `Account ${tokenCounter}`,
    infisicalSecretPath: `/orgs/org_1/tokens/token_${tokenCounter}`,
    infisicalProxyPath: null,
    fingerprintProfileId: null,
    sessionStoragePath: null,
    circuitState: "CLOSED" as const,
    circuitFailures: 0,
    circuitLastFailure: null,
    circuitOpenedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    fingerprintProfile: null,
    ...overrides,
  };
}

// ── Factory: PostRecord ─────────────────────────────────────────
let postCounter = 0;
export function createPostRecord(overrides: Record<string, unknown> = {}) {
  postCounter++;
  return {
    id: `post_${postCounter}`,
    organizationId: "org_1",
    accountId: `token_1`,
    variationId: `var_1`,
    platform: "YOUTUBE" as const,
    status: "SCHEDULED" as const,
    scheduledAt: new Date("2026-01-15"),
    postedAt: null,
    externalPostId: null,
    errorMessage: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ── Factory: VideoVariation ─────────────────────────────────────
let variationCounter = 0;
export function createVideoVariation(overrides: Record<string, unknown> = {}) {
  variationCounter++;
  return {
    id: `var_${variationCounter}`,
    sourceVideoId: `sv_1`,
    r2StorageKey: `videos/org_1/var_${variationCounter}.mp4`,
    caption: `Test caption ${variationCounter}`,
    status: "ready" as const,
    duration: 60,
    width: 1920,
    height: 1080,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ── Factory: SourceVideo ────────────────────────────────────────
let sourceVideoCounter = 0;
export function createSourceVideo(overrides: Record<string, unknown> = {}) {
  sourceVideoCounter++;
  return {
    id: `sv_${sourceVideoCounter}`,
    organizationId: "org_1",
    title: `Source Video ${sourceVideoCounter}`,
    r2StorageKey: `videos/org_1/source_${sourceVideoCounter}.mp4`,
    status: "ready" as const,
    duration: 120,
    scriptId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ── Factory: UsageRecord ────────────────────────────────────────
let usageCounter = 0;
export function createUsageRecord(overrides: Record<string, unknown> = {}) {
  usageCounter++;
  return {
    id: `usage_${usageCounter}`,
    organizationId: "org_1",
    metric: "videos" as const,
    count: 1,
    periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2026-02-01"),
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ── Factory: WorkflowRun ────────────────────────────────────────
let wfRunCounter = 0;
export function createWorkflowRun(overrides: Record<string, unknown> = {}) {
  wfRunCounter++;
  return {
    id: `wfr_${wfRunCounter}`,
    organizationId: "org_1",
    workflowName: `test-workflow-${wfRunCounter}`,
    status: "pending" as const,
    startedAt: new Date("2026-01-01"),
    completedAt: null,
    error: null,
    durationMs: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}
