// @vitest-environment jsdom

import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useCallback } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsStoryRefreshing } from './use-is-story-refreshing';
import { useRetryStaleStoryRefresh } from './use-retry-stale-story-refresh';

const REFRESH_MUTATION_KEY = [['story', 'refreshData']];

describe('useIsStoryRefreshing', () => {
	afterEach(() => {
		cleanup();
	});

	it('stops refreshing when a refresh retried on mount fails under StrictMode', async () => {
		let failRefresh: (error: Error) => void = () => {};
		const refreshRequest = new Promise<void>((_resolve, reject) => {
			failRefresh = reject;
		});

		render(
			<StrictMode>
				<QueryClientProvider client={new QueryClient()}>
					<StaleStory refreshRequest={refreshRequest} />
				</QueryClientProvider>
			</StrictMode>,
		);

		expect(await screen.findByText('refreshing')).toBeTruthy();
		await act(async () => {
			failRefresh(new Error('No output generated.'));
		});
		expect(await screen.findByText('idle')).toBeTruthy();
	});

	it('ignores refreshes of other stories', async () => {
		render(
			<QueryClientProvider client={new QueryClient()}>
				<StaleStory refreshRequest={new Promise<void>(() => {})} watchedStoryId='story-2' />
			</QueryClientProvider>,
		);

		expect(await screen.findByText('idle')).toBeTruthy();
	});
});

describe('useRetryStaleStoryRefresh', () => {
	afterEach(() => {
		cleanup();
	});

	it('refreshes once per stretch of needing a refresh', () => {
		const refresh = vi.fn();
		const { rerender } = render(<RetryingStory needsRefresh refresh={refresh} />);
		rerender(<RetryingStory needsRefresh refresh={refresh} />);
		expect(refresh).toHaveBeenCalledTimes(1);

		rerender(<RetryingStory needsRefresh={false} refresh={refresh} />);
		rerender(<RetryingStory needsRefresh refresh={refresh} />);
		expect(refresh).toHaveBeenCalledTimes(2);
	});
});

function RetryingStory({ needsRefresh, refresh }: { needsRefresh: boolean; refresh: () => void }) {
	useRetryStaleStoryRefresh({ storyKey: 'story-1', needsRefresh, refresh });
	return null;
}

function StaleStory({
	refreshRequest,
	watchedStoryId = 'story-1',
}: {
	refreshRequest: Promise<void>;
	watchedStoryId?: string;
}) {
	const { mutate } = useMutation({
		mutationKey: REFRESH_MUTATION_KEY,
		mutationFn: (_input: { storyId: string }) => refreshRequest,
	});
	const refresh = useCallback(() => {
		mutate({ storyId: 'story-1' });
	}, [mutate]);
	useRetryStaleStoryRefresh({ storyKey: 'story-1', needsRefresh: true, refresh });
	const isRefreshing = useIsStoryRefreshing(REFRESH_MUTATION_KEY, { storyId: watchedStoryId });

	return <span>{isRefreshing ? 'refreshing' : 'idle'}</span>;
}
