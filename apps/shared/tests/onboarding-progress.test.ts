import { describe, expect, it } from 'vitest';

import { onboardingCommand, onboardingProgress } from '../src/tools';

describe('onboarding progress', () => {
	it('accepts flow selection and the four supported steps', () => {
		expect(onboardingProgress.InputSchema.parse({ flow: 'new', step: 0 })).toEqual({ flow: 'new', step: 0 });
		expect(onboardingProgress.InputSchema.parse({ flow: 'github', step: 4 })).toEqual({
			flow: 'github',
			step: 4,
		});
	});

	it('rejects unsupported steps', () => {
		expect(() => onboardingProgress.InputSchema.parse({ flow: 'local', step: 5 })).toThrow();
	});
});

describe('onboarding command', () => {
	it('preserves multiline commands', () => {
		const command = 'cd <your-project-folder>\nnao debug';
		expect(onboardingCommand.InputSchema.parse({ command })).toEqual({ command });
	});
});
