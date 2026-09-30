import * as billingQueries from '../queries/billing.queries';
import { logger, serializeError } from '../utils/logger';
import { reconcileCloudBillingCustomer } from './billing-reconciliation.service';

const RECONCILIATION_CONCURRENCY = 5;

export async function runCloudBillingLifecycle(): Promise<void> {
	await reconcileMappedOrganizations();
}

async function reconcileMappedOrganizations(): Promise<void> {
	const organizations = await billingQueries.listOrganizationsWithStripeCustomers();
	for (let index = 0; index < organizations.length; index += RECONCILIATION_CONCURRENCY) {
		await Promise.all(organizations.slice(index, index + RECONCILIATION_CONCURRENCY).map(reconcileOrganization));
	}
}

async function reconcileOrganization(
	organization: Awaited<ReturnType<typeof billingQueries.listOrganizationsWithStripeCustomers>>[number],
): Promise<void> {
	if (!organization.stripeCustomerId) {
		return;
	}
	try {
		await reconcileCloudBillingCustomer({
			stripeCustomerId: organization.stripeCustomerId,
			organizationIdHint: organization.id,
		});
	} catch (error) {
		logger.error(`Cloud billing reconciliation failed for organization ${organization.id}`, {
			source: 'system',
			context: serializeError(error),
		});
	}
}
