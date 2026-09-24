import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';

import * as projectQueries from '../queries/project.queries';
import { createNewProject, createTempProjectDir } from '../utils/project-import.utils';

const JOB_RETENTION_MS = 60 * 60_000;
const INIT_TIMEOUT_MS = 15 * 60_000;
const SYNC_TIMEOUT_MS = 30 * 60_000;

export type WarehouseProvisioningStatus = 'queued' | 'initializing' | 'syncing' | 'registering' | 'ready' | 'failed';

interface PostgresCredentials {
	name: string;
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	schemaName?: string;
}

interface StartWarehouseProvisioningInput {
	userId: string;
	orgId: string;
	provider: 'postgres';
	credentials: PostgresCredentials;
}

interface WarehouseProvisioningJob {
	id: string;
	userId: string;
	status: WarehouseProvisioningStatus;
	projectId?: string;
	projectName?: string;
	error?: string;
}

const jobs = new Map<string, WarehouseProvisioningJob>();

// ponytail: In-memory jobs suit this prototype but not restarts or multiple instances; move them to a durable queue backed by a secret manager before scaling cloud workers.
export async function startWarehouseProvisioning(
	input: StartWarehouseProvisioningInput,
): Promise<{ jobId: string; status: 'queued' }> {
	const jobId = crypto.randomUUID();
	jobs.set(jobId, {
		id: jobId,
		userId: input.userId,
		status: 'queued',
	});

	setImmediate(() => void provisionWarehouse(jobId, input));

	return { jobId, status: 'queued' };
}

export function getWarehouseProvisioningJob(
	jobId: string,
	userId: string,
): Omit<WarehouseProvisioningJob, 'userId'> | null {
	const job = jobs.get(jobId);
	if (!job || job.userId !== userId) {
		return null;
	}

	const { userId: _, ...safeJob } = job;
	return safeJob;
}

async function provisionWarehouse(jobId: string, input: StartWarehouseProvisioningInput): Promise<void> {
	let projectDir: string | null = null;

	try {
		projectDir = createTempProjectDir('warehouse-onboarding');
		const existingProject = await projectQueries.getProjectByOrgAndName(input.orgId, input.credentials.name);
		if (existingProject) {
			throw new ProjectNameConflictError(input.credentials.name);
		}

		updateJob(jobId, { status: 'initializing' });
		writePostgresConfig(projectDir, input.credentials);
		const commandEnvironment = createCommandEnvironment(input.credentials);
		await runNaoCommand(['init', '--yes'], projectDir, commandEnvironment, INIT_TIMEOUT_MS);

		updateJob(jobId, { status: 'syncing' });
		await runNaoCommand(['sync', '--provider', 'databases'], projectDir, commandEnvironment, SYNC_TIMEOUT_MS);

		updateJob(jobId, { status: 'registering' });
		const project = await createNewProject({
			sourceDir: projectDir,
			projectName: input.credentials.name,
			orgId: input.orgId,
		});

		updateJob(jobId, {
			status: 'ready',
			projectId: project.projectId,
			projectName: project.projectName,
		});
	} catch (error) {
		updateJob(jobId, {
			status: 'failed',
			error:
				error instanceof ProjectNameConflictError
					? error.message
					: 'Warehouse setup failed. Check the connection details and try again.',
		});
	} finally {
		if (projectDir) {
			fs.rmSync(projectDir, { recursive: true, force: true });
		}
		scheduleJobCleanup(jobId);
	}
}

function writePostgresConfig(projectDir: string, credentials: PostgresCredentials): void {
	const database = {
		type: 'postgres',
		name: credentials.name,
		host: "{{ env('NAO_ONBOARDING_POSTGRES_HOST') }}",
		port: credentials.port,
		database: "{{ env('NAO_ONBOARDING_POSTGRES_DATABASE') }}",
		user: "{{ env('NAO_ONBOARDING_POSTGRES_USER') }}",
		password: "{{ env('NAO_ONBOARDING_POSTGRES_PASSWORD') }}",
		...(credentials.schemaName && {
			schema_name: "{{ env('NAO_ONBOARDING_POSTGRES_SCHEMA') }}",
		}),
	};
	const config = yaml.dump({
		project_name: credentials.name,
		databases: [database],
	});

	fs.writeFileSync(path.join(projectDir, 'nao_config.yaml'), config, { mode: 0o600 });
}

function createCommandEnvironment(credentials: PostgresCredentials): NodeJS.ProcessEnv {
	return {
		PATH: process.env.PATH,
		HOME: process.env.HOME,
		TMPDIR: process.env.TMPDIR,
		VIRTUAL_ENV: process.env.VIRTUAL_ENV,
		LANG: process.env.LANG,
		LC_ALL: process.env.LC_ALL,
		SSL_CERT_FILE: process.env.SSL_CERT_FILE,
		REQUESTS_CA_BUNDLE: process.env.REQUESTS_CA_BUNDLE,
		HTTPS_PROXY: process.env.HTTPS_PROXY,
		HTTP_PROXY: process.env.HTTP_PROXY,
		NO_PROXY: process.env.NO_PROXY,
		NAO_ONBOARDING_POSTGRES_HOST: credentials.host,
		NAO_ONBOARDING_POSTGRES_DATABASE: credentials.database,
		NAO_ONBOARDING_POSTGRES_USER: credentials.user,
		NAO_ONBOARDING_POSTGRES_PASSWORD: credentials.password,
		...(credentials.schemaName && { NAO_ONBOARDING_POSTGRES_SCHEMA: credentials.schemaName }),
	};
}

function runNaoCommand(args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('nao', args, {
			cwd,
			env,
			stdio: 'ignore',
		});
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) {
				return;
			}
			settled = true;
			child.kill('SIGTERM');
			reject(new Error('nao command timed out'));
		}, timeoutMs);

		child.once('error', () => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			reject(new Error('Could not start nao'));
		});
		child.once('close', (code) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			if (code === 0) {
				resolve();
			} else {
				reject(new Error('nao command failed'));
			}
		});
	});
}

function updateJob(jobId: string, update: Partial<WarehouseProvisioningJob>): void {
	const job = jobs.get(jobId);
	if (job) {
		jobs.set(jobId, { ...job, ...update });
	}
}

function scheduleJobCleanup(jobId: string): void {
	const timeout = setTimeout(() => jobs.delete(jobId), JOB_RETENTION_MS);
	timeout.unref?.();
}

class ProjectNameConflictError extends Error {
	constructor(projectName: string) {
		super(`A project named "${projectName}" already exists.`);
	}
}
