# nao Cloud billing with Stripe

This runbook covers Stripe configuration, deployment, testing, and recovery for organization billing in nao Cloud.

## Scope

- Billing belongs to an organization.
- The plan is USD 2,000 per month with unlimited users.
- An organization admin can activate one 14-day trial, add payment details, view invoices, manage or cancel the subscription, and recover a paused subscription.
- Billing restrictions preserve all customer data.
- Self-hosted deployments never construct a Stripe client or enforce cloud billing.

Billing is enabled only when both settings are present:

```env
NAO_MODE=cloud
CLOUD_BILLING_ENABLED=true
```

When billing is disabled, billing procedures return `NOT_FOUND`, Stripe routes and jobs do not start, and application access remains unrestricted.

## Runtime overview

```mermaid
flowchart LR
    Admin["Organization admin"] --> UI["Plan & Billing"]
    UI --> API["Billing tRPC routes"]
    API --> Management["Billing management service"]
    Management --> Stripe["Stripe"]
    Stripe --> Webhook["Signed webhook"]
    Webhook --> Inbox[("Webhook inbox")]
    Inbox --> Worker["Reconciliation worker"]
    Worker --> Stripe
    Worker --> Organization[("Organization billing projection")]
    Organization --> Access["Access enforcement"]
```

Stripe is the source of truth. Webhooks trigger reconciliation from canonical Stripe state; the application does not apply webhook payloads directly. The optional local `organization_billing` projection supports access checks and UI queries; self-hosted organizations have no row. Interactive management requires an organization admin, checked at both the route and service boundaries.

```mermaid
sequenceDiagram
    participant Stripe
    participant Webhook
    participant Inbox
    participant Worker
    participant Organization

    Stripe->>Webhook: Signed event
    Webhook->>Webhook: Verify raw body, signature, and mode
    Webhook->>Inbox: Insert event ID and enqueue job
    Webhook-->>Stripe: Acknowledge
    Inbox->>Worker: Process event ID
    Worker->>Stripe: Retrieve canonical customer state
    Worker->>Organization: Conditionally update billing projection
    Worker->>Inbox: Mark event processed
```

## Configure Stripe

### Product and Price

Create one active Product named `nao Cloud` with one active recurring Price:

- currency: `USD`;
- unit amount: `200000`;
- interval: monthly;
- usage type: licensed;
- quantity: `1`;
- lookup key: a versioned value such as `nao_cloud_monthly_v3`.

Record the Product ID and assign the lookup key only to a Price under that Product. nao validates both identities independently, along with the active Product, monthly interval, licensed usage type, and USD currency.

The deployment configuration remains responsible for selecting the USD 2,000 Price. nao rejects an inactive, non-USD, non-monthly, metered, or zero-value Price, but it does not hard-code the unit amount so future Price replacements do not require an application release.

Checkout always sells quantity `1`. nao recognizes a subscription by its Product, not its quantity, so a quantity changed in the Dashboard never revokes access.

```mermaid
flowchart LR
    PriceConfig["Price lookup key"] -.->|"selects for new Checkout"| CurrentPrice["Current Price"]
    ProductConfig["Configured Product ID"] -.->|"recognizes subscriptions"| Product["nao Cloud Product"]
    Product --> CurrentPrice
    Product --> SubscriptionPrice["Current or historical Price"]
    Customer["Stripe Customer"] --> Subscription["Subscription"]
    Customer --> Invoice["Invoices"]
    Subscription -->|"references one"| SubscriptionPrice
    Organization[("Organization projection")] -.->|"stores IDs"| Customer
    Organization -.-> Subscription
    Organization -.-> SubscriptionPrice
```

### Early-customer promotion code

Checkout accepts Stripe promotion codes. Stripe owns code validation, redemption limits, and discount calculation; nao does not store or validate codes.

For the initial 50%-off customer offer:

1. Create one Coupon for 50% off.
2. Restrict the Coupon to the `nao Cloud` Product.
3. Set its duration to **Forever** so the discount applies to the first paid invoice after the 14-day trial and every later invoice.
4. Create a customer-facing Promotion Code for the Coupon. A Coupon ID cannot be entered in Checkout.
5. Limit redemptions to the approved number of early customers and set a redemption deadline.

A shared code with a global redemption limit can be claimed by any customer who knows it. Prefer a unique, hard-to-guess Promotion Code with one redemption for each approved customer when that risk matters.

