import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamsConfig } from '../src/queries/project-teams-config.queries';
import { teamsService } from '../src/services/teams';

type MessageHandler = (
	thread: { isDM: boolean; post: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> },
	message: { raw: unknown; text: string },
) => Promise<void>;

const teamsHarness = vi.hoisted(() => ({
	billingAccess: vi.fn(),
	credentials: [] as Array<[string, string, string]>,
	messageHandlers: [] as MessageHandler[],
	projectRole: vi.fn(),
}));

vi.mock('@azure/identity', () => ({
	ClientSecretCredential: class {
		constructor(tenantId: string, appId: string, appPassword: string) {
			teamsHarness.credentials.push([tenantId, appId, appPassword]);
		}
	},
}));

vi.mock('@chat-adapter/state-memory', () => ({
	createMemoryState: vi.fn(() => ({})),
}));

vi.mock('@chat-adapter/teams', () => ({
	createTeamsAdapter: vi.fn(() => ({})),
}));

vi.mock('@microsoft/microsoft-graph-client', () => ({
	Client: {
		initWithMiddleware: vi.fn(() => ({
			api: vi.fn(() => ({
				select: vi.fn(() => ({
					get: vi.fn(async () => ({ mail: 'user@example.com' })),
				})),
			})),
		})),
	},
}));

vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
	TokenCredentialAuthenticationProvider: class {},
}));

vi.mock('chat', () => ({
	Card: vi.fn(),
	Chat: class {
		webhooks = { teams: vi.fn() };

		onAction(): void {}

		onNewMessage(_pattern: RegExp, handler: MessageHandler): void {
			teamsHarness.messageHandlers.push(handler);
		}

		onSubscribedMessage(): void {}
	},
}));

vi.mock('../src/components/generate-chart', () => ({
	generateChartImage: vi.fn(),
}));

vi.mock('../src/queries/chart-image', () => ({}));
vi.mock('../src/queries/chat.queries', () => ({}));
vi.mock('../src/queries/feedback.queries', () => ({}));
vi.mock('../src/queries/project.queries', () => ({
	getUserRoleInProject: teamsHarness.projectRole,
}));
vi.mock('../src/queries/user.queries', () => ({
	getUser: vi.fn(async () => ({ id: 'user-id' })),
}));
vi.mock('../src/services/agent', () => ({
	agentService: { create: vi.fn(), get: vi.fn() },
}));
vi.mock('../src/services/cloud-billing-access.service', () => ({
	assertProjectCloudBillingAccess: teamsHarness.billingAccess,
}));
vi.mock('../src/services/posthog', () => ({
	PostHogEvent: { MessageSent: 'message_sent' },
	posthog: { capture: vi.fn() },
}));
vi.mock('../src/utils/logger', () => ({
	logger: { error: vi.fn() },
}));
vi.mock('../src/utils/messaging-provider', () => ({
	createTextBlock: vi.fn((text: string) => ({ text })),
	formatMessagingError: vi.fn(() => 'billing blocked'),
}));

describe('TeamsService', () => {
	beforeEach(() => {
		teamsHarness.billingAccess.mockReset().mockRejectedValue(new Error('stop after access check'));
		teamsHarness.credentials.length = 0;
		teamsHarness.messageHandlers.length = 0;
		teamsHarness.projectRole.mockReset().mockResolvedValue('user');
	});

	it('keeps each webhook handler bound to its project configuration', async () => {
		const firstConfig: TeamsConfig = {
			projectId: 'project-a',
			appId: 'app-a',
			appPassword: 'password-a',
			tenantId: 'tenant-a',
			redirectUrl: 'https://a.example',
		};
		const secondConfig: TeamsConfig = {
			projectId: 'project-b',
			appId: 'app-b',
			appPassword: 'password-b',
			tenantId: 'tenant-b',
			redirectUrl: 'https://b.example',
		};

		teamsService.getWebhooks(firstConfig);
		const firstProjectHandler = teamsHarness.messageHandlers[0];
		teamsService.getWebhooks(secondConfig);
		const secondProjectHandler = teamsHarness.messageHandlers[1];

		const thread = {
			isDM: true,
			post: vi.fn(async () => ({})),
			subscribe: vi.fn(async () => undefined),
		};
		await firstProjectHandler(thread, {
			text: 'question',
			raw: { from: { aadObjectId: 'aad-id' }, conversation: { tenantId: 'sender-tenant' } },
		});
		await secondProjectHandler(thread, {
			text: 'question',
			raw: { from: { aadObjectId: 'aad-id' }, conversation: { tenantId: 'sender-tenant' } },
		});

		expect(teamsHarness.credentials).toEqual([
			['sender-tenant', 'app-a', 'password-a'],
			['sender-tenant', 'app-b', 'password-b'],
		]);
		expect(teamsHarness.projectRole).toHaveBeenNthCalledWith(1, 'project-a', 'user-id');
		expect(teamsHarness.projectRole).toHaveBeenNthCalledWith(2, 'project-b', 'user-id');
		expect(teamsHarness.billingAccess).toHaveBeenNthCalledWith(1, 'project-a');
		expect(teamsHarness.billingAccess).toHaveBeenNthCalledWith(2, 'project-b');
	});
});
