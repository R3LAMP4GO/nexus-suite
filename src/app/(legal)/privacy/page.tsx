export const metadata = { title: "Privacy Policy — Nexus Suite" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-300">
      <h1 className="mb-8 text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mb-4 text-sm text-gray-500">Last updated: March 11, 2026</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="mt-6 text-lg font-semibold text-white">1. Information We Collect</h2>
        <p>
          When you use Nexus Suite, we collect information you provide directly: your name, email
          address, and organization details. When you connect social media accounts, we receive
          OAuth access tokens and basic profile information from those platforms.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul className="ml-6 list-disc space-y-1">
          <li>Provide and maintain the Service</li>
          <li>Publish and manage content on your connected platforms</li>
          <li>Generate analytics and performance reports</li>
          <li>Send transactional emails (account notifications, workflow alerts)</li>
          <li>Process payments via Stripe</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-white">3. Data Storage &amp; Security</h2>
        <p>
          Your data is stored in PostgreSQL databases hosted on secured infrastructure. Sensitive
          credentials (platform OAuth tokens, API keys) are stored in Infisical, an encrypted
          secrets management vault — never in plaintext in our database. We use the
          fetch-use-discard pattern: credentials are retrieved only when needed, used, and
          immediately discarded from memory.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">4. Third-Party Services</h2>
        <p>We integrate with the following third-party services:</p>
        <ul className="ml-6 list-disc space-y-1">
          <li><strong>Stripe</strong> — payment processing (we never store card numbers)</li>
          <li><strong>Google/YouTube, TikTok, Instagram, Facebook, LinkedIn, X</strong> — content publishing via OAuth</li>
          <li><strong>Cloudflare R2</strong> — media file storage</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-white">5. Data Sharing</h2>
        <p>
          We do not sell, trade, or share your personal information with third parties for marketing
          purposes. We only share data with the third-party services listed above as necessary to
          operate the Service.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul className="ml-6 list-disc space-y-1">
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your data and account</li>
          <li>Revoke platform connections at any time</li>
          <li>Export your content and data</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-white">7. Cookies</h2>
        <p>
          We use essential cookies for authentication (session management). We do not use tracking
          or advertising cookies.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">8. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active. Upon account deletion, we
          remove your personal data within 30 days. Anonymized analytics data may be retained
          indefinitely.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">9. Changes to This Policy</h2>
        <p>
          We may update this privacy policy from time to time. We will notify you of significant
          changes via email or in-app notification.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">10. Contact</h2>
        <p>
          For privacy-related inquiries, contact us at{" "}
          <a href="mailto:privacy@nexus-suite.com" className="text-blue-400 hover:underline">
            privacy@nexus-suite.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
