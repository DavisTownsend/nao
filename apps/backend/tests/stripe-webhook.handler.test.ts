import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findSubscription: vi.fn(),
	getCheckoutSubscription: vi.fn(),
	getEvent: vi.fn(),
	getInboxEvent: vi.fn(),
	markFailed: vi.fn(),
	markProcessed: vi.fn(),
	reconcileCustomer: vi.fn(),
}));

vi.mock('../src/queries/billing.queries', () => ({
	getStripeWebhookEvent: mocks.getInboxEvent,
	markStripeWebhookEventFailed: mocks.markFailed,
	markStripeWebhookEventProcessed: mocks.markProcessed,
}));

vi.mock('../src/services/billing-reconciliation.service', () => ({
	reconcileCloudBillingCustomer: mocks.reconcileCustomer,
}));

vi.mock('../src/services/stripe.service', () => ({
	findCloudSubscription: mocks.findSubscription,
	getCloudCheckoutSubscription: mocks.getCheckoutSubscription,
	getStripeEvent: mocks.getEvent,
}));

import { stripeWebhookProcessHandler } from '../src/handlers/stripe-webhook.handler';

describe('stripeWebhookProcessHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getInboxEvent.mockResolvedValue({
			id: 'evt_123',
			processedAt: null,
		});
		mocks.reconcileCustomer.mockResolvedValue({
			applied: true,
			ignored: false,
		});
	});

	it('does not process an inbox event twice', async () => {
		mocks.getInboxEvent.mockResolvedValue({ id: 'evt_123', processedAt: new Date() });

		await stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never);

		expect(mocks.getEvent).not.toHaveBeenCalled();
		expect(mocks.reconcileCustomer).not.toHaveBeenCalled();
	});

	it('reconciles subscription state after Checkout completion', async () => {
		const subscription = {
			id: 'sub_cloud',
			customer: 'cus_cloud',
			metadata: { nao_org_id: 'org-id' },
			status: 'trialing',
		};
		mocks.getEvent.mockResolvedValue({
			type: 'checkout.session.completed',
			data: { object: { id: 'cs_cloud', mode: 'subscription', metadata: { nao_plan_key: 'cloud_monthly_v2' } } },
		});
		mocks.getCheckoutSubscription.mockResolvedValue({
			session: {
				id: 'cs_cloud',
				client_reference_id: 'org-id',
				customer: 'cus_cloud',
				metadata: { nao_org_id: 'org-id' },
			},
			subscription,
		});
		await stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never);

		expect(mocks.reconcileCustomer).toHaveBeenCalledWith({
			stripeCustomerId: 'cus_cloud',
			organizationIdHint: 'org-id',
		});
		expect(mocks.markProcessed).toHaveBeenCalledWith('evt_123');
	});

	it.each([
		['payment-mode', { id: 'cs_topup', mode: 'payment', metadata: {} }],
		['non-cloud plan', { id: 'cs_other', mode: 'subscription', metadata: { nao_plan_key: 'other_plan' } }],
	])('acknowledges Checkout sessions for a %s', async (_kind, session) => {
		mocks.getEvent.mockResolvedValue({
			type: 'checkout.session.completed',
			data: { object: session },
		});

		await stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never);

		expect(mocks.getCheckoutSubscription).not.toHaveBeenCalled();
		expect(mocks.markProcessed).toHaveBeenCalledWith('evt_123');
	});

	it('reconciles subscription events by Customer', async () => {
		mocks.findSubscription.mockResolvedValue({
			id: 'sub_cloud',
			customer: 'cus_cloud',
			metadata: { nao_org_id: 'org-id' },
		});
		mocks.getEvent.mockResolvedValue({
			type: 'customer.subscription.updated',
			data: {
				object: {
					id: 'sub_cloud',
				},
			},
		});

		await stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never);

		expect(mocks.reconcileCustomer).toHaveBeenCalledWith({
			stripeCustomerId: 'cus_cloud',
			organizationIdHint: 'org-id',
		});
		expect(mocks.markProcessed).toHaveBeenCalledWith('evt_123');
	});

	it.each([
		[
			'subscription',
			{
				type: 'customer.subscription.updated',
				data: {
					object: {
						id: 'sub_unrelated',
						customer: 'cus_unrelated',
						metadata: { nao_org_id: 'org-id' },
					},
				},
			},
		],
		[
			'invoice',
			{
				type: 'invoice.paid',
				data: {
					object: {
						id: 'in_unrelated',
						customer: 'cus_unrelated',
						parent: {
							subscription_details: {
								subscription: 'sub_unrelated',
								metadata: { nao_org_id: 'org-id' },
							},
						},
					},
				},
			},
		],
	])('acknowledges an unrelated %s event without trusting its organization metadata', async (_kind, event) => {
		mocks.findSubscription.mockResolvedValue(null);
		mocks.getEvent.mockResolvedValue(event);

		await stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never);

		expect(mocks.reconcileCustomer).not.toHaveBeenCalled();
		expect(mocks.markProcessed).toHaveBeenCalledWith('evt_123');
	});

	it('reconciles invoice events without a Customer from the validated subscription', async () => {
		mocks.findSubscription.mockResolvedValue({
			id: 'sub_cloud',
			customer: 'cus_cloud',
			metadata: { nao_org_id: 'org-id' },
		});
		mocks.getEvent.mockResolvedValue({
			type: 'invoice.paid',
			data: {
				object: {
					id: 'in_cloud',
					parent: {
						subscription_details: {
							subscription: 'sub_cloud',
							metadata: { nao_org_id: 'org-spoofed' },
						},
					},
				},
			},
		});

		await stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never);

		expect(mocks.reconcileCustomer).toHaveBeenCalledWith({
			stripeCustomerId: 'cus_cloud',
			organizationIdHint: 'org-id',
		});
		expect(mocks.markProcessed).toHaveBeenCalledWith('evt_123');
	});

	it('projects the latest Customer payment-method state', async () => {
		mocks.getEvent.mockResolvedValue({
			type: 'customer.updated',
			data: { object: { id: 'cus_cloud' } },
		});
		await stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never);

		expect(mocks.reconcileCustomer).toHaveBeenCalledWith({ stripeCustomerId: 'cus_cloud' });
		expect(mocks.markProcessed).toHaveBeenCalledWith('evt_123');
	});

	it('marks an event failed and rethrows when reconciliation fails', async () => {
		const error = new Error('reconciliation failed');
		mocks.getEvent.mockResolvedValue({
			type: 'customer.updated',
			data: { object: { id: 'cus_cloud' } },
		});
		mocks.reconcileCustomer.mockRejectedValue(error);

		await expect(stripeWebhookProcessHandler({ eventId: 'evt_123' }, {} as never)).rejects.toBe(error);

		expect(mocks.markFailed).toHaveBeenCalledWith('evt_123', 'reconciliation failed');
		expect(mocks.markProcessed).not.toHaveBeenCalled();
	});
});
