// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ChatError } from './chat-error';

const mocks = vi.hoisted(() => ({
	clearError: vi.fn(),
	openBilling: vi.fn(),
	resendMessage: vi.fn(async () => undefined),
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: () => ({
		data: {
			canManageBilling: true,
			organizationId: 'organization-id',
			trialAvailable: false,
		},
	}),
}));

vi.mock('@/contexts/agent.provider', () => ({
	useAgentContext: () => ({
		clearError: mocks.clearError,
		error: new Error(
			JSON.stringify({
				error: 'Cloud billing access is restricted. Ask an organization admin to update billing.',
			}),
		),
		isRunning: false,
		resendMessage: mocks.resendMessage,
	}),
	useAgentMessages: () => [{ id: 'message-id', role: 'user' }],
}));

vi.mock('@/hooks/use-copy-to-clipboard', () => ({
	useCopyToClipboard: () => ({ copy: vi.fn(), isCopied: false }),
}));

vi.mock('@/hooks/use-open-organization-billing', () => ({
	useOpenOrganizationBilling: () => mocks.openBilling,
}));

vi.mock('@/main', () => ({
	trpc: {
		billing: { getAccess: { queryOptions: () => ({ queryKey: ['billing-access'] }) } },
	},
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it('offers billing management and retry actions for a billing access error', async () => {
	render(<ChatError />);

	expect(screen.getByRole('status').textContent).toContain('A subscription is needed to continue chatting.');

	fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }));
	expect(mocks.openBilling).toHaveBeenCalledWith('organization-id');

	fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await waitFor(() => {
		expect(mocks.clearError).toHaveBeenCalledOnce();
		expect(mocks.resendMessage).toHaveBeenCalledWith({ messageId: 'message-id' });
	});
});
