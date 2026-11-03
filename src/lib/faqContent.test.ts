import { describe, it, expect } from 'vitest';
import { FAQ_SECTIONS, filterFaqSections, highlightParts, searchTerms, faqItemMatches } from './faqContent';

describe('FAQ instant search', () => {
  it('returns every section unchanged for a blank query', () => {
    expect(filterFaqSections(FAQ_SECTIONS, '   ')).toBe(FAQ_SECTIONS);
  });

  it('matches partial words case-insensitively ("Tou" finds "tour")', () => {
    const results = filterFaqSections(FAQ_SECTIONS, 'Tou');
    const all = results.flatMap(s => s.items);
    expect(all.length).toBeGreaterThan(0);
    all.forEach(i => expect(`${i.question} ${i.answer}`.toLowerCase()).toContain('tou'));
    // Nothing containing "tou" was dropped.
    const expected = FAQ_SECTIONS.flatMap(s => s.items).filter(i => `${i.question}\n${i.answer}`.toLowerCase().includes('tou'));
    expect(all.map(i => i.id).sort()).toEqual(expected.map(i => i.id).sort());
  });

  it('requires every term to appear (AND), in any order', () => {
    const item = { id: 'x', question: 'How are guides paid?', answer: 'Monthly invoices.' };
    expect(faqItemMatches(item, searchTerms('invoice guide'))).toBe(true);
    expect(faqItemMatches(item, searchTerms('invoice aquila'))).toBe(false);
  });

  it('drops sections with no matches and returns none for nonsense', () => {
    expect(filterFaqSections(FAQ_SECTIONS, 'zzqxj')).toEqual([]);
  });

  it('highlights every occurrence, preserving the original casing and full text', () => {
    const parts = highlightParts('Tours and more tours', ['tou']);
    expect(parts.map(p => p.text).join('')).toBe('Tours and more tours');
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['Tou', 'tou']);
  });

  it('treats regex characters in the query literally', () => {
    const parts = highlightParts('P&L (profit) view', ['(profit)']);
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['(profit)']);
  });
});
