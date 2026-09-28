export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function brandedEmailShell(
  title: string,
  paragraphs: string[],
  action?: { label: string; url: string },
) {
  const content = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.6">${paragraph}</p>`,
    )
    .join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:11px 18px;border-radius:6px;background:#0F766E;color:#fff;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F7F8F8;color:#181B1B;font-family:Arial,sans-serif"><div style="padding:32px 16px"><div style="max-width:560px;margin:auto;border:1px solid #E5E9E8;border-radius:8px;background:#fff;padding:32px"><div style="margin-bottom:24px;color:#0F766E;font-size:20px;font-weight:700">Schedlane</div><h1 style="margin:0 0 20px;font-size:24px">${escapeHtml(title)}</h1>${content}${button}</div></div></body></html>`;
}

export function supportLine(supportEmail?: string) {
  return supportEmail ? `Questions? Contact us at ${supportEmail}.` : null;
}

export function supportHtml(supportEmail?: string) {
  if (!supportEmail) return null;
  const email = escapeHtml(supportEmail);
  return `Questions? Contact us at <a href="mailto:${email}" style="color:#0F766E">${email}</a>.`;
}
