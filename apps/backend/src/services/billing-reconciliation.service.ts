import type Stripe from 'stripe';

import * as billingQueries from '../queries/billing.queries';
import * as organizationQueries from '../queries/organization.queries';
import { isTerminalBillingStatus } from '../types/billing';
import { logger } from '../utils/logger';
import { cloudSubscriptionProjection, hasCloudDefaultPaymentMethod, listCloudSubscriptions } from './stripe.service';

const CURRENT_STATUS_PRIORITY = ['active', 'trialing', 'past_due', 'paused', 'unpaid', 'incomplete'];

interface CloudBillingReconciliationResult {
	applied: boolean;
	ignored: boolean;
}

export async function reconcileCloudBillingCustomer(input: {
	stripeCustomerId: string;
	organizationIdHint?: string;
}): Promise<CloudBillingReconciliationResult> {
	const organization = await resolveOrganization(input.stripeCustomerId, input.organizationIdHint);
	if (!organization) {
		return { applied: false, ignored: true };
	}
	const claim = await billingQueries.claimBillingSync(organization.id, input.stripeCustomerId);
	const subscriptions = await listCloudSubscriptions(input.stripeCustomerId);
	const subscription = selectCloudSubscription(subscriptions, claim.organization.stripeSubscriptionId);
	logDuplicateCurrentSubscriptions(input.stripeCustomerId, subscriptions, subscription);

	if (!subscription) {
		return {
			applied: await billingQueries.updatePaymentMethodProjection(
				organization.id,
				claim.token,
				input.stripeCustomerId,
				await hasCloudDefaultPaymentMethod(input.stripeCustomerId),
			),
			ignored: false,
		};
	}

	assertSubscriptionOwnership(subscription, input.stripeCustomerId, organization.id);
	const projection = await cloudSubscriptionProjection(subscription);
	return {
		applied: await billingQueries.updateSubscriptionProjection(organization.id, claim.token, {
			...projection,
			trialStartedAt: projection.trialStartedAt ?? claim.organization.trialStartedAt,
			trialEndsAt: projection.trialEndsAt ?? claim.organization.trialEndsAt,
		}),
		ignored: false,
	};
}

async function resolveOrganization(stripeCustomerId: string, organizationIdHint?: string) {
	const attached = await billingQueries.getOrganizationByStripeCustomerId(stripeCustomerId);
	if (attached) {
		return attached;
	}

	const subscriptions = await listCloudSubscriptions(stripeCustomerId);
	const liveOrganizationId = selectCloudSubscription(subscriptions)?.metadata.nao_org_id;
	const organizationId = liveOrganizationId ?? organizationIdHint;
	if (!organizationId) {
		return null;
	}

	const organization = await organizationQueries.getOrganizationById(organizationId);
	if (!organization) {
		throw new Error(`Organization "${organizationId}" was not found`);
	}
	return billingQueries.attachStripeCustomer(organization.id, stripeCustomerId);
}

function selectCloudSubscription(
	subscriptions: Stripe.Subscription[],
	preferredSubscriptionId?: string | null,
): Stripe.Subscription | null {
	const current = subscriptions.filter((subscription) => !isTerminalBillingStatus(subscription.status));
	if (current.length > 0) {
		return [...current].sort((left, right) => {
			const statusDifference = currentStatusPriority(left.status) - currentStatusPriority(right.status);
			if (statusDifference !== 0) {
				return statusDifference;
			}
			if (left.id === preferredSubscriptionId) {
				return -1;
			}
			if (right.id === preferredSubscriptionId) {
				return 1;
			}
			return left.created - right.created || left.id.localeCompare(right.id);
		})[0];
	}

	return [...subscriptions].sort((left, right) => right.created - left.created)[0] ?? null;
}

function currentStatusPriority(status: string): number {
	const priority = CURRENT_STATUS_PRIORITY.indexOf(status);
	return priority === -1 ? CURRENT_STATUS_PRIORITY.length : priority;
}

function logDuplicateCurrentSubscriptions(
	stripeCustomerId: string,
	subscriptions: Stripe.Subscription[],
	selectedSubscription: Stripe.Subscription | null,
): void {
	const currentIds = subscriptions
		.filter((subscription) => !isTerminalBillingStatus(subscription.status))
		.map((subscription) => subscription.id);
	if (currentIds.length < 2 || !selectedSubscription) {
		return;
	}
	logger.error(`Stripe Customer "${stripeCustomerId}" has multiple current cloud subscriptions`, {
		source: 'system',
		context: { currentSubscriptionIds: currentIds, selectedSubscriptionId: selectedSubscription.id },
	});
}

function assertSubscriptionOwnership(
	subscription: Stripe.Subscription,
	stripeCustomerId: string,
	organizationId: string,
): void {
	const subscriptionCustomerId =
		typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
	if (subscriptionCustomerId !== stripeCustomerId) {
		throw new Error(`Stripe Subscription "${subscription.id}" has an unexpected Customer`);
	}
	const metadataOrganizationId = subscription.metadata.nao_org_id;
	if (metadataOrganizationId && metadataOrganizationId !== organizationId) {
		throw new Error(`Stripe Subscription "${subscription.id}" organization metadata does not match`);
	}
}
