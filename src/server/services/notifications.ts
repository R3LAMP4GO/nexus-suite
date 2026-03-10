import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "Nexus Suite <noreply@nexus-suite.com>";
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export type NotificationResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

// ── Shared Layout ────────────────────────────────────────────────

function emailLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#16213e;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background-color:#0f3460;padding:24px 32px;">
          <h1 style="margin:0;color:#e0e0e0;font-size:20px;font-weight:600;letter-spacing:-0.3px;">
            ✦ Nexus Suite
          </h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#e0e0e0;font-size:22px;font-weight:600;">${title}</h2>
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #0f3460;">
          <p style="margin:0;color:#666;font-size:12px;text-align:center;">
            Nexus Suite — Automated Content Operations
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:12px 28px;background-color:#0f3460;color:#e0e0e0;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>`;
}

// ── Email: Script Ready ──────────────────────────────────────────

export async function sendScriptReadyEmail(
  clientEmail: string,
  scriptTitle: string,
): Promise<NotificationResult> {
  const body = `
    <p style="color:#a0a0b8;font-size:15px;line-height:1.6;margin:0 0 8px;">
      A new script has been generated and is ready for your review:
    </p>
    <div style="background-color:#0f3460;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <span style="color:#53d769;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Ready for Review</span>
      <p style="color:#e0e0e0;font-size:17px;font-weight:600;margin:6px 0 0;">${escapeHtml(scriptTitle)}</p>
    </div>
    <p style="color:#a0a0b8;font-size:14px;line-height:1.6;margin:0;">
      Open the Script Studio to review, edit, and approve this script.
    </p>
    ${ctaButton("Open Script Studio", `${APP_URL}/dashboard/studio`)}
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: clientEmail,
      subject: `Your Script is Ready: ${scriptTitle}`,
      html: emailLayout("Script Ready", body),
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ── Email: Video Processed ───────────────────────────────────────

export async function sendVideoProcessedEmail(
  clientEmail: string,
  variationCount: number,
): Promise<NotificationResult> {
  const body = `
    <p style="color:#a0a0b8;font-size:15px;line-height:1.6;margin:0 0 8px;">
      Your video has been processed and multiplied successfully.
    </p>
    <div style="background-color:#0f3460;border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center;">
      <span style="color:#53d769;font-size:36px;font-weight:700;">${variationCount}</span>
      <p style="color:#a0a0b8;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:4px 0 0;">Variations Created</p>
    </div>
    <p style="color:#a0a0b8;font-size:14px;line-height:1.6;margin:0;">
      All variations are ready for review in your dashboard. You can preview, edit, and schedule them for distribution.
    </p>
    ${ctaButton("View Variations", `${APP_URL}/dashboard/upload`)}
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: clientEmail,
      subject: `Your Videos Are Ready — ${variationCount} Variations Created`,
      html: emailLayout("Videos Processed", body),
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ── Email: Account Activated ─────────────────────────────────────

export async function sendActivationEmail(
  clientEmail: string,
  orgName: string,
): Promise<NotificationResult> {
  const body = `
    <p style="color:#a0a0b8;font-size:15px;line-height:1.6;margin:0 0 8px;">
      Your Nexus Suite account for <strong style="color:#e0e0e0;">${escapeHtml(orgName)}</strong> is now fully configured and ready to use.
    </p>
    <div style="background-color:#0f3460;border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center;">
      <span style="color:#53d769;font-size:16px;font-weight:600;">✓ Account Active</span>
      <p style="color:#a0a0b8;font-size:13px;margin:6px 0 0;">AI agents configured &bull; Content pipeline ready &bull; Proxies assigned</p>
    </div>
    <p style="color:#a0a0b8;font-size:14px;line-height:1.6;margin:0;">
      Head to your dashboard to start creating and scheduling content.
    </p>
    ${ctaButton("Open Dashboard", `${APP_URL}/dashboard`)}
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: clientEmail,
      subject: `Your Nexus Suite Account is Ready — ${orgName}`,
      html: emailLayout("Account Activated", body),
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ── Email: Welcome (post-checkout) ──────────────────────────────

export async function sendWelcomeEmail(
  clientEmail: string,
  orgName: string,
): Promise<NotificationResult> {
  const body = `
    <p style="color:#a0a0b8;font-size:15px;line-height:1.6;margin:0 0 8px;">
      Welcome to Nexus Suite! Your organization <strong style="color:#e0e0e0;">${escapeHtml(orgName)}</strong> has been created.
    </p>
    <p style="color:#a0a0b8;font-size:14px;line-height:1.6;margin:0 0 8px;">
      Complete the onboarding wizard to tell us about your brand, niche, and target platforms.
      Our team will then configure your AI agents and content pipeline — typically within 24-48 hours.
    </p>
    ${ctaButton("Start Onboarding", `${APP_URL}/onboarding`)}
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: clientEmail,
      subject: `Welcome to Nexus Suite — ${orgName}`,
      html: emailLayout("Welcome", body),
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
