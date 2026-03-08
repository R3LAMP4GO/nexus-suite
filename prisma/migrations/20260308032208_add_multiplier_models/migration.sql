-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_SETUP', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "CircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- CreateEnum
CREATE TYPE "WarmupStatus" AS ENUM ('NOT_STARTED', 'WARMING', 'READY');

-- CreateEnum
CREATE TYPE "PricingTier" AS ENUM ('PRO', 'MULTIPLIER', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('SCHEDULED', 'POSTING', 'POSTED', 'FAILED', 'FLAGGED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ProxyStatus" AS ENUM ('ACTIVE', 'BURNED', 'ROTATING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "setupPaymentIntentId" TEXT,
    "subscriptionStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "pricingTier" "PricingTier" NOT NULL DEFAULT 'PRO',
    "maxAccounts" INTEGER NOT NULL DEFAULT 3,
    "maxWorkflowRuns" INTEGER NOT NULL DEFAULT 50,
    "maxVideosPerMonth" INTEGER NOT NULL DEFAULT 30,
    "mlFeaturesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "multiplierEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLlmBudgetCents" INTEGER NOT NULL DEFAULT 500,
    "brandConfig" JSONB,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgPlatformToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'PRIMARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "infisicalSecretPath" TEXT NOT NULL,
    "infisicalProxyPath" TEXT,
    "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitState" "CircuitState" NOT NULL DEFAULT 'CLOSED',
    "lastFailureAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "fingerprintProfileId" TEXT,
    "sessionStoragePath" TEXT,
    "warmupStatus" "WarmupStatus" NOT NULL DEFAULT 'NOT_STARTED',

    CONSTRAINT "OrgPlatformToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserProfile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT NOT NULL,
    "screenWidth" INTEGER NOT NULL,
    "screenHeight" INTEGER NOT NULL,
    "hardwareConcurrency" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "languages" TEXT[],
    "canvasNoiseSeed" TEXT NOT NULL,
    "webglVendor" TEXT NOT NULL,
    "webglRenderer" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "locale" TEXT NOT NULL,

    CONSTRAINT "BrowserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,
    "payload" JSONB,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "niche" TEXT NOT NULL,
    "brandVoice" TEXT,
    "tonePreferences" TEXT,
    "competitorUrls" JSONB NOT NULL DEFAULT '[]',
    "platforms" JSONB NOT NULL DEFAULT '[]',
    "postingFrequency" TEXT,
    "contentStyle" TEXT,
    "additionalNotes" TEXT,

    CONSTRAINT "OnboardingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceVideo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "r2StorageKey" TEXT,
    "duration" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoVariation" (
    "id" TEXT NOT NULL,
    "sourceVideoId" TEXT NOT NULL,
    "variationIndex" INTEGER NOT NULL,
    "transforms" JSONB NOT NULL,
    "r2StorageKey" TEXT,
    "fileHash" TEXT NOT NULL,
    "pHash" TEXT NOT NULL,
    "audioFingerprint" TEXT,
    "caption" TEXT,
    "status" "VariationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostRecord" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "status" "PostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "externalPostId" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountWarmingLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "AccountWarmingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyAllocation" (
    "id" TEXT NOT NULL,
    "proxyIp" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ProxyStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAccountId" TEXT,
    "lastBannedAt" TIMESTAMP(3),
    "burnedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProxyAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "OrgMember_userId_idx" ON "OrgMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_organizationId_userId_key" ON "OrgMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgPlatformToken_fingerprintProfileId_key" ON "OrgPlatformToken"("fingerprintProfileId");

-- CreateIndex
CREATE INDEX "OrgPlatformToken_organizationId_platform_idx" ON "OrgPlatformToken"("organizationId", "platform");

-- CreateIndex
CREATE INDEX "OrgPlatformToken_warmupStatus_idx" ON "OrgPlatformToken"("warmupStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OrgPlatformToken_organizationId_platform_accountLabel_key" ON "OrgPlatformToken"("organizationId", "platform", "accountLabel");

-- CreateIndex
CREATE INDEX "StripeEvent_type_idx" ON "StripeEvent"("type");

-- CreateIndex
CREATE INDEX "StripeEvent_organizationId_idx" ON "StripeEvent"("organizationId");

-- CreateIndex
CREATE INDEX "UsageRecord_organizationId_metric_idx" ON "UsageRecord"("organizationId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_organizationId_metric_period_key" ON "UsageRecord"("organizationId", "metric", "period");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSubmission_organizationId_key" ON "OnboardingSubmission"("organizationId");

-- CreateIndex
CREATE INDEX "SourceVideo_organizationId_idx" ON "SourceVideo"("organizationId");

-- CreateIndex
CREATE INDEX "VideoVariation_sourceVideoId_idx" ON "VideoVariation"("sourceVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoVariation_sourceVideoId_variationIndex_key" ON "VideoVariation"("sourceVideoId", "variationIndex");

-- CreateIndex
CREATE INDEX "PostRecord_accountId_idx" ON "PostRecord"("accountId");

-- CreateIndex
CREATE INDEX "PostRecord_variationId_idx" ON "PostRecord"("variationId");

-- CreateIndex
CREATE INDEX "PostRecord_status_scheduledAt_idx" ON "PostRecord"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AccountWarmingLog_accountId_idx" ON "AccountWarmingLog"("accountId");

-- CreateIndex
CREATE INDEX "ProxyAllocation_status_idx" ON "ProxyAllocation"("status");

-- CreateIndex
CREATE INDEX "ProxyAllocation_assignedAccountId_idx" ON "ProxyAllocation"("assignedAccountId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPlatformToken" ADD CONSTRAINT "OrgPlatformToken_fingerprintProfileId_fkey" FOREIGN KEY ("fingerprintProfileId") REFERENCES "BrowserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPlatformToken" ADD CONSTRAINT "OrgPlatformToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSubmission" ADD CONSTRAINT "OnboardingSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceVideo" ADD CONSTRAINT "SourceVideo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoVariation" ADD CONSTRAINT "VideoVariation_sourceVideoId_fkey" FOREIGN KEY ("sourceVideoId") REFERENCES "SourceVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRecord" ADD CONSTRAINT "PostRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OrgPlatformToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRecord" ADD CONSTRAINT "PostRecord_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "VideoVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountWarmingLog" ADD CONSTRAINT "AccountWarmingLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OrgPlatformToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyAllocation" ADD CONSTRAINT "ProxyAllocation_assignedAccountId_fkey" FOREIGN KEY ("assignedAccountId") REFERENCES "OrgPlatformToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
