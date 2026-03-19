import { getBoss } from "@/lib/pg-boss";
import { JobType } from "@/server/worker/jobs/types";
import { createTRPCRouter, onboardedProcedure } from "../trpc";

export const analyticsRouter = createTRPCRouter({
  triggerSync: onboardedProcedure.mutation(async ({ ctx }) => {
    const boss = await getBoss();

    // pg-boss v12 requires queue to exist before send()
    await boss.createQueue(JobType.ANALYTICS_SYNC);

    // Query all connected platform accounts for this org
    const accounts = await ctx.db.orgPlatformToken.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true },
    });

    if (accounts.length === 0) {
      return { jobIds: [] };
    }

    // Default 30-day date range
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateRange = {
      from: thirtyDaysAgo.toISOString().split("T")[0]!,
      to: now.toISOString().split("T")[0]!,
    };

    // Enqueue one job per connected account
    const jobIds = await Promise.all(
      accounts.map((account) =>
        boss.send(JobType.ANALYTICS_SYNC, {
          type: JobType.ANALYTICS_SYNC,
          organizationId: ctx.organizationId,
          platformId: account.id,
          dateRange,
          createdAt: new Date().toISOString(),
        }),
      ),
    );

    return { jobIds };
  }),

  platformBreakdown: onboardedProcedure.query(async ({ ctx }) => {
    const orgId = ctx.organizationId;

    // Get per-platform post counts and statuses
    const postGroups = await ctx.db.postRecord.groupBy({
      by: ["platform", "status"],
      where: { organizationId: orgId },
      _count: true,
    });

    // Get all accounts for this org
    const accounts = await ctx.db.orgPlatformToken.findMany({
      where: { organizationId: orgId },
      select: { id: true, platform: true, accountLabel: true, healthScore: true },
    });

    // Get recent posts per platform with details for "top post" and trend
    const recentPosts = await ctx.db.postRecord.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        platform: true,
        status: true,
        caption: true,
        postedAt: true,
        scheduledAt: true,
        createdAt: true,
        variation: { select: { caption: true } },
        account: { select: { accountLabel: true } },
      },
    });

    const PLATFORMS = ["YOUTUBE", "TIKTOK", "INSTAGRAM", "LINKEDIN", "X", "FACEBOOK"] as const;

    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

    const breakdown = PLATFORMS.map((platform) => {
      // Aggregate post counts
      const platformGroups = postGroups.filter((g) => g.platform === platform);
      const totalPosts = platformGroups.reduce((sum, g) => sum + g._count, 0);
      const successPosts = platformGroups
        .filter((g) => g.status === "SUCCESS")
        .reduce((sum, g) => sum + g._count, 0);
      const failedPosts = platformGroups
        .filter((g) => g.status === "FAILED")
        .reduce((sum, g) => sum + g._count, 0);
      const scheduledPosts = platformGroups
        .filter((g) => g.status === "SCHEDULED")
        .reduce((sum, g) => sum + g._count, 0);

      // Platform accounts
      const platformAccounts = accounts.filter((a) => a.platform === platform);
      const avgHealth =
        platformAccounts.length > 0
          ? platformAccounts.reduce((sum, a) => sum + a.healthScore, 0) /
            platformAccounts.length
          : 0;

      // Posts for this platform
      const platformPosts = recentPosts.filter((p) => p.platform === platform);

      // Top post (most recent successful)
      const topPost = platformPosts.find((p) => p.status === "SUCCESS");

      // Growth trend: compare last 30 days vs previous 30 days
      const last30 = platformPosts.filter(
        (p) => now - new Date(p.createdAt).getTime() < THIRTY_DAYS,
      ).length;
      const prev30 = platformPosts.filter((p) => {
        const age = now - new Date(p.createdAt).getTime();
        return age >= THIRTY_DAYS && age < SIXTY_DAYS;
      }).length;

      const growthPercent =
        prev30 > 0 ? ((last30 - prev30) / prev30) * 100 : last30 > 0 ? 100 : 0;

      // Success rate as engagement proxy
      const engagementRate = totalPosts > 0 ? (successPosts / totalPosts) * 100 : 0;

      return {
        platform,
        totalPosts,
        successPosts,
        failedPosts,
        scheduledPosts,
        accountCount: platformAccounts.length,
        avgHealth,
        engagementRate,
        growthPercent,
        postsLast30Days: last30,
        topPost: topPost
          ? {
              id: topPost.id,
              title: topPost.variation.caption ?? topPost.caption ?? "(untitled)",
              account: topPost.account.accountLabel,
              postedAt: topPost.postedAt ?? topPost.scheduledAt,
            }
          : null,
      };
    });

    return breakdown;
  }),
});
