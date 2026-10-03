import type { SendEmailInput } from "../../email/email-service.js";

export function renderVerificationEmail(
  to: string,
  url: string,
): SendEmailInput {
  const safeUrl = url
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&#039;");
  return {
    to,
    subject: "Verify your Schedlane email",
    text: `Verify your Schedlane email by opening this link:\n${url}\n\nIf you didn't create a Schedlane account, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#F7F8F8;color:#181B1B;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #E5E9E8;border-radius:8px"><div style="color:#0F766E;font-size:20px;font-weight:700">Schedlane</div><h1 style="font-size:24px">Verify your email</h1><p>Confirm your email address before signing in to Schedlane.</p><p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#0F766E;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Verify email</a></p><p>If you didn't create a Schedlane account, you can ignore this email.</p></div></body></html>`,
  };
}
