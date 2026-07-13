# Sweepza Stripe Residue Classification

## Safety boundary and evidence status

No Stripe object was mutated. The Stripe connector available during this pass identified the connected account as `explore&earn`; inspection stopped immediately to avoid touching or exposing Explore&Earn state. Therefore the classifications below preserve the accepted assignment snapshot and are not a fresh account-level verification.

Accepted snapshot: dedicated Sweepza live/sandbox configuration and aligned prices; one foreign Explore&Earn webhook; two residual customers; one `$0` draft invoice; no subscriptions, charges, PaymentIntents, refunds, or disputes.

## Classification

| Object | Classification | Retention decision | Evidence needed before action |
| --- | --- | --- | --- |
| Foreign Explore&Earn webhook | Foreign operational object; ownership known, purpose in Sweepza account still requires endpoint inspection | **Must retain** until a Sweepza replacement webhook is proven and founder approves retirement | Endpoint URL, enabled event types, last delivery, destination ownership, and successful replacement deliveries |
| Residual customer 1 | Unknown; could be test or real/customer artifact | Retain; safe to delete only after founder approval | Creation time, livemode, non-sensitive metadata, invoice/subscription/payment relationships, and business-owner confirmation |
| Residual customer 2 | Unknown; could be test or real/customer artifact | Retain; safe to delete only after founder approval | Same as above |
| `$0` draft invoice | Likely test/setup artifact, but still unknown without relationship metadata | Retain; safe to delete only after founder approval | Customer link, livemode, creation source, metadata, line-item purpose, and confirmation it is not an accounting record |
| Subscriptions / charges / PaymentIntents / refunds / disputes | None in accepted snapshot | No action | Fresh read-only zero-count proof from the correct Sweepza account |

No object currently qualifies for deletion. If either customer is tied to a real person, host, invoice, tax, or support record, classify it as a real/customer artifact and retain or create an approved migration/retention plan.

## Replacement webhook path

1. Confirm the correct Sweepza live account and sandbox account.
2. In sandbox, register `https://<dark-preview>/api/webhooks/stripe` with only the event types the current handler supports.
3. Store the sandbox signing secret in the dark Preview lane only.
4. Complete a sandbox Checkout and prove signature verification, host matching, subscription upsert, entitlement behavior, Sentry visibility, and idempotent retry handling.
5. Register `https://sweepza.com/api/webhooks/stripe` in Sweepza live mode with the approved event set, without disabling the foreign endpoint.
6. Install the new live signing secret in Production during an approved change window.
7. Send/observe a controlled non-monetary webhook proof and verify no delivery backlog.
8. Compare recent delivery history and document rollback to the prior secret/endpoint configuration.
9. Only after founder approval, disable before deleting the foreign endpoint; retain evidence and a rollback window.

## Money gate

**NO-GO.** Correct-account inspection, sandbox Checkout, replacement webhook proof, and residue disposition approval are missing. No live subscription or card proof should be attempted in this preflight.
