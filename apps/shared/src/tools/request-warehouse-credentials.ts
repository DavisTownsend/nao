import z from 'zod/v3';

export const ProviderSchema = z.enum([
	'athena',
	'bigquery',
	'clickhouse',
	'databricks',
	'duckdb',
	'fabric',
	'motherduck',
	'mssql',
	'mysql',
	'postgres',
	'redshift',
	'snowflake',
	'starrocks',
	'trino',
]);

export const InputSchema = z.object({
	provider: ProviderSchema.describe('The lowercase identifier of the warehouse provider selected by the user.'),
});

export const OutputSchema = InputSchema.extend({
	_version: z.literal('1').optional(),
	status: z.literal('credentials-required'),
});

export type Provider = z.infer<typeof ProviderSchema>;
export type Input = z.infer<typeof InputSchema>;
export type Output = z.infer<typeof OutputSchema>;
