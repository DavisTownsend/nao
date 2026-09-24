import { createFileRoute, Outlet } from '@tanstack/react-router';

import { FreeMessagesExhaustedPopup } from '@/components/welcome-reward-popup';
import { AgentProvider } from '@/contexts/agent.provider';
import { SetChatInputCallbackProvider } from '@/contexts/set-chat-input-callback';
import { StoryBeforeAgentSendProvider } from '@/contexts/story-before-agent-send';

export const Route = createFileRoute('/_sidebar-layout/_chat-layout')({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<SetChatInputCallbackProvider>
			<StoryBeforeAgentSendProvider>
				<AgentProvider>
					<FreeMessagesExhaustedPopup />
					<Outlet />
				</AgentProvider>
			</StoryBeforeAgentSendProvider>
		</SetChatInputCallbackProvider>
	);
}
