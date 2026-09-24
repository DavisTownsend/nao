import z from 'zod/v3';

export const FlowSchema = z.enum(['new', 'local', 'github', 'database']);

export const InputSchema = z.object({
	flow: FlowSchema.describe('The onboarding path selected by the user.'),
	step: z.number().int().min(0).max(4).describe('The number of completed steps in the selected flow.'),
});

export const OutputSchema = InputSchema.extend({
	_version: z.literal('1').optional(),
});

export type Flow = z.infer<typeof FlowSchema>;
export type Input = z.infer<typeof InputSchema>;
export type Output = z.infer<typeof OutputSchema>;
