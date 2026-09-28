import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Database, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { requestWarehouseCredentials } from '@nao/shared/tools';
import type { ToolCallComponentProps } from '.';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { FormError, PasswordField, TextField } from '@/components/ui/form-fields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setActiveProjectId } from '@/lib/active-project';
import { trpc } from '@/main';

const PROVIDER_LABELS: Record<requestWarehouseCredentials.Provider, string> = {
	athena: 'Amazon Athena',
	bigquery: 'BigQuery',
	clickhouse: 'ClickHouse',
	databricks: 'Databricks',
	duckdb: 'DuckDB',
	fabric: 'Microsoft Fabric',
	motherduck: 'MotherDuck',
	mssql: 'Microsoft SQL Server',
	mysql: 'MySQL',
	postgres: 'Postgres',
	redshift: 'Amazon Redshift',
	snowflake: 'Snowflake',
	starrocks: 'StarRocks',
	trino: 'Trino',
};

type SqlProvider = 'postgres' | 'mysql' | 'clickhouse';

interface SqlCredentials {
	name: string;
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	schemaName: string;
	protocol: 'http' | 'native';
	secure: boolean;
}

interface SqlCredentialsFormProps {
	provider: SqlProvider;
	onSubmit: (values: SqlCredentials) => Promise<void>;
	onCancel: () => void;
	isPending: boolean;
	error: { message: string } | null;
}

const SQL_PROVIDER_SETTINGS = {
	postgres: {
		label: 'Postgres',
		defaultName: 'postgres-prod',
		defaultPort: 5432,
		schemaHint: '(optional, uses public by default)',
		showSchema: true,
	},
	mysql: {
		label: 'MySQL',
		defaultName: 'mysql-prod',
		defaultPort: 3306,
		schemaHint: '(optional)',
		showSchema: true,
	},
	clickhouse: {
		label: 'ClickHouse',
		defaultName: 'clickhouse-prod',
		defaultPort: 8123,
		schemaHint: '',
		showSchema: false,
	},
} satisfies Record<
	SqlProvider,
	{
		label: string;
		defaultName: string;
		defaultPort: number;
		schemaHint: string;
		showSchema: boolean;
	}
>;

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

	const sqlProvider: SqlProvider | null =
		provider === 'postgres' || provider === 'mysql' || provider === 'clickhouse' ? provider : null;

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
						<div className='font-medium'>{PROVIDER_LABELS[provider]} credentials required</div>
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
					<DialogTitle>Connect {PROVIDER_LABELS[provider]}</DialogTitle>
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
				) : sqlProvider ? (
					<SqlCredentialsForm
						provider={sqlProvider}
						onSubmit={async (values) => {
							await startProvisioning.mutateAsync({
								name: values.name,
								provider: sqlProvider,
								credentials: {
									host: values.host,
									port: values.port,
									database: values.database,
									user: values.user,
									password: values.password,
									...(sqlProvider === 'clickhouse'
										? {
												protocol: values.protocol,
												secure: values.secure,
											}
										: {
												schemaName: values.schemaName || undefined,
											}),
								},
							});
						}}
						onCancel={() => setOpen(false)}
						isPending={startProvisioning.isPending}
						error={startProvisioning.error}
					/>
				) : (
					<div className='rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground'>
						{PROVIDER_LABELS[provider]} connection setup is not available yet.
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

export function SqlCredentialsForm({ provider, onSubmit, onCancel, isPending, error }: SqlCredentialsFormProps) {
	const settings = SQL_PROVIDER_SETTINGS[provider];
	const form = useForm({
		defaultValues: {
			name: settings.defaultName,
			host: 'localhost',
			port: settings.defaultPort,
			database: provider === 'clickhouse' ? 'default' : '',
			user: provider === 'clickhouse' ? 'default' : '',
			password: '',
			schemaName: '',
			protocol: 'http' as SqlCredentials['protocol'],
			secure: false,
		},
		onSubmit: async ({ value }) => {
			await onSubmit({
				...value,
				port: Number(value.port),
			});
		},
	});

	return (
		<div className='flex flex-col gap-3 rounded-lg border border-primary/50 bg-muted/30 p-4'>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className='flex flex-col gap-3'
			>
				<div className='flex items-center justify-between'>
					<span className='text-sm font-medium text-foreground'>{settings.label} connection</span>
					<Button variant='ghost' size='icon-sm' type='button' onClick={onCancel}>
						<X className='size-4' />
					</Button>
				</div>
				<TextField
					form={form}
					name='name'
					label='Connection Name'
					placeholder={settings.defaultName}
					required={true}
				/>
				<TextField form={form} name='host' label='Host' placeholder='localhost' required={true} />
				<TextField
					form={form}
					name='port'
					label='Port'
					type='number'
					placeholder={String(settings.defaultPort)}
					required={true}
				/>
				<TextField
					form={form}
					name='database'
					label='Database Name'
					placeholder='Enter your database name'
					required={true}
				/>
				<TextField form={form} name='user' label='Username' placeholder='Enter your username' required={true} />
				<PasswordField
					form={form}
					name='password'
					label='Password'
					placeholder='Enter your password'
					required={true}
				/>
				{settings.showSchema && (
					<TextField
						form={form}
						name='schemaName'
						label='Default Schema'
						hint={settings.schemaHint}
						placeholder='public'
					/>
				)}
				{provider === 'clickhouse' && (
					<>
						<form.Field name='protocol'>
							{(field) => (
								<div className='grid gap-2'>
									<label className='text-sm font-medium'>Protocol</label>
									<Select
										value={field.state.value}
										onValueChange={(value) => field.handleChange(value as 'http' | 'native')}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='http'>HTTP</SelectItem>
											<SelectItem value='native'>Native TCP</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>

						<form.Field name='secure'>
							{(field) => (
								<label className='flex items-center gap-2 text-sm font-medium'>
									<Checkbox
										checked={field.state.value}
										onCheckedChange={(checked) => field.handleChange(checked === true)}
									/>
									Use secure connection
								</label>
							)}
						</form.Field>
					</>
				)}
				{error && <FormError error={error.message} />}
				<div className='flex justify-end gap-2 pt-2'>
					<Button variant='ghost' size='sm' type='button' onClick={onCancel}>
						Cancel
					</Button>
					<form.Subscribe selector={(state: { canSubmit: boolean }) => state.canSubmit}>
						{(canSubmit: boolean) => (
							<Button size='sm' type='submit' disabled={!canSubmit || isPending}>
								{isPending ? 'Connecting…' : 'Connect'}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</form>
		</div>
	);
}
