import { useEffect, useRef } from 'react';

interface UseRetryStaleStoryRefreshParams {
	storyKey: string;
	needsRefresh: boolean;
	refresh: () => void;
}

/**
 * The server serves the stored data of a live story that was never cached or whose last refresh failed,
 * instead of refreshing inline, so the viewer runs the refresh in the background. It fires once each time
 * the story starts needing a refresh, never in a loop when that refresh fails again.
 */
export function useRetryStaleStoryRefresh({ storyKey, needsRefresh, refresh }: UseRetryStaleStoryRefreshParams) {
	const refreshedStoryKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!needsRefresh) {
			refreshedStoryKeyRef.current = null;
			return;
		}
		if (refreshedStoryKeyRef.current === storyKey) {
			return;
		}
		refreshedStoryKeyRef.current = storyKey;
		refresh();
	}, [needsRefresh, storyKey, refresh]);
}
