import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe auth config — no DB adapter, no Node.js-only imports.
// Used by middleware. Full config with adapter lives in config.ts.
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      return true; // Let middleware.ts handle route logic
    },
    // Forward custom JWT fields to session so middleware can read them.
    // The full config (config.ts) overrides this with its own richer session callback.
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.onboardingStatus = token.onboardingStatus as string | undefined;
        session.user.subscriptionStatus = token.subscriptionStatus as string | undefined;
        session.user.organizationId = token.organizationId as string | undefined;
        (session as Record<string, unknown>).hasOrg = token.hasOrg;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
