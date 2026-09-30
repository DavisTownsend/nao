import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	claimDueJobs: vi.fn(),
	deleteJob: vi.fn(),
	enqueueOnceJob: vi.fn(),
	markJobFailed: vi.fn(),
	reclaimStaleJobs: vi.fn(),
	rescheduleJob: vi.fn(),
	upsertRecurringJob: vi.fn(),
}));

vi.mock('../src/queries/scheduled-job.queries', () => mocks);

vi.mock('../src/utils/logger', () => ({
	logger: { error: vi.fn(), warn: vi.fn() },
	serializeError: (error: unknown) => ({ error: String(error) }),
}));

import { registerJob, startScheduler, stopScheduler } from '../src/services/scheduler.service';

describe('scheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-28T10:00:00.000Z'));
		vi.clearAllMocks();
		mocks.reclaimStaleJobs.mockResolvedValue(0);
	});

	afterEach(() => {
		stopScheduler();
		vi.useRealTimers();
	});

	it.each([
		{ attempts: 1, nextRunAt: new Date('2026-09-28T10:01:00.000Z') },
		{ attempts: 10, nextRunAt: null },
	])('defers unhandled jobs until attempts are exhausted ($attempts)', async ({ attempts, nextRunAt }) => {
		mocks.claimDueJobs.mockResolvedValueOnce([
			{
				id: 'billing-job',
				name: 'stripe.webhook',
				payload: { eventId: 'evt_cloud' },
				runAt: new Date(),
				cron: null,
				status: 'running',
				attempts,
				maxAttempts: 10,
			},
		]);

		startScheduler();
		await vi.advanceTimersByTimeAsync(0);

		expect(mocks.markJobFailed).toHaveBeenCalledWith(
			'billing-job',
			"No handler registered for 'stripe.webhook'",
			nextRunAt,
		);
		expect(mocks.rescheduleJob).not.toHaveBeenCalled();
	});

	it('only claims jobs with handlers registered in this process', async () => {
		registerJob('registered.job', vi.fn());
		mocks.claimDueJobs.mockResolvedValueOnce([]);

		startScheduler();
		await vi.advanceTimersByTimeAsync(0);

		expect(mocks.claimDueJobs).toHaveBeenCalledWith(new Date('2026-09-28T10:00:00.000Z'), 10, expect.any(String), [
			'registered.job',
		]);
	});
});
