import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

export function CommandBlock({ command }: { command: string }) {
	const { isCopied, copy } = useCopyToClipboard();

	return (
		<div className='flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2'>
			<code className='min-w-0 flex-1 whitespace-pre-wrap font-mono text-sm'>{command}</code>
			<Button
				type='button'
				variant='ghost'
				size='icon-xs'
				aria-label={isCopied ? 'Copied' : 'Copy command'}
				title={isCopied ? 'Copied' : 'Copy command'}
				onClick={() => copy(command)}
			>
				{isCopied ? <Check className='size-3.5 text-emerald-500' /> : <Copy className='size-3.5' />}
			</Button>
		</div>
	);
}