Do not use a `once` or `repeating` Coupon for this offer. Stripe creates a finalized USD 0 invoice when the trial starts, and repeating durations begin when the Coupon is applied. Those duration choices require separate sandbox validation if a future offer should cover a specific number of paid invoices.

Create and test the Coupon and Promotion Codes separately in sandbox and live mode. Stripe account objects and settings do not carry between modes.

### Tax

Checkout enables automatic tax, requires a billing address, and collects business tax IDs. Checkout creation fails until Stripe Tax is active in the matching Stripe account:

1. Activate Stripe Tax and set the origin address.
2. Add a tax registration for each jurisdiction where nao must collect tax.
3. Set the Product tax code for SaaS and the Price tax behavior to exclusive.
4. Enable tax ID display on invoices.

With exclusive pricing, Stripe adds tax to the USD 2,000 amount where required and applies reverse charge when a valid business tax ID makes it applicable.

### Customer Portal

Configure the Customer Portal to:

- update payment methods, billing addresses, and tax IDs as required;
- display and download invoices;
- cancel at the end of the current period;
- preserve an active trial when subscription details change;
- return to `/settings/organization/billing`;
- disable plan switching and quantity changes while only one plan exists.

Set `STRIPE_PORTAL_CONFIGURATION_ID` when nao should use a specific Portal configuration. Otherwise, nao uses the Stripe account default.

### Stripe-hosted customer emails and retries

In **Billing → Subscriptions and emails**, let Stripe send all billing lifecycle emails:

- enable the free-trial ending reminder; Stripe sends it seven days before the trial ends;
- enable successful payment receipts;
- enable failed-payment and payment-action-required emails;
- enable expiring-card reminders;
- enable cancellation confirmations.

Configure Stripe branding, public business details, support contact, and the customer-facing statement descriptor before enabling these emails. nao does not send billing emails and does not require SMTP for billing.

Stripe does not send trial-ending reminder emails in sandbox mode. Verify the sandbox configuration and subscription lifecycle there, then validate email delivery with a controlled live-mode trial.

Stripe sends these messages to the Stripe Customer email. nao sets that address from the organization admin who first creates the billing Customer. Change the Customer email in Stripe if billing notifications should go to a shared finance inbox.

Configure Smart Retries deliberately and set the final action to cancel the subscription or mark it unpaid. A non-canceling `past_due` subscription keeps access only until its projected period end plus the 24-hour reconciliation grace while Stripe retries payment. A scheduled cancellation gets no grace and loses access at its projected billing access end. nao also restricts access as soon as Stripe marks the subscription `unpaid` or `canceled`. The final action is mandatory because lifecycle reconciliation can keep projecting later billing periods for a subscription left `past_due`, extending access without payment.

### Trial abuse

Trial Checkout requires and saves a card, but this alone does not block repeated trials. The abuse control must also be enabled directly in every Stripe sandbox and live account:

1. In **Radar Settings**, enable Radar for payment methods saved for future use.
2. Under **Radar → Risk controls**, enable **Free trial abuse**.
3. Review Stripe's backtest before enabling the control in live mode.
4. Monitor blocked trial attempts in the Dashboard.

`CLOUD_BILLING_ENABLED=true` does not configure Radar. Do not enable cloud billing for customers until the matching Stripe account has this control enabled.

The application prevents a second trial for the same organization and Stripe Customer. It does not detect a person creating another account and personal organization. Radar must provide the cross-account, card, device, and risk signals for that case.

### Abuse-control ownership

Production protection is split across Stripe, deployment infrastructure, and nao:

- **Stripe Dashboard:** enable Radar for saved payment methods, Free trial abuse, Smart Retries, billing emails, and a locked Customer Portal with plan switching and quantity changes disabled.
- **Stripe dispute policy:** define how disputes, fraudulent charges, and refunds affect the subscription. The current webhook handler does not consume dispute or refund events. Use a tested Stripe Workflow or add application handling that moves the subscription to a status nao restricts.
- **Deployment infrastructure:** rate-limit authenticated billing procedures by user and organization. The backend uses authorization and Stripe idempotency keys but does not include a billing endpoint rate limiter. Do not apply the same tight limit to signed Stripe webhooks, which must remain available for Stripe retries.
- **nao application:** validates organization ownership, Product identity, webhook signatures and mode, and restricts access for non-entitled subscription statuses.
- **Usage controls:** Stripe billing does not limit compute consumption or account sharing for an entitled organization. Any such limits belong to application or infrastructure usage controls.

### Webhook

Register:

