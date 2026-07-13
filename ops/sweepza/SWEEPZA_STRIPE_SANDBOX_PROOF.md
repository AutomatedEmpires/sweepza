# Sweepza Stripe Sandbox Proof

## Account and catalog

Direct read-only Stripe API authentication using Doppler `sweepza/stg` verified:

- Account: `sweepza_sandbox` / `acct_1TeqgHD7Yqq488pB`
- Mode: test/sandbox
- Host plan: product `prod_Uq6AlYVdb5HNEX`, price `price_1TqPyCD7Yqq488pBwpkkZVkN`, USD 19/month
- Extra active listing: product `prod_Uq6A3izchO1fo3`, price `price_1TqPyDD7Yqq488pB8KvIhv1D`, USD 5/month

## Checkout proof

Created Checkout Session `cs_test_a16HHUfYS8XkXYcLUotBbPuVbMk3ioGwQ0SsR60jxIFoZx9bPxgJ7DO51P`.

- `livemode=false`
- mode `subscription`
- status `open`
- payment status `unpaid`
- no card was entered, no charge was created, and no subscription was completed

## Webhook proof

- Existing sandbox endpoint retained: `we_1TqPyDD7Yqq488pB4y14zTMn` at `https://sweepza.vercel.app/api/webhooks/stripe`.
- Replacement Preview endpoint created: `we_1TsXdmD7Yqq488pBA7y2SYOy` for deployment `dpl_HLrzHx9Wz7VFgupVu25pBbjgDihe`'s exact webhook route.
- Events are limited to `customer.subscription.created`, `.updated`, and `.deleted`, matching the handler.
- The replacement signing secret is stored in Doppler `sweepza/stg` and Vercel Preview; it is not printed here.
- A controlled synthetic event signed with that endpoint's secret reached the deployed handler and returned HTTP 200 with `action: ignored`; no Stripe or database object was mutated by the proof.

## Live residue boundary

The installed Stripe connector identifies as Explore&Earn, so no Sweepza live customer, invoice, or webhook was inspected or changed. The two unknown live customers and `$0` draft invoice retain their prior `unknown / retain` classification. The foreign live webhook must remain until a Sweepza live replacement is proven and the founder approves retirement.

## Money decision

Sandbox catalog and Checkout creation: **PASS**.

Signed Preview webhook receipt: **PASS**. Subscription-to-database processing still requires a disposable host fixture.

Live payments: **NO-GO**.
