import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { CircleCheck, FileCheck2, FolderGit2, Github, LockKeyhole, MessageCircle } from 'lucide-react';

import { MobileHeader } from '@/components/mobile-header';
import { GitHubRepoPicker } from '@/components/settings/github-repo-picker';
import { ImportProviderCard } from '@/components/settings/import-provider-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/main';

export const Route = createFileRoute('/_sidebar-layout/setup-github-project')({
	component: SetupGithubProjectPage,
});

function SetupGithubProjectPage() {
	const project = useQuery(trpc.project.getCurrent.queryOptions());
	const githubAvailable = useQuery(trpc.github.isAvailable.queryOptions());
	const githubStatus = useQuery({
		...trpc.github.getStatus.queryOptions(),
		enabled: githubAvailable.data === true,
	});

	return (
		<div className='flex flex-1 flex-col overflow-auto bg-background'>
			<MobileHeader />
			<main className='mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 md:px-8 md:py-14'>
				<header className='flex max-w-3xl flex-col gap-4'>
					<div className='flex size-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400'>
						<Github className='size-6' />
					</div>
					<div className='space-y-2'>
						<p className='text-sm font-medium text-violet-600 dark:text-violet-400'>GitHub import guide</p>
						<h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
							Import an existing nao project
						</h1>
						<p className='max-w-2xl text-base leading-relaxed text-muted-foreground'>
							Connect GitHub, choose a repository, and import its project context into nao Cloud.
						</p>
					</div>
				</header>

				<section className='space-y-4'>
					<div>
						<h2 className='text-lg font-semibold'>Before you begin</h2>
						<p className='text-sm text-muted-foreground'>
							Make sure the repository already contains a synchronized nao project.
						</p>
					</div>
					<div className='grid gap-4 sm:grid-cols-3'>
						<RequirementCard
							icon={<FolderGit2 className='size-5 text-violet-500' />}
							title='A GitHub repository'
							description='You need access to the repository you want to import.'
						/>
						<RequirementCard
							icon={<FileCheck2 className='size-5 text-blue-500' />}
							title='nao project files'
							description='Commit nao_config.yaml, RULES.md, and your synchronized context.'
						/>
						<RequirementCard
							icon={<LockKeyhole className='size-5 text-emerald-500' />}
							title='Repository permission'
							description='Authorize nao to read the repository through your GitHub account.'
						/>
					</div>
				</section>

				<section className='space-y-4'>
					<div>
						<h2 className='text-lg font-semibold'>Import your project</h2>
						<p className='text-sm text-muted-foreground'>
							Follow these steps to start chatting with its data.
						</p>
					</div>

					<div className='space-y-3'>
						<GuideStep number={1} title='Prepare the repository'>
							<p>
								The repository should contain a project created with <code>nao init</code> and context
								generated with <code>nao sync</code>.
							</p>
							<p>
								Starting from scratch?{' '}
								<Link
									to='/setup-project'
									className='font-medium text-blue-600 hover:underline dark:text-blue-300'
								>
									Follow the CLI setup guide
								</Link>{' '}
								first, then push the generated files to GitHub.
							</p>
						</GuideStep>

						<GuideStep number={2} title='Connect GitHub'>
							<p>
								Authorize nao to list repositories available to your GitHub account. Private repository
								contents remain accessible only through the permissions you grant.
							</p>
						</GuideStep>

						<GuideStep number={3} title='Choose and import a repository'>
							<p>
								Select the repository containing your nao project. nao will copy its files into a new
								cloud project and make it your active project.
							</p>
						</GuideStep>
					</div>

					{githubAvailable.isPending ? (
						<Card className='shadow-none'>
							<CardContent className='text-sm text-muted-foreground'>
								Checking GitHub availability…
							</CardContent>
						</Card>
					) : githubAvailable.data ? (
						<ImportProviderCard
							providerLabel='GitHub'
							icon={Github}
							connectHref='/api/github/connect?returnTo=%2Fsetup-github-project'
							resourceNounSingular='repository'
							resourceNounPlural='repositories'
							connected={githubStatus.data?.connected === true}
							Picker={GitHubRepoPicker}
						/>
					) : (
						<Card className='border-amber-500/20 bg-amber-500/5 shadow-none'>
							<CardContent className='space-y-1'>
								<h3 className='font-medium'>GitHub import is unavailable</h3>
								<p className='text-sm text-muted-foreground'>
									Ask your nao administrator to configure GitHub OAuth, or use the CLI setup guide
									instead.
								</p>
							</CardContent>
						</Card>
					)}
				</section>

				{project.data && (
					<section className='flex flex-col items-center gap-4 rounded-2xl border bg-panel/40 p-6 text-center md:p-8'>
						<div className='flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
							<CircleCheck className='size-6' />
						</div>
						<div className='space-y-1'>
							<h2 className='text-lg font-semibold'>{project.data.name} is ready</h2>
							<p className='text-sm text-muted-foreground'>
								Your repository has been imported and is now the active project.
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

function RequirementCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
	return (
		<Card className='shadow-none'>
			<CardContent className='space-y-3'>
				{icon}
				<div>
					<h3 className='font-medium'>{title}</h3>
					<p className='text-sm text-muted-foreground'>{description}</p>
				</div>
			</CardContent>
		</Card>
	);
}

function GuideStep({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
	return (
		<Card className='shadow-none'>
			<CardContent className='grid gap-4 sm:grid-cols-[auto_1fr]'>
				<div className='flex size-8 items-center justify-center rounded-full bg-violet-500/10 text-sm font-semibold text-violet-700 dark:text-violet-300'>
					{number}
				</div>
				<div className='space-y-2'>
					<h3 className='font-medium'>{title}</h3>
					<div className='space-y-2 text-sm leading-relaxed text-muted-foreground'>{children}</div>
				</div>
			</CardContent>
		</Card>
	);
}
