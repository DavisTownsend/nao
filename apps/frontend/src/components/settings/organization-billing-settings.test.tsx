// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { OrganizationBillingSettings } from './organization-billing-settings';

import type { useOrganizationBilling } from '@/hooks/use-organization-billing';
import { getBillingStatusView, isHistoricalBillingStatus } from '@/lib/billing-display';

type BillingState = ReturnType<typeof useOrganizationBilling>;
type BillingData = NonNullable<BillingState['billing']['data']>;

const mocks = vi.hoisted(() => ({
	isCheckoutPolling: false,
	resubscribe: vi.fn(),
	status: 'trialing' as BillingData['status'],
	trialEndsAt: new Date('2026-10-08T00:00:00.000Z') as Date | null,
	trialStartedAt: new Date('2026-09-24T00:00:00.000Z') as Date | null,
}));

vi.mock('@/hooks/use-organization-billing', () => ({
	useOrganizationBilling: (): BillingState => billingState(),
}));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.isCheckoutPolling = false;
	mocks.status = 'trialing';
	mocks.trialEndsAt = new Date('2026-10-08T00:00:00.000Z');
	mocks.trialStartedAt = new Date('2026-09-24T00:00:00.000Z');
});

afterEach(cleanup);

it('offers a paid recovery Checkout when a recorded trial has no Stripe subscription', () => {
	render(<OrganizationBillingSettings search={{}} />);

	fireEvent.click(screen.getByRole('button', { name: 'Subscribe in Stripe' }));

	expect(mocks.resubscribe).toHaveBeenCalledOnce();
	expect(screen.getByText('Already used')).toBeTruthy();
});

it('uses neutral trial copy when billing history has no recorded trial', () => {
	mocks.status = 'incomplete_expired';
	mocks.trialEndsAt = null;
	mocks.trialStartedAt = null;

	render(<OrganizationBillingSettings search={{}} />);

	expect(screen.getByText('Unavailable')).toBeTruthy();
	expect(screen.queryByText('Already used')).toBeNull();
});

it('disables recovery Checkout while subscription confirmation is polling', () => {
	mocks.isCheckoutPolling = true;

	render(<OrganizationBillingSettings search={{}} />);

	const button = screen.getByRole('button', { name: 'Subscribe in Stripe' }) as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	fireEvent.click(button);
	expect(mocks.resubscribe).not.toHaveBeenCalled();
});

function billingState(): BillingState {
	const plan = {
		amount: 200_000,
		currency: 'usd',
		interval: 'month',
		intervalCount: 1,
		key: 'cloud_monthly_v2',
		name: 'nao Cloud',
		trialDays: 14,
		userLimit: null,
	} satisfies NonNullable<BillingState['plan']>;
	const data = {
		availablePlan: plan,
		billingAccessEndsAt: null,
		canManageBilling: true,
		cancellationScheduled: false,
		currentPeriodEndsAt: null,
		hasDefaultPaymentMethod: false,
		hasStripeSubscription: false,
		invoiceHistoryAvailable: false,
		paymentMethodManagementAvailable: false,
		plan: null,
		planKey: null,
		portalAvailable: false,
		resubscribeAvailable: true,
		status: mocks.status,
		trialAvailable: false,
		trialEndsAt: mocks.trialEndsAt,
		trialStartedAt: mocks.trialStartedAt,
	} satisfies BillingData;

	return {
		billing: {
			data,
			isError: false,
			isLoading: false,
		} as BillingState['billing'],
		checkoutFeedback: null,
		hasStripeSubscription: false,
		invoices: {} as BillingState['invoices'],
		isBillingSyncPending: false,
		isCheckoutConfirmationDelayed: false,
		isCheckoutPolling: mocks.isCheckoutPolling,
		isEndingAtPeriodEnd: false,
		isHistoricalSubscription: isHistoricalBillingStatus(mocks.status),
		isPaymentMethodPortalPending: false,
		isPortalPending: false,
		isResubscribePending: false,
		isResumePending: false,
		isTrialCheckoutPending: false,
		managementError: null,
		openPaymentMethodPortal: vi.fn(),
		openPortal: vi.fn(),
		openTrialCheckout: vi.fn(),
		plan,
		portalFeedback: null,
		resubscribe: mocks.resubscribe,
		resume: vi.fn(),
		retryCheckoutConfirmation: vi.fn(),
		status: mocks.status,
		statusView: getBillingStatusView(mocks.status, false, false),
		syncBilling: vi.fn(),
		trialCheckoutError: null,
	} satisfies BillingState;
}
