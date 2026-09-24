import { TRPCError } from '@trpc/server';
import { z } from 'zod/v4';

import * as organizationQueries from '../queries/organization.queries';
import { getWarehouseProvisioningJob, startWarehouseProvisioning } from '../services/warehouse-provisioning';
import { protectedProcedure, router } from './trpc';

const postgresCredentialsSchema = z.object({
	provider: z.literal('postgres'),
	name: z.string().trim().min(1).max(100),
	host: z.string().trim().min(1).max(255),
	port: z.number().int().min(1).max(65535),
	database: z.string().trim().min(1).max(255),
	user: z.string().trim().min(1).max(255),
	password: z.string().min(1).max(4096),
	schemaName: z.string().trim().max(255).optional(),
});

export const onboardingRoutes = router({
	startWarehouseProvisioning: protectedProcedure
		.input(postgresCredentialsSchema)
		.output(
			z.object({
				jobId: z.string(),
				status: z.literal('queued'),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const membership = await organizationQueries.getUserOrgMembership(ctx.user.id);

			if (!membership) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'You are not a member of an organization',
				});
			}

			return startWarehouseProvisioning({
				userId: ctx.user.id,
				orgId: membership.orgId,
				provider: input.provider,
				credentials: {
					name: input.name,
					host: input.host,
					port: input.port,
					database: input.database,
					user: input.user,
					password: input.password,
					schemaName: input.schemaName || undefined,
				},
			});
		}),

	getWarehouseProvisioningStatus: protectedProcedure.input(z.object({ jobId: z.uuid() })).query(({ ctx, input }) => {
		const job = getWarehouseProvisioningJob(input.jobId, ctx.user.id);
		if (!job) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Warehouse setup job not found',
			});
		}
		return job;
	}),
});
