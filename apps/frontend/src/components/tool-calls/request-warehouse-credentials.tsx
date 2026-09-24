import { useForm } from '@tanstack/react-form';
import { Database, X } from 'lucide-react';
import type { requestWarehouseCredentials } from '@nao/shared/tools';

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
import { FormError, PasswordField, TextField } from '@/components/ui/form-fields';

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

interface PostgresCredentials {
	name: string;
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	schemaName: string;
}

interface PostgresCredentialsFormProps {
	onSubmit: (values: PostgresCredentials) => Promise<void>;
	onCancel: () => void;
	isPending: boolean;
	error: { message: string } | null;
}

export function RequestWarehouseCredentialsToolCall({
	toolPart,
}: ToolCallComponentProps<'request_warehouse_credentials'>) {
	const provider = toolPart.input?.provider;

	if (!provider) {
		return null;
	}

	return (
		<Dialog>
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
				<div className='rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground'>
					The secure Postgres connection endpoint must be added before this form can be submitted.
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function PostgresCredentialsForm({ onSubmit, onCancel, isPending, error }: PostgresCredentialsFormProps) {
	const form = useForm({
		defaultValues: {
			name: 'postgres-prod',
			host: 'localhost',
			port: '5432',
			database: '',
			user: '',
			password: '',
			schemaName: '',
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
					<span className='text-sm font-medium text-foreground'>Postgres connection</span>
					<Button variant='ghost' size='icon-sm' type='button' onClick={onCancel}>
						<X className='size-4' />
					</Button>
				</div>
				<TextField
					form={form}
					name='name'
					label='Connection Name'
					placeholder='postgres-prod'
					required={true}
				/>
				<TextField form={form} name='host' label='Host' placeholder='localhost' required={true} />
				<TextField form={form} name='port' label='Port' type='number' placeholder='5432' required={true} />
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
				<TextField
					form={form}
					name='schemaName'
					label='Default Schema'
					hint='(optional, uses public by default)'
					placeholder='public'
				/>
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
