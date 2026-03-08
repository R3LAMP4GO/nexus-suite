-- AlterTable: change subscriptionStatus from OnboardingStatus to SubscriptionStatus
ALTER TABLE "Organization" ALTER COLUMN "subscriptionStatus" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "subscriptionStatus" TYPE "SubscriptionStatus" USING (
  CASE "subscriptionStatus"::text
    WHEN 'PENDING_PAYMENT' THEN 'INACTIVE'
    WHEN 'PENDING_SETUP' THEN 'INACTIVE'
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'SUSPENDED' THEN 'CANCELED'
    ELSE 'INACTIVE'
  END::"SubscriptionStatus"
);
ALTER TABLE "Organization" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'INACTIVE'::"SubscriptionStatus";
