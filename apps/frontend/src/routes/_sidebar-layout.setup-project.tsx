import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Check, CircleCheck, FolderCog, MessageCircle, Terminal } from 'lucide-react';

import { CommandBlock } from '@/components/command-block';
import { MobileHeader } from '@/components/mobile-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/main';

export const Route = createFileRoute('/_sidebar-layout/setup-project')({
	component: SetupProjectPage,
});

function SetupProjectPage() {
	const project = useQuery({
		...trpc.project.getCurrent.queryOptions(),
		refetchInterval: (query) => (query.state.data ? false : 3000),
	});

	return (
		<div className='flex flex-1 flex-col overflow-auto bg-background'>
			<MobileHeader />
			<main className='mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 md:px-8 md:py-14'>
				<header className='flex max-w-3xl flex-col gap-4'>
					<div className='flex size-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400'>
						<Terminal className='size-6' />
					</div>
					<div className='space-y-2'>
						<p className='text-sm font-medium text-blue-600 dark:text-blue-400'>Project setup guide</p>
						<h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
							Build your first nao project
						</h1>
						<p className='max-w-2xl text-base leading-relaxed text-muted-foreground'>
							Go from an empty folder to a synchronized analytics context in a few terminal commands. You
							can skip optional integrations and add them later.
						</p>
					</div>
				</header>

				<section className='space-y-4'>
					<div>
						<h2 className='text-lg font-semibold'>Before you begin</h2>
						<p className='text-sm text-muted-foreground'>You only need these basics to get started.</p>
					</div>
					<div className='grid gap-4 sm:grid-cols-3'>
						<Card className='shadow-none'>
							<CardContent className='space-y-3'>
								<Terminal className='size-5 text-blue-500' />
								<div>
									<h3 className='font-medium'>A terminal</h3>
									<p className='text-sm text-muted-foreground'>
										Terminal on macOS or Linux, PowerShell on Windows.
									</p>
								</div>
							</CardContent>
						</Card>
						<Card className='shadow-none'>
							<CardContent className='space-y-3'>
								<FolderCog className='size-5 text-emerald-500' />
								<div>
									<h3 className='font-medium'>Your project details</h3>
									<p className='text-sm text-muted-foreground'>
										A name and, optionally, a database or repository.
									</p>
								</div>
							</CardContent>
						</Card>
					</div>
				</section>

				<section className='space-y-4'>
					<div>
						<h2 className='text-lg font-semibold'>Set up your project</h2>
						<p className='text-sm text-muted-foreground'>Follow these steps in order from your terminal.</p>
					</div>

					<div className='space-y-3'>
						<Card className='shadow-none'>
							<CardContent className='grid gap-4 sm:grid-cols-[auto_1fr]'>
								<div className='flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-700 dark:text-blue-300'>
									1
								</div>
								<div className='space-y-2'>
									<h3 className='font-medium'>Open a terminal</h3>
									<p className='text-sm leading-relaxed text-muted-foreground'>
										Open Terminal, PowerShell, or your preferred command-line application.
									</p>
								</div>
							</CardContent>
						</Card>

						<Card className='shadow-none'>
							<CardContent className='grid gap-4 sm:grid-cols-[auto_1fr]'>
								<div className='flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-700 dark:text-blue-300'>
									2
								</div>
								<div className='space-y-3'>
									<div className='space-y-1'>
										<h3 className='font-medium'>Install nao-core</h3>
										<p className='text-sm leading-relaxed text-muted-foreground'>
											uv installs nao in an isolated environment and manages a compatible Python
											version.
										</p>
									</div>
									<CommandBlock command='uv tool install "nao-core"' />
									<p className='text-xs text-muted-foreground'>
										Already using Python 3.10 or newer? You can use pip instead.
									</p>
									<CommandBlock command='pip install nao-core' />
								</div>
							</CardContent>
						</Card>

						<Card className='shadow-none'>
							<CardContent className='grid gap-4 sm:grid-cols-[auto_1fr]'>
								<div className='flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-700 dark:text-blue-300'>
									3
								</div>
								<div className='space-y-3'>
									<div className='space-y-1'>
										<h3 className='font-medium'>Initialize your project</h3>
										<p className='text-sm leading-relaxed text-muted-foreground'>
											The setup will ask for a project name and offer to connect a database,
											repository, LLM, and Slack workspace.
										</p>
									</div>
									<CommandBlock command='nao init' />
									<div className='grid gap-2 text-sm text-muted-foreground sm:grid-cols-2'>
										<div className='flex items-center gap-2'>
											<Check className='size-4 text-emerald-500' />
											Creates your project folder
										</div>
										<div className='flex items-center gap-2'>
											<Check className='size-4 text-emerald-500' />
											Adds nao_config.yaml
										</div>
										<div className='flex items-center gap-2'>
											<Check className='size-4 text-emerald-500' />
											Scaffolds context folders
										</div>
										<div className='flex items-center gap-2'>
											<Check className='size-4 text-emerald-500' />
											Adds RULES.md
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card className='shadow-none'>
							<CardContent className='grid gap-4 sm:grid-cols-[auto_1fr]'>
								<div className='flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-700 dark:text-blue-300'>
									4
								</div>
								<div className='space-y-3'>
									<div className='space-y-1'>
										<h3 className='font-medium'>Verify your setup</h3>
										<p className='text-sm leading-relaxed text-muted-foreground'>
											Move into the newly created project folder, then check that nao can read
											your configuration and connect to its resources.
										</p>
									</div>
									<CommandBlock command={'cd <your-project-name>\nnao debug'} />
								</div>
							</CardContent>
						</Card>

						<Card className='shadow-none'>
							<CardContent className='grid gap-4 sm:grid-cols-[auto_1fr]'>
								<div className='flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-700 dark:text-blue-300'>
									5
								</div>
								<div className='space-y-3'>
									<div className='space-y-1'>
										<h3 className='font-medium'>Synchronize your context</h3>
										<p className='text-sm leading-relaxed text-muted-foreground'>
											Generate local context files from your configured databases, metadata,
											documentation, and repositories.
										</p>
									</div>
									<CommandBlock command='nao sync' />
								</div>
							</CardContent>
						</Card>
						<Card className='shadow-none'>
							<CardContent className='grid gap-4 sm:grid-cols-[auto_1fr]'>
								<div className='flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-700 dark:text-blue-300'>
									6
								</div>
								<div className='space-y-3'>
									<div className='space-y-1'>
										<h3 className='font-medium'>Deploy your project</h3>
										<p className='text-sm leading-relaxed text-muted-foreground'>
											Upload your synchronized project to nao Cloud so your team can start using
											it. Generate a deployment API key in the Projects Settings & Budget section
											of your settings page (or just click{' '}
											<Link
												to='/settings/project'
												target='_blank'
												rel='noopener noreferrer'
												className='font-medium text-blue-600 hover:underline dark:text-blue-300'
											>
												here
											</Link>
											), then replace the placeholder below before running the command.
										</p>
									</div>
									<CommandBlock command='nao deploy https://app.getnao.io --api-key <your-organization-api-key>' />
								</div>
							</CardContent>
						</Card>
					</div>
				</section>

				{project.data && (
					<section className='flex flex-col items-center gap-4 rounded-2xl border bg-panel/40 p-6 text-center md:p-8'>
						<div className='flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
							<CircleCheck className='size-6' />
						</div>
						<div className='space-y-1'>
							<h2 className='text-lg font-semibold'>Your project is ready</h2>
							<p className='text-sm text-muted-foreground'>
								Your configuration is verified and your context is synchronized.
							</p>
						</div>
						<Button variant='primary-gradient' className='w-fit' asChild>
							<Link to='/'>
								<MessageCircle className='size-4' />
								Start chatting with nao
							</Link>
						</Button>
					</section>
				)}
			</main>
		</div>
	);
}