```text
POST https://<cloud-domain>/api/billing/stripe/webhook
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.updated`
- `payment_method.attached`
- `payment_method.detached`
- `payment_method.updated`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `invoice.finalization_failed`

Pin the webhook destination to the API version configured in `stripe.service.ts`.

nao rejects events whose mode differs from `STRIPE_SECRET_KEY`: live events require a `sk_live_` or `rk_live_` key, and test events require a test key. `MODE` does not affect this check.

## Configure the server

```env
NAO_MODE=cloud
CLOUD_BILLING_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_CLOUD_PRODUCT_ID=prod_example
STRIPE_CLOUD_MONTHLY_PRICE_LOOKUP_KEY=nao_cloud_monthly_v3
STRIPE_WEBHOOK_SECRET=
STRIPE_PORTAL_CONFIGURATION_ID=
```

`STRIPE_SECRET_KEY`, `STRIPE_CLOUD_PRODUCT_ID`, `STRIPE_CLOUD_MONTHLY_PRICE_LOOKUP_KEY`, and `STRIPE_WEBHOOK_SECRET` are required when cloud billing is enabled. The Portal configuration ID is optional.

Keep sandbox and live credentials separate. Store secrets in the deployment secret manager, never in source control, logs, client bundles, database rows, or analytics.

## Lifecycle and access

Creating an organization does not start its trial or call Stripe. An admin activates the trial through Checkout, which saves a card for renewal and lets Stripe Radar block high-risk repeated trials before access starts. Opening or abandoning Checkout does not consume the trial or grant access; signed Stripe state must confirm the subscription.

At trial expiry:

- a usable payment method allows Stripe to begin paid billing;
- a card removed during the trial causes Stripe to pause the subscription and nao to restrict access;
- an admin can add a payment method through the Portal and resume the subscription.

Cancellation takes effect at the configured billing boundary. Access continues until that boundary. A canceled or incomplete-expired subscription can start paid Checkout again without another trial.

Full access is available during a confirmed trial, an entitled active subscription, or a `past_due` subscription while Stripe retries payment, so a failed renewal or a 3D Secure request does not lock out a paying customer. The billing banner warns members about the failed payment. Missing or expired trials and `unpaid`, `paused`, `incomplete`, `incomplete_expired`, or `canceled` subscriptions restrict cost-producing execution.

To tolerate delayed Stripe events or a temporary reconciliation failure, a locally projected `active` or `past_due` subscription remains entitled for up to 24 hours after its projected period end. A non-canceling `trialing` subscription with a saved payment method receives the same grace after its projected trial end. Scheduled cancellations and trials without a saved payment method do not receive this grace.

Restricted organizations retain authentication, organization administration, billing and recovery actions, project deployment, and read-only access to existing customer data. Subscription changes never delete organization data or Stripe history.

```mermaid
stateDiagram-v2
    [*] --> TrialAvailable: Organization created
    TrialAvailable --> Trialing: Trial Checkout confirmed
    TrialAvailable --> TrialAvailable: Checkout abandoned
    Trialing --> Active: Trial ends with payment method
    Trialing --> Paused: Trial ends without payment method
    Trialing --> PastDue: Payment fails
    Active --> PastDue: Renewal fails
    Active --> Canceled: Cancellation boundary
    PastDue --> Active: Recovery succeeds
    PastDue --> Unpaid: Retries exhausted
    Paused --> Active: Payment method added and resumed
    Canceled --> Incomplete: Paid resubscription
    Incomplete --> Active: Checkout succeeds
    Incomplete --> IncompleteExpired: Checkout expires
```

## Change the price

Stripe Prices are immutable. Create a replacement USD Price under the Product identified by `STRIPE_CLOUD_PRODUCT_ID`, with a new versioned lookup key.

1. Create and verify the replacement Price in sandbox.
2. Leave the previous Price active during the rollback window.
3. Update `STRIPE_CLOUD_MONTHLY_PRICE_LOOKUP_KEY` and restart or redeploy nao.
4. Verify the Plan & Billing page and a newly created Checkout.
5. Repeat with the equivalent live-mode Product and Price.

The lookup-key setting affects only Checkout sessions created after the change. Existing subscriptions and earlier Checkout sessions retain their Price, amount, and currency and remain recognized by the configured Product ID. Migrating existing subscriptions is a separate Stripe operation that requires an explicit effective date and proration policy.

