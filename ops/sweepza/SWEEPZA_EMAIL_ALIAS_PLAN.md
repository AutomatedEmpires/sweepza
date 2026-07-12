# Sweepza Email Alias Plan

## Recorded founder fact

As of 2026-07-12, `support@sweepza.com` is owned and many Sweepza aliases are available. This preflight does not create aliases or activate sending.

`Owner` below means the accountable function; the founder must name the human or shared-mailbox custodian before activation.

| Address | Purpose | Mode | Owner | Launch required | Resend capacity | Support mailbox exists | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `support@sweepza.com` | User and host support intake | Send + receive | Support lead | Yes for controlled users | Helpful for replies/transactional follow-up | Ownership confirmed; mailbox behavior not proven | High: missed requests, privacy, impersonation |
| `hello@sweepza.com` | General inquiries | Forward-only initially | Operations | No | No initially | Not proven | Medium: unowned intake |
| `hosts@sweepza.com` | Host onboarding and operations | Send + receive | Host operations | Yes before paid hosts | Yes if automated host notices use it | Not proven | High: commercial commitments |
| `winners@sweepza.com` | Winner verification/support | Send + receive | Trust & safety | Before winner verification scales | Yes for controlled notices | Not proven | High: sensitive evidence and fraud |
| `legal@sweepza.com` | Legal notices | Forward-only | Founder/legal counsel | Yes before public launch | No | Not proven | High: statutory notices |
| `privacy@sweepza.com` | Privacy requests | Send + receive | Privacy owner | Yes before collecting production user data | No; use human workflow first | Not proven | High: deadlines and identity verification |
| `billing@sweepza.com` | Billing support | Send + receive | Finance/support | Yes before paid hosts | Yes for receipts only if provider design requires | Not proven | High: financial phishing and disputes |
| `no-reply@sweepza.com` | Non-reply transactional sender | Send-only | Engineering/operations | No; avoid unless reply routing is explicit | Yes | Not applicable | Medium: poor support path and deliverability |
| `notifications@sweepza.com` | Product notifications | Send-only with monitored reply-to | Engineering/operations | Only when notifications activate | Yes | Not proven | High: consent, suppression, deliverability |

## Activation sequence

1. Founder names mailbox owners and approves which aliases are created.
2. Prove `support@sweepza.com` receive, reply, retention, escalation, and recovery behavior.
3. Decide whether transactional mail uses the apex domain or a dedicated sending subdomain; do not change DNS in this preflight.
4. Confirm Resend plan capacity, domain verification, suppression handling, bounce/complaint monitoring, and least-privilege API-key custody.
5. Activate only a dark Preview/test-recipient proof first, with non-sensitive content and an explicit allowlist.
6. Approve templates, reply-to behavior, consent rules, and operational ownership before Production activation.

## Founder decisions required

- Human/shared-mailbox owner for every launch-required address.
- Forward-only versus send+receive behavior and retention policy.
- Apex versus sending-subdomain architecture.
- Resend plan/capacity and budget.
- Whether `no-reply@` is allowed; recommended default is a monitored reply-to.
- Approval to create aliases and perform a dark-lane sending proof.
