import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';
import { z } from 'zod/v4';

import { env } from '../env';
import * as projectQueries from '../queries/project.queries';
import {
	type ProjectWarehouseCredentials,
	warehouseCredentialsSchema,
	type WarehouseProvider,
} from '../types/warehouse';
import { logger, serializeError } from '../utils/logger';
import { createNewProject, createTempProjectDir } from '../utils/project-import.utils';
import { saveProjectWarehouseEnvVars } from './warehouse-credentials';

const JOB_RETENTION_MS = 60 * 60_000;
const INIT_TIMEOUT_MS = 15 * 60_000;
const SYNC_TIMEOUT_MS = 30 * 60_000;
const COMMAND_OUTPUT_LIMIT = 8000;

export type WarehouseProvisioningStatus = 'queued' | 'initializing' | 'syncing' | 'registering' | 'ready' | 'failed';

const preparedWarehouseSchema = z.object({
	database_config: z.record(z.string(), z.unknown()),
	env_vars: z.record(z.string(), z.string()),
});

async function prepareWarehouseConfig(projectName: string, provider: WarehouseProvider, credentials: object) {
	const response = await fetch(`http://localhost:${env.FASTAPI_PORT}/warehouse/prepare`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Nao-Internal-Secret': env.BETTER_AUTH_SECRET,
		},
		body: JSON.stringify({
			project_name: projectName,
			provider,
			credentials: normalizeWarehouseCredentials(provider, credentials),
		}),
	});

	if (!response.ok) {
		throw new Error('Warehouse credentials could not be prepared');
	}

	return preparedWarehouseSchema.parse(await response.json());
}

function normalizeWarehouseCredentials(provider: WarehouseProvider, credentials: object): Record<string, unknown> {
	const normalized = toSnakeCaseRecord(credentials);

	if (provider === 'redshift' && isRecord(normalized.ssh_tunnel)) {
		normalized.ssh_tunnel = toSnakeCaseRecord(normalized.ssh_tunnel);
	}

	return normalized;
}

function toSnakeCaseRecord(values: object): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => [
			key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
			value,
		]),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type StartWarehouseProvisioningInput = {
	userId: string;
	orgId: string;
	name: string;
} & ProjectWarehouseCredentials;

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
	const connection = warehouseCredentialsSchema.parse({
		provider: input.provider,
		credentials: input.credentials,
	});

	const validatedInput: StartWarehouseProvisioningInput = {
		userId: input.userId,
		orgId: input.orgId,
		name: input.name,
		...connection,
	};

	const jobId = crypto.randomUUID();
	jobs.set(jobId, {
		id: jobId,
		userId: input.userId,
		status: 'queued',
	});

	setImmediate(() => void provisionWarehouse(jobId, validatedInput));

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
		const existingProject = await projectQueries.getProjectByOrgAndName(input.orgId, input.name);
		if (existingProject) {
			throw new ProjectNameConflictError(input.name);
		}

		const provisionConfig = await prepareWarehouseConfig(input.name, input.provider, input.credentials);

		updateJob(jobId, { status: 'initializing' });
		writeWarehouseConfig(projectDir, input.name, provisionConfig.database_config);
		const commandEnvironment = createCommandEnvironment(provisionConfig.env_vars);
		await runNaoCommand(['init', '--yes'], projectDir, commandEnvironment, INIT_TIMEOUT_MS);

		updateJob(jobId, { status: 'syncing' });
		await runNaoCommand(['sync', '--provider', 'databases'], projectDir, commandEnvironment, SYNC_TIMEOUT_MS);

		updateJob(jobId, { status: 'registering' });
		const project = await createNewProject({
			sourceDir: projectDir,
			projectName: input.name,
			orgId: input.orgId,
		});

		await saveProjectWarehouseEnvVars(project.projectId, input.provider, provisionConfig.env_vars);

		updateJob(jobId, {
			status: 'ready',
			projectId: project.projectId,
			projectName: project.projectName,
		});
	} catch (error) {
		logger.error('Warehouse provisioning failed', {
			source: 'system',
			context: {
				jobId,
				status: jobs.get(jobId)?.status,
				error: serializeError(error),
			},
		});
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

function writeWarehouseConfig(projectDir: string, projectName: string, databaseConfig: Record<string, unknown>): void {
	const config = yaml.dump({
		project_name: projectName,
		databases: [
			{
				...databaseConfig,
				name: projectName,
			},
		],
	});

	fs.writeFileSync(path.join(projectDir, 'nao_config.yaml'), config, { mode: 0o600 });
}

function createCommandEnvironment(warehouseEnvVars: Record<string, string>): NodeJS.ProcessEnv {
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
		...warehouseEnvVars,
	};
}

function runNaoCommand(args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('nao', args, {
			cwd,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let settled = false;
		let output = '';
		const captureOutput = (chunk: Buffer) => {
			output = `${output}${chunk.toString('utf8')}`.slice(-COMMAND_OUTPUT_LIMIT);
		};
		child.stdout.on('data', captureOutput);
		child.stderr.on('data', captureOutput);
		const timeout = setTimeout(() => {
			if (settled) {
				return;
			}
			settled = true;
			child.kill('SIGTERM');
			reject(new Error('nao command timed out'));
		}, timeoutMs);

		child.once('error', (error) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			reject(new Error(`Could not start nao ${args[0]}: ${error.message}`));
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
				const details = output.trim();
				reject(new Error(`nao ${args[0]} failed${details ? `: ${details}` : ''}`));
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
