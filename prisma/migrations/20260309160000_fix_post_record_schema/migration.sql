-- AlterTable: Add missing columns to PostRecord
ALTER TABLE "PostRecord" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PostRecord" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "PostRecord" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill organizationId from the linked account
UPDATE "PostRecord" pr SET "organizationId" = (
  SELECT opt."organizationId" FROM "OrgPlatformToken" opt WHERE opt."id" = pr."accountId"
);

-- Make it NOT NULL after backfill
ALTER TABLE "PostRecord" ALTER COLUMN "organizationId" SET NOT NULL;

-- Add FK and indexes
ALTER TABLE "PostRecord" ADD CONSTRAINT "PostRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PostRecord_organizationId_status_idx" ON "PostRecord"("organizationId", "status");
CREATE INDEX "PostRecord_status_scheduledAt_idx2" ON "PostRecord"("status", "scheduledAt");

-- Drop old enum values that no longer exist in schema
-- The values POSTED, FLAGGED, REMOVED need to be removed but Postgres doesn't support DROP VALUE
-- They are harmless to leave — the schema won't use them
