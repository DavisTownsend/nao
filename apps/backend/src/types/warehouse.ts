import { requestWarehouseCredentials } from '@nao/shared/tools';
import { z } from 'zod/v4';

export const warehouseProviderSchema = z.enum(requestWarehouseCredentials.PROVIDERS);

export const warehouseConnectionCredentialsSchema = z.record(z.string(), z.unknown());

export const warehouseCredentialsSchema = z.object({
	provider: warehouseProviderSchema,
	credentials: warehouseConnectionCredentialsSchema,
});

export const warehouseProvisioningInputSchema = warehouseCredentialsSchema.extend({
	name: z.string().trim().min(1).max(100),
});

export type WarehouseProvider = z.infer<typeof warehouseProviderSchema>;
export type WarehouseConnectionCredentials = z.infer<typeof warehouseConnectionCredentialsSchema>;
export type ProjectWarehouseCredentials = z.infer<typeof warehouseCredentialsSchema>;
export type WarehouseProvisioningInput = z.infer<typeof warehouseProvisioningInputSchema>;
