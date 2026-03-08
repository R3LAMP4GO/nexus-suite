import { z } from "zod";
import { createTRPCRouter, authedProcedure } from "../trpc";
import { stripe, PRICING, type PricingTier } from "@/lib/stripe";

export const pricingRouter = createTRPCRouter({
  createCheckoutSession: authedProcedure
    .input(z.object({ tier: z.enum(["PRO", "MULTIPLIER", "ENTERPRISE"]) }))
    .mutation(async ({ ctx, input }) => {
      const tierConfig = PRICING[input.tier as PricingTier];

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: ctx.session.user.email ?? undefined,
        metadata: {
          userId: ctx.userId,
          tier: input.tier,
        },
        line_items: [
          { price: tierConfig.setupPriceId, quantity: 1 },
          { price: tierConfig.subscriptionPriceId, quantity: 1 },
        ],
        success_url: `${process.env.NEXTAUTH_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
      });

      return { url: session.url! };
    }),
});
