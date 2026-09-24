import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/queries/project.queries', () => ({
	getProjectByOrgAndName: vi.fn(),
}));
vi.mock('../src/utils/project-import.utils', () => ({
	createNewProject: vi.fn(),
	createTempProjectDir: vi.fn(),
}));

import { getWarehouseProvisioningJob, startWarehouseProvisioning } from '../src/services/warehouse-provisioning';

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('warehouse provisioning', () => {
	it('exposes queued job state only to its owner without leaking credentials', async () => {
		vi.useFakeTimers();

		const { jobId, status } = await startWarehouseProvisioning({
			userId: 'user-1',
			orgId: 'org-1',
			provider: 'postgres',
			credentials: {
				name: 'analytics',
				host: 'warehouse.example.com',
				port: 5432,
				database: 'analytics',
				user: 'nao',
				password: 'super-secret',
			},
		});

		expect(status).toBe('queued');
		expect(getWarehouseProvisioningJob(jobId, 'user-1')).toEqual({
			id: jobId,
			status: 'queued',
		});
		expect(getWarehouseProvisioningJob(jobId, 'another-user')).toBeNull();
		expect(JSON.stringify(getWarehouseProvisioningJob(jobId, 'user-1'))).not.toContain('super-secret');
	});
});
