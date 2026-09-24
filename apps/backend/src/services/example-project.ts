import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isCloud } from '../env';
import * as projectQueries from '../queries/project.queries';
import * as userPreferenceQueries from '../queries/user-preference.queries';

export const SYSTEM_EXAMPLE_PROJECT_ID = 'system-example-project';

export async function ensureSystemExampleProject() {
	const projectPath = fileURLToPath(new URL('../../../../example', import.meta.url));

	if (!existsSync(join(projectPath, 'nao_config.yaml'))) {
		throw new Error(`Example project not found at ${projectPath}`);
	}

	return projectQueries.upsertSystemExampleProject(projectPath);
}

export async function getExampleProjectForUser(userId: string) {
	if (!isCloud) {
		return null;
	}

	const [preferences, projects] = await Promise.all([
		userPreferenceQueries.getUserPreferences(userId),
		projectQueries.listUserProjects(userId),
	]);

	if (!preferences.welcomeReward || projects.length > 0) {
		return null;
	}

	return projectQueries.getProjectById(SYSTEM_EXAMPLE_PROJECT_ID);
}
