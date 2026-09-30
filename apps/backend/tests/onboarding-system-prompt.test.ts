import { describe, expect, it } from 'vitest';

import { renderOnboardingSystemPrompt } from '../src/components/ai/onboarding-system-prompt';

describe('onboarding system prompt', () => {
	it('routes cloud DuckDB connections through private MotherDuck credentials', () => {
		const prompt = renderOnboardingSystemPrompt();

		expect(prompt).toContain('treat the selected database provider as "motherduck"');
		expect(prompt).toContain('Do not continue the database connection flow');
		expect(prompt).not.toContain('make their DuckDB file public');
	});
});
