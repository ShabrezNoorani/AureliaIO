/**
 * Public FAQ content (/faq) plus its instant, client-side search. Pure data + pure functions — no
 * network, no AI. Answers are plain text; a blank line ("\n\n") separates paragraphs.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'about-aurelia',
    title: 'About AURELIA',
    items: [
      {
        id: 'what-is-aurelia',
        question: 'What is AURELIA?',
        answer:
          'AURELIA is a tour-operations platform for tour operators. It brings your bookings, guest check-in, guide allocation, guide pay, finances and analytics into one live view, so the whole team works from the same source of truth — on the day of the tour and at month-end.',
      },
      {
        id: 'who-is-it-for',
        question: 'Who is AURELIA for?',
        answer:
          'Tour operators of any size who run scheduled tours with guides — from a small team running a couple of daily walks to an operator with dozens of guides across several products. If you sell through OTAs like Viator or GetYourGuide and pay guides per tour, AURELIA is built for you.\n\nIf you only need guide-side tools (check-in and bookings) without finances, the Guide plan covers exactly that.',
      },
      {
        id: 'booking-data-gmail',
        question: 'How does AURELIA get my booking data?',
        answer:
          'Booking data arrives automatically from your Gmail: the booking confirmations your sales channels already send you are read and turned into bookings in AURELIA. There is nothing to re-type and no exports to manage — new reservations simply appear, ready for check-in.',
      },
      {
        id: 'financial-ledger',
        question: 'What is the financial ledger?',
        answer:
          'The ledger is the line-by-line record of every booking and what it is really worth to you: what the guest paid, what the channel kept, what the guide cost and what is left as profit. New bookings are flagged so you can review them, and every manual correction is recorded in a change log.',
      },
      {
        id: 'analytics-pnl',
        question: 'What do analytics and P&L show?',
        answer:
          'Revenue, costs and true profit, broken down by day, month, channel and product. The P&L view separates tour costs (guides, tickets) from your fixed admin costs, so you can see which products and channels actually make money — not just which ones sell the most.',
      },
      {
        id: 'products-pricing',
        question: 'What does "Products & Pricing" do?',
        answer:
          'It is where you define your tours, their options and their prices and costs. Those figures drive the ledger and the P&L, and the simulator lets you test a price or cost change before you make it.',
      },
      {
        id: 'ai-insights',
        question: 'What are AI insights?',
        answer:
          'An AI operations assistant inside AURELIA. Ask plain questions about your business ("Which channel earns the most?"), get a summary of what guests praise and complain about, see how your price points perform, and run an automatic health check that flags inconsistent totals, missing booking data and upcoming sessions without a guide.\n\nIt only reads summaries of your data and never changes anything. Every answer is labelled AI-generated so you can verify before acting.',
      },
    ],
  },
  {
    id: 'about-aquila',
    title: 'About AQUILA / Market Intelligence',
    items: [
      {
        id: 'what-is-aquila',
        question: 'What is AQUILA?',
        answer:
          'AQUILA is AURELIA\'s market intelligence product. It helps you track competitor tour listings — their prices, options, ratings and demand signals — over time, so you can see where you are ahead or behind, spot gaps worth entering, and make pricing and product decisions with evidence rather than guesswork.',
      },
      {
        id: 'aquila-scraping',
        question: 'Does AQUILA scrape websites or act automatically?',
        answer:
          'No. AQUILA does not scrape websites and never acts on your behalf — it will not change your prices, edit your listings or contact anyone. It is a research and analysis tool: you decide what to track and what to do with what you learn.',
      },
      {
        id: 'aquila-capture',
        question: 'How does market data get into AQUILA?',
        answer:
          'Through assisted capture by the owner. You choose the competitor listings you care about and record what you see; AQUILA helps you capture it in a consistent, structured way and keeps the history, so changes in price, options or ratings become visible over time.',
      },
      {
        id: 'aquila-ask-ai',
        question: 'Can I ask AI about my market?',
        answer:
          'Yes. Ask-AI lets you ask plain-language questions about the market data you have captured — for example, which competitors changed their prices recently, where your offer is priced above or below the market, or which tour types look under-served. Answers are based on the data you have captured, so the more you track, the more useful they become.',
      },
      {
        id: 'aquila-who-sees',
        question: 'Who can see AQUILA?',
        answer:
          'Only the owner. AQUILA is owner-only — guides never see it, and nothing from it appears in any guide\'s view.',
      },
      {
        id: 'aquila-connect',
        question: 'How does AQUILA connect to AURELIA?',
        answer:
          'AQUILA opens straight from the owner menu in AURELIA. AURELIA tells you how your own business performs; AQUILA puts that next to what the market around you is doing.',
      },
      {
        id: 'aquila-plan',
        question: 'Which plan includes AQUILA?',
        answer:
          'Market Intelligence (AQUILA) is included in the Intelligence plan (€25 / month), together with everything in the Operations plan.',
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing & plans',
    items: [
      {
        id: 'plans-overview',
        question: 'What plans are there?',
        answer:
          'Three plans, all monthly:\n\nGuide — €10 / month. Guide check-in, automatic booking data from Gmail and the guide dashboard. 1 user included.\n\nOperations — €20 / month. Everything in Guide, plus the financial ledger, analytics, P&L, products & pricing and AI insights. 2 users included.\n\nIntelligence — €25 / month. Everything in Operations, plus Market Intelligence (AQUILA). 3 users included.',
      },
      {
        id: 'guide-plan-excludes',
        question: 'What is not included in the Guide plan?',
        answer:
          'The Guide plan is for guide-side operations only. It does not include the financial ledger, analytics, P&L or the simulator — those start with the Operations plan.',
      },
      {
        id: 'extra-users',
        question: 'How much are additional users?',
        answer:
          'Guide plan: +€2 per additional user per month (1 user included).\n\nOperations plan: +€5 per additional user per month (2 users included).\n\nIntelligence plan: +€5 per additional user per month (3 users included).',
      },
      {
        id: 'ai-key-addon',
        question: 'Do I need my own AI key for AI insights?',
        answer:
          'You can choose. On the Operations and Intelligence plans, either bring your own AI provider key at no extra cost from us, or add the AI-key add-on for +€5 / month and we provide it for you.',
      },
      {
        id: 'free-trial',
        question: 'Is there a free trial?',
        answer:
          'Yes. You can start a free trial with no card required, and explore the platform with your own tours before you decide.',
      },
      {
        id: 'how-to-pay',
        question: 'How do I pay?',
        answer:
          'Card payments are coming soon. In the meantime, get in touch and we will set up your plan with you directly.',
      },
      {
        id: 'larger-team',
        question: 'We are a larger team — can we get a custom setup?',
        answer:
          'Yes. If you need many users or a setup that the standard plans do not cover, contact us and we will put something together for you.',
      },
    ],
  },
  {
    id: 'guides-checkin',
    title: 'Guides & check-in',
    items: [
      {
        id: 'how-checkin-works',
        question: 'How does guest check-in work?',
        answer:
          'Guides open AURELIA on their phone, see today\'s tours and guest list, and tap each guest in as they arrive — or mark them as a no-show. A ticket photo can be attached when you need proof. Every check-in lands in your records live, and it keeps working on a weak signal: taps are saved and synced as soon as the connection returns.',
      },
      {
        id: 'guide-allocation',
        question: 'How are guests split between guides?',
        answer:
          'When several guides work the same tour, guests are balanced across them as check-ins come in, so no guide is overloaded. Guides and owners can still move a guest or lock a group by hand when something changes on the ground.',
      },
      {
        id: 'guide-arrival',
        question: 'How is guide punctuality measured?',
        answer:
          'A guide taps "I\'ve arrived" at the meeting point. When a meeting point is set for the tour, the arrival is verified against its location, and the time is compared with the guide\'s own check-in time. The owner can also mark a guide as location-exempt: they confirm arrival manually, their location is never requested, and punctuality is simply left out of their score — never counted against them.',
      },
      {
        id: 'guide-score',
        question: 'How are guides scored?',
        answer:
          'Guest reviews and on-time arrivals combine into one consistent score per guide. A part with no data yet is left out rather than counted as zero, so a new guide is never penalised for not having history.',
      },
      {
        id: 'guide-privacy',
        question: 'What can a guide see?',
        answer:
          'Only their own data. A guide sees their own tours, their own guest lists, their own pay, earnings and invoices, and their own score. They never see another guide\'s pay, and they never see the owner\'s finances, analytics or market intelligence.',
      },
      {
        id: 'guide-pay',
        question: 'How do guide payments and invoices work?',
        answer:
          'Every tour a guide works rolls into their earnings automatically, including any bonuses the owner adds. Monthly totals and invoices are tracked for you, and the owner records when each payment has been sent.',
      },
    ],
  },
  {
    id: 'data-privacy',
    title: 'Data & privacy',
    items: [
      {
        id: 'who-sees-what',
        question: 'Who can see my business data?',
        answer:
          'Your financial data, analytics and market intelligence are visible to the owner only. Guides are limited to their own tours, guests and pay — access rules are enforced on the server, not just hidden in the app.',
      },
      {
        id: 'ai-data',
        question: 'Does the AI change my data?',
        answer:
          'No. AI insights only read summaries of your data to answer questions; they never edit, delete or create anything. Every AI answer is labelled AI-generated.',
      },
      {
        id: 'location-data',
        question: 'What location data is collected from guides?',
        answer:
          'Only a single location reading at the moment a guide taps "I\'ve arrived", used to verify the arrival at the meeting point. There is no background tracking. For a guide the owner has marked as location-exempt, no location is requested or stored at all.',
      },
      {
        id: 'change-log',
        question: 'Can I see who changed what?',
        answer:
          'Yes. Owner edits — such as corrections to bookings and guide details — are recorded in a change log with the old and new values, so every correction can be traced.',
      },
    ],
  },
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      {
        id: 'how-to-start',
        question: 'How do I get started?',
        answer:
          'Start a free trial, connect your booking emails, add your products and invite your guides. If you would like a walkthrough, get in touch and we will set it up with you.',
      },
      {
        id: 'invite-guides',
        question: 'How do guides join?',
        answer:
          'The owner adds each guide and shares a personal claim link. The guide opens it, creates their login, and from then on sees only their own tours and pay.',
      },
      {
        id: 'devices',
        question: 'What devices does it work on?',
        answer:
          'Any modern phone, tablet or computer with a web browser — nothing to install. Guides can add AURELIA to their home screen for an app-like experience.',
      },
      {
        id: 'contact',
        question: 'How do I contact you?',
        answer:
          'Email shabirshabrez1998@gmail.com or call +33 7 55 09 15 24. We are happy to answer questions or walk you through the platform.',
      },
    ],
  },
];

/** Lower-cased, whitespace-split search terms; empty for a blank query. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** True when EVERY term appears (as a substring — partial words match) in the question or answer. */
export function faqItemMatches(item: FaqItem, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = `${item.question}\n${item.answer}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** Sections with only their matching items; sections left empty are dropped. */
export function filterFaqSections(sections: FaqSection[], query: string): FaqSection[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return sections;
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => faqItemMatches(i, terms)) }))
    .filter((s) => s.items.length > 0);
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits `text` into plain and matched runs for every search term (case-insensitive). Longer
    terms are tried first so "tour" wins over "to" where both would match the same text. */
export function highlightParts(text: string, terms: string[]): HighlightPart[] {
  if (terms.length === 0 || !text) return [{ text, match: false }];
  const pattern = [...new Set(terms)].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  return text
    .split(re)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, match: terms.some((t) => part.toLowerCase() === t) }));
}
