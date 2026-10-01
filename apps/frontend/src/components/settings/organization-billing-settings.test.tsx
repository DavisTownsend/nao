// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { OrganizationBillingSettings } from './organization-billing-settings';

const mocks = vi.hoisted(() => ({
	resubscribe: vi.fn(),
}));

vi.mock('@/hooks/use-organization-billing', () => ({
	useOrganizationBilling: () => billingState(),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(cleanup);

it('offers a paid recovery Checkout when a recorded trial has no Stripe subscription', () => {
	render(<OrganizationBillingSettings search={{}} />);

	fireEvent.click(screen.getByRole('button', { name: 'Subscribe in Stripe' }));

	expect(mocks.resubscribe).toHaveBeenCalledOnce();
	expect(screen.getByText('Already used')).toBeTruthy();
});

function billingState() {
	return {
		billing: {
			data: {
				billingAccessEndsAt: null,
				canManageBilling: true,
				cancellationScheduled: false,
				currentPeriodEndsAt: null,
				hasDefaultPaymentMethod: false,
				hasStripeSubscription: false,
				invoiceHistoryAvailable: false,
				paymentMethodManagementAvailable: false,
				plan: null,
				portalAvailable: false,
				resubscribeAvailable: true,
				status: 'trialing',
				trialAvailable: false,
				trialEndsAt: null,
			},
			isError: false,
			isLoading: false,
		},
		checkoutFeedback: null,
		hasStripeSubscription: false,
		invoices: {},
		isBillingSyncPending: false,
		isCheckoutConfirmationDelayed: false,
		isCheckoutPolling: false,
		isEndingAtPeriodEnd: false,
		isHistoricalSubscription: false,
		isPaymentMethodPortalPending: false,
		isPortalPending: false,
		isResubscribePending: false,
		isResumePending: false,
		isTrialCheckoutPending: false,
		managementError: null,
		openPaymentMethodPortal: vi.fn(),
		openPortal: vi.fn(),
		openTrialCheckout: vi.fn(),
		plan: {
			amount: 200_000,
			currency: 'usd',
			interval: 'month',
			intervalCount: 1,
			key: 'cloud_monthly_v2',
			name: 'nao Cloud',
			trialDays: 14,
			userLimit: null,
		},
		portalFeedback: null,
		resubscribe: mocks.resubscribe,
		resume: vi.fn(),
		retryCheckoutConfirmation: vi.fn(),
		status: 'trialing',
		statusView: {
			description: 'Trial billing needs recovery.',
			label: 'Trialing',
			variant: 'secondary',
		},
		syncBilling: vi.fn(),
		trialCheckoutError: null,
	};
}
