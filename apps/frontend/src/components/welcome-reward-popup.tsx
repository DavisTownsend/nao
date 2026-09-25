import { Link } from '@tanstack/react-router';
import { MessageCircleOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAgentContext } from '@/contexts/agent.provider';
import { useSidebar } from '@/contexts/sidebar';
import { isFreeMessagesExhaustedError } from '@/lib/ai';

const CONFETTI_COLORS = ['bg-blue-500', 'bg-violet-500', 'bg-amber-400', 'bg-emerald-500', 'bg-pink-500'];

function Confetti() {
	return (
		<div aria-hidden className='pointer-events-none absolute inset-0 overflow-hidden'>
			{Array.from({ length: 28 }, (_, index) => (
				<span
					key={index}
					className={`welcome-confetti-piece absolute size-2 rounded-sm ${CONFETTI_COLORS[index % CONFETTI_COLORS.length]}`}
					style={
						{
							left: `${(index * 37) % 100}%`,
							animationDelay: `${(index % 7) * 80}ms`,
							animationDuration: `${1.4 + (index % 5) * 0.15}s`,
							'--confetti-drift': `${((index % 5) - 2) * 18}px`,
						} as CSSProperties
					}
				/>
			))}
		</div>
	);
}

export function WelcomeRewardPopup() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (sessionStorage.getItem('welcome-reward-popup') !== 'true') {
			return;
		}

		sessionStorage.removeItem('welcome-reward-popup');
		setOpen(true);
	}, []);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className='overflow-hidden'>
				<Confetti />
				<DialogHeader>
					<DialogTitle>Congrats! 🎉</DialogTitle>
					<DialogDescription>You've received free tokens to chat with nao!</DialogDescription>
				</DialogHeader>
				<Button onClick={() => setOpen(false)}>Start chatting</Button>
			</DialogContent>
		</Dialog>
	);
}

export function FreeMessagesExhaustedPopup() {
	const { error, clearError } = useAgentContext();
	const { isCollapsed, isMobile } = useSidebar();
	const open = isFreeMessagesExhaustedError(error);

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					clearError();
				}
			}}
		>
			<DialogContent style={isMobile ? undefined : { left: `calc(50% + ${isCollapsed ? '1.625rem' : '9rem'})` }}>
				<div className='mx-auto flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300'>
					<MessageCircleOff className='size-6' />
				</div>
				<DialogHeader className='text-center'>
					<DialogTitle>You're out of free tokens</DialogTitle>
					<DialogDescription>
						You've used all your free tokens. Create a project to keep chatting with nao.
					</DialogDescription>
				</DialogHeader>
				<Button asChild variant='primary-gradient'>
					<Link to='/onboarding' onClick={clearError}>
						Set up your project
					</Link>
				</Button>
			</DialogContent>
		</Dialog>
	);
}