To roll back new sales, restore the previous lookup key and redeploy. Do not change `STRIPE_CLOUD_PRODUCT_ID`; keep the Product and historical Prices because reconciliation uses Product identity to recognize current and historical subscriptions.

## Production go-live checklist

Complete the sandbox setup and test-clock scenarios first. Then switch the Stripe Dashboard to live mode and repeat every account-level setting because sandbox and live configurations are independent:

1. Activate Stripe Tax, set the business origin, add required registrations, and verify invoice tax-ID display.
2. Create the live `nao Cloud` Product and exclusive USD 2,000 monthly Price. Record the Product ID and lookup key.
3. Create the live early-customer Coupon and Promotion Codes with the Product, duration, redemption, and deadline restrictions above.
4. Configure the live Customer Portal: payment methods, billing addresses, tax IDs, invoices, and end-of-period cancellation enabled; plan switching and quantity changes disabled.
5. Configure Stripe branding, public business details, support contact, statement descriptor, trial-ending reminders, receipts, failed-payment messages, payment-action messages, expiring-card reminders, and cancellation confirmations.
6. Configure Smart Retries with the final action set to cancel or mark unpaid.
7. Enable Radar for payment methods saved for future use, review the live backtest, and enable Free trial abuse.
8. Configure and test the dispute, fraud, and refund policy. Confirm it transitions affected subscriptions to a status nao restricts, or implement the missing application event handling before launch.
9. Configure edge rate limits for authenticated billing procedures by user and organization without blocking normal Stripe webhook retries.
10. Create the live webhook destination with the exact event list above and API version from `stripe.service.ts`. Record its live `whsec_...` signing secret.
11. Store the live secret key, Product ID, lookup key, webhook secret, and optional Portal configuration ID in the production secret manager.
12. Back up the target database, verify `DB_URI`, apply migrations, and deploy with `CLOUD_BILLING_ENABLED=false`.
13. Confirm the application starts, `POST /api/billing/stripe/webhook` is absent while disabled, `billing.*` tRPC procedures return `NOT_FOUND`, and the live key and webhook secret belong to the same Stripe mode and account.
14. Prepare existing customers as described in [Existing cloud organizations](#existing-cloud-organizations).
15. Set `CLOUD_BILLING_ENABLED=true`, redeploy, complete the existing-customer cutover, create one controlled live subscription, and verify Checkout tax, Promotion Code redemption, the saved card, webhook processing, the Stripe trial email, Portal access, and invoice rendering.
16. Monitor application logs, rate-limit metrics, disputes, refunds, Radar blocks, and Stripe Workbench during the rollout.

### Existing cloud organizations

Every organization created before billing is enabled has no billing state. Enabling billing restricts all of them immediately, including members who cannot manage billing. Give each existing customer a subscription so it keeps access:

1. Before enabling billing, create a live Coupon for the agreed terms, for example 100% off forever for a comped customer, restricted to the `nao Cloud` Product.
2. For each organization, create or reuse one Stripe Customer with the customer's billing email. Do not create a second Customer for an organization.
3. For a fully comped customer, create a subscription on the current `nao Cloud` Price with the Coupon and subscription metadata `nao_org_id=<organization id>`.
4. For any customer whose initial invoice has an amount due, create a Stripe-hosted Checkout Session in subscription mode for the existing Customer, current Price, and agreed Coupon. Require card collection and set subscription metadata `nao_org_id=<organization id>`, then have the customer complete Checkout and any required authentication. Do not create the subscription separately.
5. Before enabling billing, confirm every migrated subscription is `active`, its initial invoice is `paid`, and every non-comped subscription has a saved default payment method. Do not rely on an `incomplete` subscription to preserve access.
6. Schedule the switch in a low-traffic window. The webhook route does not exist while billing is disabled, so Stripe queues the `customer.subscription.created` events for retry.
7. Immediately after enabling billing, resend each `customer.subscription.created` event from Stripe Workbench. Reconciliation links the Customer to the organization from `nao_org_id`, and the hourly lifecycle job keeps it in sync afterwards.
8. Confirm each organization shows **Active** on **Plan & Billing** and that a member can run an agent.

```mermaid
sequenceDiagram
    participant Operator
    participant Customer
    participant Stripe
    participant nao
    Operator->>Stripe: Create or reuse Customer
    alt Fully comped
        Operator->>Stripe: Create zero-due subscription with nao_org_id
    else Payment due
        Operator->>Stripe: Create subscription Checkout with nao_org_id
        Stripe->>Customer: Collect card and required authentication
        Customer->>Stripe: Complete Checkout
    end
    Stripe-->>Operator: Active subscription and paid initial invoice
    Stripe--xnao: Webhook queued (route absent while disabled)
    Operator->>nao: Enable billing and redeploy
    Operator->>Stripe: Resend customer.subscription.created
    Stripe->>nao: Signed webhook
    nao->>Stripe: Retrieve canonical subscription
    nao->>nao: Link Customer to organization and grant access
```

To disable billing enforcement, set `CLOUD_BILLING_ENABLED=false` and redeploy. This does not remove billing state, webhook inbox rows, organizations, or Stripe subscriptions.

## Test in sandbox

Forward Stripe events to the backend:

```bash
stripe listen --forward-to localhost:5005/api/billing/stripe/webhook
```

Use Stripe Billing test clocks to exercise:

- card-required trial Checkout, Radar-blocked trial abuse, and abandoned Checkout;
- successful early-customer Promotion Code redemption, the 14-day trial, and a 50%-discounted first paid invoice;
- invalid, expired, and fully redeemed Promotion Codes, plus full-price Checkout without a code;
- the trial-ending subscription lifecycle; Stripe does not deliver trial reminder emails in sandbox, so validate email delivery separately in a controlled live-mode trial;
- payment-method updates;
- trial pause and resume;
- successful renewals and failed payments;
- cancellation and resubscription;
- the configured dispute and refund response;
- duplicate or delayed events;
- webhook downtime and recovery;
- Dashboard-side subscription changes.

Also verify that the Customer Portal cannot switch plans or quantities and repeated billing requests are throttled at the edge.

Useful test cards:

- `4242 4242 4242 4242`: successful payment;
- `4000 0000 0000 3220`: 3D Secure;
- `4000 0000 0000 0002`: generic decline;
- `4000 0000 0000 9995`: insufficient funds;
- `4000 0000 0000 0341`: attaches successfully, then declines when charged.

Use a future expiry date and any three-digit CVC.

Run the automated billing tests before deployment:

```bash
npm run -w @nao/backend test
npm run lint
```

## Operations and recovery

```mermaid
flowchart LR
    Webhook["Stripe webhook"] --> Inbox[("Webhook inbox")]
    Inbox --> Worker["Webhook worker"]
    Job["Hourly billing.lifecycle"] --> Reconcile["Reconcile each mapped organization"]
    Worker --> Logs["Application logs"]
    Reconcile --> Logs
    Logs --> Monitoring["Deployment monitoring"]
```

If a Customer has multiple current cloud subscriptions, reconciliation logs an error but continues with one deterministic subscription: status priority is `active`, `trialing`, `past_due`, `paused`, `unpaid`, then `incomplete`; the already-projected subscription breaks equal-status ties, and the oldest subscription is the final tie-breaker. Cancel the unintended subscription in Stripe to stop duplicate billing.

Monitor:

- repeated webhook job failures and unprocessed inbox rows;
- invoice finalization failures;
- Customer or organization mapping conflicts;
- unknown Products;
- Stripe API error spikes;
- reconciliation drift;
- disputes and refunds;
- billing endpoint rate-limit rejections;
- failed Stripe email delivery.

Recovery must support replaying an inbox event, resending an Event from Stripe Workbench, rotating secrets, correcting a Customer mapping, and disabling enforcement without erasing state.

Security requirements:

- verify webhooks against the unmodified request body;
- keep Stripe keys server-side;
- keep Customer and Subscription IDs out of browser responses; admin invoice responses include invoice IDs, display fields, and hosted document URLs;
- use idempotency keys for mutations;
- validate Customer, Subscription, Product, organization metadata, and live mode;
- never log complete Stripe objects, webhook bodies, secrets, card data, billing addresses, or tax IDs.

## References

- [Build subscriptions with Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Coupons and promotion codes](https://docs.stripe.com/billing/subscriptions/coupons)
- [Subscription trials](https://docs.stripe.com/billing/subscriptions/trials)
- [Subscription webhooks and statuses](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Webhook security](https://docs.stripe.com/webhooks)
- [Customer Portal](https://docs.stripe.com/customer-management)
- [Billing test clocks](https://docs.stripe.com/billing/testing/test-clocks)
- [Free trial abuse prevention](https://docs.stripe.com/radar/free-trial-abuse)
- [Dispute automation](https://docs.stripe.com/disputes/responding)
- [Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
- [Secret-key best practices](https://docs.stripe.com/keys-best-practices)
