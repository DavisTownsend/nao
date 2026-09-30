import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasAccess: vi.fn(),
	refreshStoryData: vi.fn(),
}));

vi.mock('../src/queries/scheduled-job.queries', () => ({ updateJobPayload: vi.fn() }));
vi.mock('../src/queries/shared-story.queries', () => ({}));
vi.mock('../src/queries/story.queries', () => ({
	getStoryById: vi.fn(async () => ({
		id: 'story-id',
		archivedAt: null,
		chatId: 'chat-id',
		projectId: 'project-id',
		userId: 'user-id',
	})),
}));
vi.mock('../src/queries/story-delivery.queries', () => ({
	getByStoryId: vi.fn(async () => ({ enabled: true })),
}));
vi.mock('../src/queries/user.queries', () => ({}));
vi.mock('../src/services/cloud-billing-access.service', () => ({
	hasProjectCloudBillingAccess: mocks.hasAccess,
}));
vi.mock('../src/services/live-story', () => ({ refreshStoryData: mocks.refreshStoryData }));
vi.mock('../src/services/notification.service', () => ({
	NotificationChannelDeliveryError: class extends Error {},
	notifyUsers: vi.fn(),
}));
vi.mock('../src/services/story-recipients', () => ({
	resolveDeliveryRecipientUserIds: vi.fn(async () => ['user-id']),
}));
vi.mock('../src/utils/keyed-lock', () => ({
	withKeyedLock: vi.fn(async (_key: string, callback: () => Promise<void>) => callback()),
}));
vi.mock('../src/utils/logger', () => ({ logger: { info: vi.fn() } }));
vi.mock('../src/utils/story-email', () => ({}));
vi.mock('../src/utils/story-links', () => ({}));

import { runScheduledStoryDelivery } from '../src/handlers/story-delivery.handler';

beforeEach(() => {
	vi.clearAllMocks();
});

it('skips scheduled delivery when the project has no billing access', async () => {
	mocks.hasAccess.mockResolvedValue(false);

	await runScheduledStoryDelivery('story-id');

	expect(mocks.hasAccess).toHaveBeenCalledWith('project-id');
	expect(mocks.refreshStoryData).not.toHaveBeenCalled();
});
