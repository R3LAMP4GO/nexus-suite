export const metadata = { title: "Terms of Service — Nexus Suite" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-300">
      <h1 className="mb-8 text-3xl font-bold text-white">Terms of Service</h1>
      <p className="mb-4 text-sm text-gray-500">Last updated: March 11, 2026</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="mt-6 text-lg font-semibold text-white">1. Acceptance of Terms</h2>
        <p>
          By accessing or using Nexus Suite (&quot;the Service&quot;), operated by Douro Digital Media
          (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), you agree to be bound by these Terms of Service.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">2. Description of Service</h2>
        <p>
          Nexus Suite is a content management and distribution platform that helps creators and
          agencies manage, optimize, and publish content across multiple social media platforms.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">3. User Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and for
          all activities that occur under your account. You must notify us immediately of any
          unauthorized use.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">4. Platform Connections</h2>
        <p>
          The Service may request access to your social media accounts (YouTube, TikTok, Instagram,
          etc.) via OAuth. You grant us permission to act on your behalf within the scope of
          permissions you authorize. You may revoke access at any time through your account settings
          or the respective platform.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">5. Content Ownership</h2>
        <p>
          You retain full ownership of all content you create, upload, or distribute through the
          Service. We do not claim any intellectual property rights over your content.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">6. Acceptable Use</h2>
        <p>
          You agree not to use the Service to distribute content that is illegal, harmful,
          threatening, abusive, defamatory, or otherwise objectionable. We reserve the right to
          suspend accounts that violate these terms.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">7. Payment &amp; Billing</h2>
        <p>
          Paid plans are billed according to the pricing tier selected during onboarding. All fees
          are non-refundable unless otherwise stated. We may change pricing with 30 days&apos; notice.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">8. Limitation of Liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. We shall not be liable
          for any indirect, incidental, or consequential damages arising from your use of the
          Service.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">9. Changes to Terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the Service after changes
          constitutes acceptance of the new terms.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-white">10. Contact</h2>
        <p>
          For questions about these terms, contact us at{" "}
          <a href="mailto:legal@nexus-suite.com" className="text-blue-400 hover:underline">
            legal@nexus-suite.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
