import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Clock3, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { setActiveOrganizationId } from '@/lib/active-organization';
import { trpc } from '@/main';

const TRIAL_WARNING_MS = 3 * 24 * 60 * 60 * 1000;

export function CloudBillingAccessBanner() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const config = useQuery(trpc.system.getPublicConfig.queryOptions());
	const access = useQuery({
		...trpc.billing.getAccess.queryOptions(),
		enabled: config.data?.cloudBillingEnabled === true,
		refetchInterval: 60_000,
	});
	const notice = getAccessNotice(access.data);

	if (!notice) {
		return null;
	}

	const openBilling = async () => {
		setActiveOrganizationId(access.data!.organizationId);
		await queryClient.invalidateQueries();
		await navigate({
			to: '/settings/organization/billing',
			search: { checkout: undefined, portal: undefined },
		});
	};

	return (
		<div
			className={
				notice.restricted
					? 'flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm'
					: 'flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm'
			}
			role={notice.restricted ? 'alert' : 'status'}
			aria-live='polite'
		>
			{notice.restricted ? (
				<TriangleAlert className='size-4 shrink-0 text-destructive' aria-hidden />
			) : (
				<Clock3 className='size-4 shrink-0 text-amber-600 dark:text-amber-400' aria-hidden />
			)}
			<div className='min-w-0 flex-1'>
				<span className='font-medium text-foreground'>{notice.title}</span>{' '}
				<span className='text-muted-foreground'>{notice.description}</span>
			</div>
			{access.data?.canManageBilling ? (
				<Button size='sm' variant='secondary' onClick={() => void openBilling()}>
					Manage billing
				</Button>
			) : (
				<span className='text-xs text-muted-foreground'>Ask an organization admin to manage billing.</span>
			)}
		</div>
	);
}

function getAccessNotice(
	access:
		| {
				organizationId: string;
				hasAccess: boolean;
				status: string | null;
				trialEndsAt: Date | null;
				trialAvailable: boolean;
				canManageBilling: boolean;
				requiresBillingAction: boolean;
		  }
		| undefined,
	now = Date.now(),
) {
	if (!access) {
		return null;
	}
	if (access.trialAvailable) {
		return {
			restricted: true,
			title: "Your organization's free trial has not started.",
			description: access.canManageBilling
				? 'Start it when your team is ready.'
				: 'An organization admin can start it when your team is ready.',
		};
	}
	if (!access.hasAccess) {
		return {
			restricted: true,
			title: 'Your organization has limited access.',
			description: 'Existing data remains available, but billing must be updated to run agents or make changes.',
		};
	}

	const remainingMs = access.trialEndsAt ? access.trialEndsAt.getTime() - now : 0;
	if (access.status !== 'trialing' || remainingMs <= 0 || remainingMs > TRIAL_WARNING_MS) {
		return null;
	}

	const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
	return {
		restricted: false,
		title: `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} left in your free trial.`,
		description: access.requiresBillingAction
			? 'Add billing details to keep full access after the trial.'
			: 'Your paid subscription will begin when the trial ends.',
	};
}
