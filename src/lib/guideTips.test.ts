import { describe, it, expect } from 'vitest';
import { getGuideTips, MAX_GUIDE_TIPS } from './guideTips';
import { ADMIN_SCORE_BAND_LABELS } from './guidePerformance';

const base = { unlocked: true, bookingsCount: 20, reviewCount: 5, band: 'good' as const, countedArrivals: 5, onTimePct: 90 };

describe('getGuideTips', () => {
  it('encourages a low score with the review tip', () => {
    const tips = getGuideTips({ ...base, band: 'needs_improvement' });
    expect(tips[0].text).toMatch(/ask happy guests to leave a review/);
  });

  it('praises an excellent score', () => {
    expect(getGuideTips({ ...base, band: 'excellent' })[0].text).toBe("You're doing great — keep it up!");
  });

  it('reminds about "I\'ve arrived" when no arrivals are recorded', () => {
    expect(getGuideTips({ ...base, countedArrivals: 0, onTimePct: null }).some(t => t.id === 'arrive')).toBe(true);
  });

  it('shows the unlock tip before the score is available', () => {
    const tips = getGuideTips({ ...base, unlocked: false, bookingsCount: 3, band: null });
    expect(tips[0].id).toBe('unlock');
  });

  it('never uses admin wording and caps the number of tips', () => {
    for (const band of ['excellent', 'good', 'needs_improvement', 'falling'] as const) {
      const tips = getGuideTips({ ...base, band, reviewCount: 0, countedArrivals: 0, onTimePct: null });
      expect(tips.length).toBeLessThanOrEqual(MAX_GUIDE_TIPS);
      for (const t of tips) {
        expect(t.text).not.toContain(ADMIN_SCORE_BAND_LABELS.falling);
        expect(t.text.toLowerCase()).not.toContain('conversation');
      }
    }
  });
});
