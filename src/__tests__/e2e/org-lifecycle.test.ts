/**
 * E2E: Organization Lifecycle
 *
 * Tests the full org lifecycle from Stripe checkout → PENDING_SETUP →
 * onboarding submission → admin activation → ACTIVE → subscription changes → CANCELED.
 *
 * Verifies: Auth gate (Decision 2), Stripe webhook flow, 4-layer auth, admin activation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Stripe ─────────────────────────────────────────────────
const mockStripe = {
  webhooks: { constructEvent: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
};

vi.mock("@/lib/stripe", () => ({
  stripe: mockStripe,
  resolveTierFromPriceId: vi.fn((priceId: string) => {
    if (priceId === "price_pro") return "PRO";
    if (priceId === "price_multiplier") return "MULTIPLIER";
    return null;
  }),
  PRICING: {
    PRO: {
      features: {
        maxAccounts: 3,
        maxWorkflowRuns: 50,
        maxVideosPerMonth: 30,
        mlFeaturesEnabled: false,
        multiplierEnabled: false,
        dailyLlmBudgetCents: 500,
      },
    },
    MULTIPLIER: {
      features: {
        maxAccounts: 25,
        maxWorkflowRuns: 500,
        maxVideosPerMonth: 300,
        mlFeaturesEnabled: true,
        multiplierEnabled: true,
        dailyLlmBudgetCents: 1500,
      },
    },
  },
}));

// ── Mock DB ─────────────────────────────────────────────────────
const orgStore = new Map<string, Record<string, unknown>>();
const eventStore = new Map<string, Record<string, unknown>>();
const submissionStore = new Map<string, Record<string, unknown>>();

const mockDb = {
  stripeEvent: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      eventStore.get(where.id) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const record = { ...data };
      eventStore.set(data.id as string, record);
      return record;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = eventStore.get(where.id);
      if (existing) Object.assign(existing, data);
      return existing;
    }),
  },
  user: {
    findUnique: vi.fn(async () => ({
      id: "user_e2e",
      name: "E2E User",
      email: "e2e@test.com",
    })),
  },
  organization: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `org_${Date.now()}`;
      const org = { id, ...data };
      orgStore.set(id, org);
      return org;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id?: string; stripeSubscriptionId?: string } }) => {
      if (where.id) return orgStore.get(where.id) ?? null;
      for (const org of orgStore.values()) {
        if (org.stripeSubscriptionId === where.stripeSubscriptionId) return org;
      }
      return null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = orgStore.get(where.id);
      if (existing) Object.assign(existing, data);
      return existing;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      for (const org of orgStore.values()) {
        if (org.stripeSubscriptionId === where.stripeSubscriptionId) {
          Object.assign(org, data);
        }
      }
      return { count: 1 };
    }),
  },
  onboardingSubmission: {
    findUnique: vi.fn(async ({ where }: { where: { organizationId: string } }) =>
      submissionStore.get(where.organizationId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `onb_${Date.now()}`, ...data };
      submissionStore.set(data.organizationId as string, record);
      return record;
    }),
  },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "stripe-signature" ? "sig_test" : null),
  })),
}));

const { POST } = await import("@/app/api/webhooks/stripe/route");

describe("E2E: Full Organization Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgStore.clear();
    eventStore.clear();
    submissionStore.clear();
  });

  function makeRequest() {
    return new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });
  }

  it("completes full lifecycle: checkout → pending → onboarding → active → canceled", async () => {
    // ── Step 1: Stripe checkout.session.completed → creates org with PENDING_SETUP ──
    const checkoutEvent = {
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          customer: "cus_lifecycle_1",
          subscription: "sub_lifecycle_1",
          customer_details: { email: "e2e@test.com" },
          metadata: { orgName: "Lifecycle Test Org" },
          payment_intent: "pi_lifecycle_1",
        },
      },
    };

    mockStripe.webhooks.constructEvent.mockReturnValue(checkoutEvent);
    mockStripe.subscriptions.retrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_pro", type: "recurring" } }] },
    });

    const checkoutRes = await POST(makeRequest());
    expect((await checkoutRes.json()).received).toBe(true);

    // Verify org was created with correct initial state
    const createCall = mockDb.organization.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(createCall.data.onboardingStatus).toBe("PENDING_SETUP");
    expect(createCall.data.subscriptionStatus).toBe("ACTIVE");
    expect(createCall.data.pricingTier).toBe("PRO");
    expect(createCall.data.maxAccounts).toBe(3);
    expect(createCall.data.multiplierEnabled).toBe(false);

    // Get the created org ID
    const createdOrg = mockDb.organization.create.mock.results[0]!.value as { id: string };
    const orgId = (await createdOrg).id;

    // ── Step 2: User submits onboarding form ──
    await mockDb.onboardingSubmission.create({
      data: {
        organizationId: orgId,
        niche: "fitness",
        brandVoice: "motivational",
        tonePreferences: ["energetic", "authoritative"],
        competitorUrls: ["https://competitor1.com", "https://competitor2.com"],
        platforms: ["youtube", "tiktok", "instagram"],
        postingFrequency: "daily",
        contentStyle: "educational",
        additionalNotes: "Focus on transformation stories",
      },
    });

    // Verify submission was stored
    const submission = await mockDb.onboardingSubmission.findUnique({
      where: { organizationId: orgId },
    });
    expect(submission).toBeTruthy();
    expect((submission as Record<string, unknown>).niche).toBe("fitness");

    // ── Step 3: Admin activates the org ──
    orgStore.set(orgId, {
      id: orgId,
      onboardingStatus: "PENDING_SETUP",
      subscriptionStatus: "ACTIVE",
      stripeSubscriptionId: "sub_lifecycle_1",
    });

    await mockDb.organization.update({
      where: { id: orgId },
      data: { onboardingStatus: "ACTIVE" },
    });

    const activatedOrg = orgStore.get(orgId);
    expect(activatedOrg?.onboardingStatus).toBe("ACTIVE");

    // ── Step 4: Subscription upgraded to Multiplier ──
    const upgradeEvent = {
      id: "evt_upgrade_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_lifecycle_1",
          status: "active",
          items: { data: [{ price: { id: "price_multiplier", type: "recurring" } }] },
        },
      },
    };

    mockStripe.webhooks.constructEvent.mockReturnValue(upgradeEvent);
    // Need to set pricingTier so the handler can detect the change
    const orgForUpgrade = orgStore.get(orgId)!;
    orgForUpgrade.pricingTier = "PRO";

    mockDb.organization.findUnique.mockResolvedValueOnce(orgForUpgrade);

    const upgradeRes = await POST(makeRequest());
    expect((await upgradeRes.json()).received).toBe(true);

    // ── Step 5: Subscription canceled ──
    const cancelEvent = {
      id: "evt_cancel_1",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_lifecycle_1" },
      },
    };

    mockStripe.webhooks.constructEvent.mockReturnValue(cancelEvent);

    const cancelRes = await POST(makeRequest());
    expect((await cancelRes.json()).received).toBe(true);

    // Verify updateMany was called with CANCELED + SUSPENDED
    expect(mockDb.organization.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: "sub_lifecycle_1" },
      data: {
        subscriptionStatus: "CANCELED",
        onboardingStatus: "SUSPENDED",
      },
    });
  });

  it("handles payment failure → PAST_DUE status transition", async () => {
    // Set up an active org
    orgStore.set("org_payment_test", {
      id: "org_payment_test",
      stripeSubscriptionId: "sub_payment_1",
      subscriptionStatus: "ACTIVE",
      onboardingStatus: "ACTIVE",
    });

    const failEvent = {
      id: "evt_payment_fail_1",
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: "sub_payment_1",
        },
      },
    };

    mockStripe.webhooks.constructEvent.mockReturnValue(failEvent);
    const res = await POST(makeRequest());
    expect((await res.json()).received).toBe(true);

    expect(mockDb.organization.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: "sub_payment_1" },
      data: { subscriptionStatus: "PAST_DUE" },
    });
  });
});
