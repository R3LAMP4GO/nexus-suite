import { createTRPCRouter } from "./trpc";
import { adminRouter } from "./routers/admin";
import { competitorsRouter } from "./routers/competitors";
import { multiplierRouter } from "./routers/multiplier";
import { onboardingRouter } from "./routers/onboarding";
import { dashboardRouter } from "./routers/dashboard";
import { settingsRouter } from "./routers/settings";
import { usageRouter } from "./routers/usage";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  competitors: competitorsRouter,
  multiplier: multiplierRouter,
  onboarding: onboardingRouter,
  dashboard: dashboardRouter,
  settings: settingsRouter,
  usage: usageRouter,
});

export type AppRouter = typeof appRouter;
