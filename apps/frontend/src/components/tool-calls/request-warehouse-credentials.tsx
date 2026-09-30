import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Database, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { buildWarehouseCredentials } from './warehouse-credentials';
import { WarehouseCredentialsForm } from './warehouse-credentials-form';
import { isSqlProvider, WAREHOUSE_PROVIDER_LABELS } from './warehouse-provider-config';
import type { ToolCallComponentProps } from '.';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-fields';
import { setActiveProjectId } from '@/lib/active-project';
import { trpc } from '@/main';

export { WarehouseCredentialsForm as SqlCredentialsForm } from './warehouse-credentials-form';

export function RequestWarehouseCredentialsToolCall({
	toolPart,
}: ToolCallComponentProps<'request_warehouse_credentials'>) {
	const provider = toolPart.input?.provider;
	const [open, setOpen] = useState(false);
	const [jobId, setJobId] = useState<string | null>(null);
	const startProvisioning = useMutation(
		trpc.onboarding.startWarehouseProvisioning.mutationOptions({
			onSuccess: ({ jobId: nextJobId }) => setJobId(nextJobId),
		}),
	);

	if (!provider) {
		return null;
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<div className='animate-fade-in-up flex flex-col items-start justify-between gap-4 rounded-2xl border-2 border-emerald-500/60 bg-gradient-to-r from-emerald-50 via-emerald-50 to-background p-5 shadow-lg shadow-emerald-500/10 ring-4 ring-emerald-500/10 sm:flex-row sm:items-center dark:from-emerald-950 dark:via-emerald-950 dark:to-background'>
				<div className='flex min-w-0 items-center gap-3'>
					<div className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm'>
						<Database className='size-5' />
					</div>
					<div className='min-w-0'>
						<div className='mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300'>
							Action required
						</div>
						<div className='font-medium'>{WAREHOUSE_PROVIDER_LABELS[provider]} credentials required</div>
						<p className='text-xs text-muted-foreground'>
							Credentials are submitted securely and are never shared with the agent.
						</p>
					</div>
				</div>
				<DialogTrigger asChild>
					<Button className='w-full shrink-0 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 sm:w-auto dark:bg-emerald-600 dark:hover:bg-emerald-500'>
						Enter credentials
					</Button>
				</DialogTrigger>
			</div>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Connect {WAREHOUSE_PROVIDER_LABELS[provider]}</DialogTitle>
					<DialogDescription>
						Enter your connection details securely. They will not be included in the chat.
					</DialogDescription>
				</DialogHeader>
				{jobId ? (
					<WarehouseProvisioningProgress
						jobId={jobId}
						onRetry={() => {
							setJobId(null);
							startProvisioning.reset();
						}}
					/>
				) : isSqlProvider(provider) ? (
					<WarehouseCredentialsForm
						provider={provider}
						onSubmit={async (values) => {
							await startProvisioning.mutateAsync({
								name: values.name,
								provider,
								credentials: buildWarehouseCredentials(provider, values),
							});
						}}
						onCancel={() => setOpen(false)}
						isPending={startProvisioning.isPending}
						error={startProvisioning.error}
					/>
				) : (
					<div className='rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground'>
						{WAREHOUSE_PROVIDER_LABELS[provider]} connection setup is not available yet.
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function WarehouseProvisioningProgress({ jobId, onRetry }: { jobId: string; onRetry: () => void }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const activatedProjectId = useRef<string | null>(null);
	const job = useQuery({
		...trpc.onboarding.getWarehouseProvisioningStatus.queryOptions({ jobId }),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === 'ready' || status === 'failed' ? false : 1000;
		},
	});

	useEffect(() => {
		const projectId = job.data?.status === 'ready' ? job.data.projectId : undefined;
		if (!projectId || activatedProjectId.current === projectId) {
			return;
		}

		activatedProjectId.current = projectId;
		setActiveProjectId(projectId);
		void Promise.all([
			queryClient.invalidateQueries({ queryKey: trpc.project.getCurrent.queryKey() }),
			queryClient.invalidateQueries({ queryKey: trpc.organization.getProjects.queryKey() }),
		]).then(() => navigate({ to: '/' }));
	}, [job.data, navigate, queryClient]);

	if (job.isError) {
		return <FormError error={job.error.message} />;
	}

	if (job.data?.status === 'failed') {
		return (
			<div className='flex flex-col gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4'>
				<FormError error={job.data.error ?? 'Warehouse setup failed.'} />
				<Button variant='outline' size='sm' onClick={onRetry}>
					Try again
				</Button>
			</div>
		);
	}

	const statusLabel = {
		queued: 'Preparing warehouse setup…',
		initializing: 'Initializing your nao project…',
		syncing: 'Syncing warehouse metadata…',
		registering: 'Registering your project…',
		ready: 'Connection ready. Opening your project…',
	}[job.data?.status ?? 'queued'];

	return (
		<div className='flex items-center gap-3 rounded-lg border bg-muted/30 p-4'>
			<Loader2 className='size-4 animate-spin text-primary' />
			<p className='text-sm'>{statusLabel}</p>
		</div>
	);
}
