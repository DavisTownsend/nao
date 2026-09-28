import { describe, expect, it } from 'vitest';

import { formatBillingPrice, formatInvoiceLabel } from './billing-display';

describe('formatBillingPrice', () => {
	it('preserves fractional currency amounts', () => {
		expect(formatBillingPrice(199_999, 'eur')).not.toBe(formatBillingPrice(200_000, 'eur'));
	});
});

describe('formatInvoiceLabel', () => {
	it('uses a readable billing month instead of a Stripe reference', () => {
		const date = new Date(2026, 8, 15);

		expect(formatInvoiceLabel(date)).toBe(
			new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date),
		);
	});
});
