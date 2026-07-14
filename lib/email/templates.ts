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

const HOST_FOOTER =
  "You're receiving this because you have a Sweepza host account. Manage your email preferences in your host dashboard.";
const SEEKER_FOOTER =
  "You're receiving this because you saved or entered these sweepstakes on Sweepza — we only reach out when one of them needs you.";

function layout(
  headline: string,
  bodyHtml: string,
  footerNote: string = HOST_FOOTER,
): string {
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
    `<p style="margin:0;font-size:12px;color:${MUTED};">${escapeHtml(footerNote)}</p>`,
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

export type SeekerReminderKind = "ready_again" | "ends_today" | "ending_soon";

export interface SeekerReminderItem {
  kind: SeekerReminderKind;
  title: string;
  listingUrl: string;
  endsInDays: number;
}

function reminderRow(item: SeekerReminderItem): string {
  const meta =
    item.kind === "ready_again"
      ? { tag: "Ready again", color: "#3E6B52", bg: "#eaf3ee", note: "Your entry window re-opened" }
      : item.kind === "ends_today"
        ? { tag: "Ends today", color: "#C9381F", bg: "#fdece8", note: "Last call — enter before it closes" }
        : {
            tag: "Ending soon",
            color: "#B0812A",
            bg: "#fbf3e0",
            note:
              item.endsInDays <= 1
                ? "Ends in about a day"
                : `Ends in ${item.endsInDays} days`,
          };
  return [
    `<a href="${escapeHtml(item.listingUrl)}" style="display:block;text-decoration:none;margin:0 0 12px;padding:14px 16px;border:1px solid ${BORDER};border-radius:10px;">`,
    `<span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${meta.color};background-color:${meta.bg};padding:3px 8px;border-radius:999px;">${escapeHtml(meta.tag)}</span>`,
    `<span style="display:block;margin:8px 0 2px;font-size:16px;font-weight:600;color:${TEXT};">${escapeHtml(item.title)}</span>`,
    `<span style="display:block;font-size:13px;color:${MUTED};">${escapeHtml(meta.note)}</span>`,
    `</a>`,
  ].join("");
}

/**
 * The seeker reminder digest — one email that batches everything needing the
 * user right now, urgency-ordered. The literal expression of "Sweepza remembers
 * so you don't have to." Sent by app/api/cron/seeker-reminders.
 */
export function seekerReminderDigestEmail(args: {
  displayName: string;
  todayUrl: string;
  items: SeekerReminderItem[];
}): EmailContent {
  const { displayName, todayUrl, items } = args;
  const count = items.length;
  const hasEndsToday = items.some((i) => i.kind === "ends_today");
  const hasReadyAgain = items.some((i) => i.kind === "ready_again");

  const subject = hasEndsToday
    ? `⏰ ${count === 1 ? "A sweep you're tracking ends" : `${count} sweeps you're tracking need you`} today`
    : hasReadyAgain
      ? `${count === 1 ? "A sweep is" : `${count} sweeps are`} ready to enter again`
      : `${count === 1 ? "A sweep you saved is" : `${count} sweeps you saved are`} ending soon`;

  const headline = hasEndsToday
    ? "Don't miss these today"
    : hasReadyAgain
      ? "Ready for another entry"
      : "Ending soon";

  const body = [
    paragraph(`Hi ${escapeHtml(displayName)},`),
    paragraph(
      `Here ${count === 1 ? "is" : "are"} the ${count === 1 ? "sweep" : `${count} sweeps`} that need you right now:`,
    ),
    items.map(reminderRow).join(""),
    `<div style="margin:20px 0 8px;">${button(todayUrl, "Open Today")}</div>`,
    paragraph(
      `We only send this when something you're tracking actually needs a look — nothing more.`,
    ),
  ].join("");

  return { subject, html: layout(headline, body, SEEKER_FOOTER) };
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
