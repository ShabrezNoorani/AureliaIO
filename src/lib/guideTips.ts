import { GUIDE_SCORE_MIN_BOOKINGS, type ScoreBand } from './guidePerformance';

// Rule-based, GUIDE-FACING tips for the guide's own dashboard. Inputs are only this guide's own
// stats (from useGuideOwnScore) — never rank/top-score, never another guide's data. Wording is
// deliberately encouraging; the admin band labels (ADMIN_SCORE_BAND_LABELS) are never used here.

export interface GuideTipInput {
  unlocked: boolean;
  bookingsCount: number;
  reviewCount: number;
  /** Only set for the per-booking metric — see useGuideOwnScore. */
  band: ScoreBand | null;
  countedArrivals: number;
  onTimePct: number | null;
}

export interface GuideTip {
  id: string;
  text: string;
}

export const MAX_GUIDE_TIPS = 3;

const CHECKIN_TIP: GuideTip = { id: 'checkin', text: 'Checking guests in promptly keeps your record clean.' };

export function getGuideTips(s: GuideTipInput): GuideTip[] {
  const tips: GuideTip[] = [];

  if (!s.unlocked) {
    const left = Math.max(0, GUIDE_SCORE_MIN_BOOKINGS - s.bookingsCount);
    tips.push({
      id: 'unlock',
      text: `You're ${left} checked-in booking${left === 1 ? '' : 's'} away from unlocking your score — check every guest in so they count.`,
    });
  } else if (s.band === 'excellent') {
    tips.push({ id: 'band', text: "You're doing great — keep it up!" });
  } else if (s.band === 'good') {
    tips.push({ id: 'band', text: 'Nice work! A few more happy-guest reviews will push you up to Excellent.' });
  } else if (s.band === 'needs_improvement') {
    tips.push({ id: 'band', text: 'Your score is a bit low — ask happy guests to leave a review, it lifts your score fast.' });
  } else if (s.band === 'falling') {
    tips.push({ id: 'band', text: 'Every tour is a fresh start — a warm welcome and asking happy guests for a review makes a real difference.' });
  }

  if (s.unlocked && s.reviewCount === 0) {
    tips.push({ id: 'reviews', text: 'No reviews yet in this period — at the end of the tour, ask happy guests to leave one.' });
  }

  if (s.countedArrivals === 0) {
    tips.push({ id: 'arrive', text: "Remember to tap \"I've arrived\" at the meeting point so your on-time record counts." });
  } else if (s.onTimePct != null && s.onTimePct < 80) {
    tips.push({ id: 'arrive', text: "Aim to reach the meeting point a few minutes early and tap \"I've arrived\" — it builds your on-time record." });
  } else if (s.onTimePct != null && s.onTimePct >= 95 && s.countedArrivals >= 3) {
    tips.push({ id: 'arrive', text: 'Your punctuality is spot on — guests notice!' });
  }

  if (!tips.some(t => t.id === 'unlock')) tips.push(CHECKIN_TIP);

  return tips.slice(0, MAX_GUIDE_TIPS);
}
