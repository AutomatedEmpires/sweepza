// Transactional email templates. Plain TypeScript, no dependencies.
// Email clients ignore <style> blocks and external CSS unreliably, so every
// rule is an inline style. Keep copy short, warm, and on-brand.

export interface EmailContent {
  subject: string;
  html: string;
}

const BRAND = "#6d28d9";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background-color:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;font-size:15px;">${escapeHtml(label)}</a>`;
}

function layout(headline: string, bodyHtml: string): string {
  return [
    `<div style="margin:0;padding:24px;background-color:#f5f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`,
    `<div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">`,
    `<div style="background-color:${BRAND};padding:20px 28px;">`,
    `<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">Sweepza</span>`,
    `</div>`,
    `<div style="padding:28px;">`,
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${TEXT};">${escapeHtml(headline)}</h1>`,
    bodyHtml,
    `</div>`,
    `<div style="padding:18px 28px;border-top:1px solid ${BORDER};">`,
    `<p style="margin:0;font-size:12px;color:${MUTED};">You're receiving this because you have a Sweepza host account. Manage your email preferences in your host dashboard.</p>`,
    `</div>`,
    `</div>`,
    `</div>`,
  ].join("");
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXT};">${html}</p>`;
}

export function listingApprovedEmail(args: {
  hostName: string;
  listingTitle: string;
  listingUrl: string;
}): EmailContent {
  const { hostName, listingTitle, listingUrl } = args;
  const body = [
    paragraph(`Hi ${escapeHtml(hostName)},`),
    paragraph(
      `Great news \u2014 your sweepstakes <strong>${escapeHtml(listingTitle)}</strong> has been approved and is now live on Sweepza. Seekers can discover and enter it right away.`,
    ),
    `<div style="margin:8px 0 20px;">${button(listingUrl, "View your listing")}</div>`,
    paragraph(
      `Thanks for sharing your giveaway with the Sweepza community. We're excited to help you reach more entrants.`,
    ),
  ].join("");
  return {
    subject: "Your sweepstakes is live on Sweepza",
    html: layout("Your sweepstakes is live \uD83C\uDF89", body),
  };
}

export function listingHeldEmail(args: {
  hostName: string;
  listingTitle: string;
  reviewNotes: string;
}): EmailContent {
  const { hostName, listingTitle, reviewNotes } = args;
  const notes = reviewNotes.trim()
    ? reviewNotes
    : "Please review your listing details and resubmit when ready.";
  const body = [
    paragraph(`Hi ${escapeHtml(hostName)},`),
    paragraph(
      `Thanks for submitting <strong>${escapeHtml(listingTitle)}</strong>. Before it can go live, our review team needs a few updates.`,
    ),
    `<div style="margin:0 0 18px;padding:14px 16px;background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;"><p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#92400e;">Reviewer notes</p><p style="margin:0;font-size:14px;line-height:1.6;color:#78350f;white-space:pre-wrap;">${escapeHtml(notes)}</p></div>`,
    paragraph(
      `Make the updates in your host dashboard and resubmit \u2014 we'll take another look as soon as it's back in the queue.`,
    ),
  ].join("");
  return {
    subject: "Action needed: your sweepstakes needs updates",
    html: layout("A few updates needed", body),
  };
}

export function listingExpiringSoonEmail(args: {
  hostName: string;
  listingTitle: string;
  endDate: string;
  listingUrl: string;
}): EmailContent {
  const { hostName, listingTitle, endDate, listingUrl } = args;
  const body = [
    paragraph(`Hi ${escapeHtml(hostName)},`),
    paragraph(
      `Just a heads-up: your sweepstakes <strong>${escapeHtml(listingTitle)}</strong> ends in about 48 hours${endDate ? ` (on ${escapeHtml(endDate)})` : ""}. This is a great moment for one last push to entrants.`,
    ),
    `<div style="margin:8px 0 20px;">${button(listingUrl, "View your listing")}</div>`,
    paragraph(
      `Once it ends, it will move out of active discovery automatically. Want to keep the momentum going? Consider launching a new giveaway next.`,
    ),
  ].join("");
  return {
    subject: "Your sweepstakes ends in 48 hours",
    html: layout("Ending soon \u23F0", body),
  };
}

export function winnerPostPublishedEmail(args: {
  displayName: string;
  listingTitle: string;
  winnersUrl: string;
}): EmailContent {
  const { displayName, listingTitle, winnersUrl } = args;
  const body = [
    paragraph(`Hi ${escapeHtml(displayName)},`),
    paragraph(
      `Congratulations \u2014 your win story${listingTitle ? ` for <strong>${escapeHtml(listingTitle)}</strong>` : ""} is now published on the Sweepza Winner Wall for everyone to celebrate!`,
    ),
    `<div style="margin:8px 0 20px;">${button(winnersUrl, "See it on the Winner Wall")}</div>`,
    paragraph(`Enjoy your prize, and thanks for sharing your win with the community.`),
  ].join("");
  return {
    subject: "Your win story is live on Sweepza!",
    html: layout("You made the Winner Wall \uD83C\uDFC6", body),
  };
}
