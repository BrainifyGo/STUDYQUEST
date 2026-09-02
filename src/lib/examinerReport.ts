import type { Board } from './examPaper';

/**
 * Mining public examiner reports for what students actually get wrong.
 *
 * Every summer the boards publish a report on each paper saying, in plain terms,
 * where candidates lost marks: what they confused, what they described when they
 * should have explained, which practical they clearly had not done. It is the
 * most honest teaching material in the system and almost nobody reads it,
 * because it is eleven pages of PDF written for teachers.
 *
 * TWO RULES, AND BOTH ARE ABSOLUTE.
 *
 * 1. THE REPORT TEXT IS NOT OURS. Every one carries "AQA retains the copyright
 *    on all its publications" or its equivalent. So StudyQuest stores the
 *    FINDING in its own words and a citation — never the report's sentences.
 *    `Insight.quote` does not exist, deliberately; there is nowhere to put
 *    copied text even by accident.
 *
 * 2. NO INSIGHT WITHOUT A SOURCE. An examiner insight is only worth anything
 *    because a real examiner wrote it about a real cohort. One the model made up
 *    is worse than nothing — it is a confident, unfalsifiable claim about the
 *    exam. So `Provenance` is required by the type, and `parseInsights` throws
 *    away anything it cannot attach to a source.
 */

export type Qualification = 'GCSE' | 'A-Level';

/** Where an insight came from. Required — see rule 2. */
export interface Provenance {
  board: Board;
  qualification: Qualification;
  subject: string;
  /** The board's code for the paper, e.g. "8461/1H". */
  paperCode: string;
  /** "June 2023". */
  session: string;
  /** The report on the board's own site. Students can go and read it. */
  url: string;
}

export type InsightKind =
  | 'mistake'          // what candidates got wrong
  | 'misconception'    // what they believed that was not true
  | 'rewarded'         // what the good answers did
  | 'command-word'     // described when it said explain, and so on
  | 'technique';       // exam craft: working, units, timing, legibility

export const KIND_LABELS: Record<InsightKind, string> = {
  mistake: 'Common mistake',
  misconception: 'Common misconception',
  rewarded: 'What examiners reward',
  'command-word': 'Command word trap',
  technique: 'Exam technique',
};

export interface Insight {
  id: string;
  /** The spec area, as a student would name it: "Osmosis", "Homeostasis". */
  topic: string;
  kind: InsightKind;
  /** What went wrong, in StudyQuest's words. One or two sentences. */
  issue: string;
  /** What to do about it. */
  practise: string;
  source: Provenance;
  created_at: string;
}

/* ── reading the report's own header ──────────────────────────────────────── */

export interface ReportMeta {
  board: Board | null;
  qualification: Qualification | null;
  subject: string | null;
  paperCode: string | null;
  session: string | null;
}

const BOARD_PATTERNS: [Board, RegExp][] = [
  ['AQA', /\bAQA\b/i],
  ['Edexcel', /\bEdexcel\b|\bPearson\b/i],
  ['OCR', /\bOCR\b|\bOxford Cambridge and RSA\b/i],
  ['WJEC', /\bWJEC\b|\bEduqas\b/i],
];

const SUBJECTS = [
  'Combined Science', 'Further Mathematics', 'English Language', 'English Literature',
  'Computer Science', 'Religious Studies', 'Design and Technology', 'Physical Education',
  'Mathematics', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography',
  'Business', 'Economics', 'Psychology', 'Sociology', 'French', 'Spanish', 'German',
];

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

/**
 * Read what a report is about from its own first page.
 *
 * Deliberately conservative: every field is null unless the text really says so.
 * A wrong attribution is worse than a missing one, because the whole value of an
 * insight is that it is traceable to a specific paper and cohort.
 */
export function readReportMeta(raw: string): ReportMeta {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  // Reports repeat their header; the first 1200 characters is where it lives.
  const head = text.slice(0, 1200);

  const board = BOARD_PATTERNS.find(([, re]) => re.test(head))?.[0] ?? null;

  const qualification: Qualification | null =
    /\bA-?level\b/i.test(head) ? 'A-Level' : /\bGCSE\b/i.test(head) ? 'GCSE' : null;

  const subject = [...SUBJECTS]
    .sort((a, b) => b.length - a.length)
    .find((s) => new RegExp(`\\b${s}\\b`, 'i').test(head)) ?? null;

  // "8461/1H", "1MA1/1H", "J560/01"
  const paperCode = head.match(/\b(\d{4}|[A-Z]\d{3}|\d[A-Z]{2}\d)\s*\/\s*(\d{1,2}[A-Z]?)\b/)
    ?.slice(1).join('/').replace(/\s/g, '') ?? null;

  /*
    Matched against a DE-SPACED copy of the header, because pdf.js injects
    spaces mid-word. This exact report's title line extracts as

        REPORT ON THE EXAMINATION - GCSE BIOLOGY - 8461/1H - J UNE 202 3

    so "June 2023" cannot be matched in the text as it actually arrives.
    Squashing the whitespace turns it into "JUNE2023", which can.
  */
  const squashed = head.replace(/\s+/g, '');
  const found = squashed.match(new RegExp(`(${MONTHS})(\\d{4})`, 'i'));
  const session = found
    ? `${found[1][0].toUpperCase()}${found[1].slice(1).toLowerCase()} ${found[2]}`
    : null;

  return { board, qualification, subject, paperCode, session };
}

/** Does this look like an examiner report rather than a paper or notes? */
export function looksLikeExaminerReport(raw: string): boolean {
  const text = String(raw ?? '').replace(/\s+/g, ' ');
  if (text.length < 400) return false;

  const titled = /report on the examination|examiners?.? report|principal examiner/i.test(text);
  const voice = (text.match(/\b(candidates|students)\b[^.]{0,60}\b(failed|were unable|did not|often|frequently|confused|omitted)\b/gi) || []).length;

  return titled || voice >= 3;
}

/* ── asking for the insights ──────────────────────────────────────────────── */

export function buildMiningPrompt(meta: ReportMeta, text: string, max = 8): string {
  const what = [meta.board, meta.qualification, meta.subject, meta.paperCode]
    .filter(Boolean).join(' ');

  return `Below is a public examiner report${what ? ` for ${what}` : ''}${
    meta.session ? ` (${meta.session})` : ''}.

Pull out up to ${max} things a student could act on before their exam.

WRITE EVERY ONE IN YOUR OWN WORDS.
The report is the exam board's copyright. Do not quote it, and do not lightly
reword its sentences — say what the finding MEANS for a student revising now.

Only report what this document actually says. If it does not discuss a topic, do
not invent a finding about it. Fewer, real insights beat a full list.

Each insight needs:
  topic     the spec area a student would recognise — "Osmosis", "Electrolysis"
  kind      one of: mistake, misconception, rewarded, command-word, technique
  issue     what went wrong for candidates, in one or two plain sentences
  practise  what this student should do about it, concretely

Reply with ONLY a JSON array, no prose and no code fence:
[
  { "topic": "...", "kind": "mistake", "issue": "...", "practise": "..." }
]

THE REPORT:
${text.slice(0, 24_000)}`;
}

const KINDS: InsightKind[] = ['mistake', 'misconception', 'rewarded', 'command-word', 'technique'];

/** Shorter than this is a label, not a finding. */
const MIN_ISSUE = 25;
const MIN_PRACTISE = 15;

export interface MinedInsights {
  insights: Insight[];
  rejected: { index: number; reason: string }[];
}

/**
 * Read the mined insights, and refuse anything that cannot stand up.
 *
 * `source` is applied here rather than trusted from the model, so every insight
 * that survives is attached to the report it actually came from. There is no
 * path through this function that produces an unattributed insight.
 */
export function parseInsights(raw: string, source: Provenance): MinedInsights {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('The miner returned nothing.');
  }
  if (!source?.board || !source?.url) {
    // Rule 2, enforced at the only door in.
    throw new Error('Refusing to store an insight with no source report.');
  }

  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('The miner did not return a list.');

  let rows: unknown;
  try {
    rows = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The miner returned something unreadable.');
  }
  if (!Array.isArray(rows)) throw new Error('The miner did not return a list.');

  const insights: Insight[] = [];
  const rejected: { index: number; reason: string }[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  rows.forEach((row, i) => {
    const r = row as Record<string, unknown>;
    const topic = String(r?.topic ?? '').trim();
    const issue = String(r?.issue ?? '').trim();
    const practise = String(r?.practise ?? '').trim();
    const kind = String(r?.kind ?? '').trim().toLowerCase() as InsightKind;

    if (!topic) return void rejected.push({ index: i, reason: 'no topic' });
    if (issue.length < MIN_ISSUE) return void rejected.push({ index: i, reason: 'issue too vague' });
    if (practise.length < MIN_PRACTISE) {
      return void rejected.push({ index: i, reason: 'nothing to practise' });
    }
    if (!KINDS.includes(kind)) return void rejected.push({ index: i, reason: `unknown kind "${kind}"` });

    const key = `${topic.toLowerCase()}|${issue.toLowerCase().slice(0, 60)}`;
    if (seen.has(key)) return void rejected.push({ index: i, reason: 'duplicate' });
    seen.add(key);

    insights.push({
      id: `${source.board}-${source.paperCode || 'x'}-${source.session || 'x'}-${insights.length + 1}`
        .toLowerCase().replace(/[^a-z0-9-]/g, ''),
      topic,
      kind,
      issue: issue.slice(0, 600),
      practise: practise.slice(0, 400),
      source,
      created_at: now,
    });
  });

  if (!insights.length) throw new Error('Nothing usable came out of that report.');
  return { insights, rejected };
}

/** "AQA GCSE Biology 8461/1H, June 2023" — the line shown under an insight. */
export function citation(s: Provenance): string {
  return [
    [s.board, s.qualification, s.subject].filter(Boolean).join(' '),
    s.paperCode,
  ].filter(Boolean).join(' ') + (s.session ? `, ${s.session}` : '');
}

/* ── connecting insights to this student ──────────────────────────────────── */

/**
 * Insights that match a mistake this student keeps making.
 *
 * THIS IS THE POINT. A page of examiner insights is a nicer PDF. The feature only
 * earns its place when the app can say "the thing you keep doing is the thing
 * examiners write about every year" — at the moment it happens, about that topic.
 *
 * Matching is on topic, deliberately loose in one direction only: an insight
 * about "Osmosis and diffusion" matches a student weak on "Osmosis", but never
 * the reverse, so a broad student topic cannot drag in unrelated insights.
 */
export function insightsForTopics(all: Insight[], topics: string[]): Insight[] {
  const wanted = (topics ?? [])
    .map((t) => String(t ?? '').trim().toLowerCase())
    .filter((t) => t.length > 2);
  if (!wanted.length) return [];

  return (all ?? []).filter((insight) => {
    const t = insight.topic.toLowerCase();
    return wanted.some((w) => t === w || t.includes(w));
  });
}

const KIND_PRIORITY: InsightKind[] = ['command-word', 'misconception', 'mistake', 'technique', 'rewarded'];

/**
 * Insights whose topic is mentioned in a question the student just answered.
 *
 * A DIFFERENT DIRECTION FROM `insightsForTopics`, and the difference is the
 * whole reason this exists separately.
 *
 * `insightsForTopics` takes topics and asks whether an insight is about one of
 * them. This takes a QUESTION and asks whether an insight's topic appears in it.
 * Passing question text to the other one matches nothing at all — an insight
 * topic of "Osmosis" never contains eighty characters of exam question — and it
 * fails silently, which is the worst way for a feature to not work.
 *
 * Matching is on whole words, so an insight about "Ion" does not fire on every
 * question containing "ionisation", and a real two-character topic like "pH"
 * still works — it will not match inside "graph", because there is no word
 * boundary there.
 */
export function insightsForQuestion(all: Insight[], questionText: string): Insight[] {
  const text = String(questionText ?? '').toLowerCase();
  if (text.length < 10) return [];

  return (all ?? []).filter((insight) => {
    const topic = insight.topic.toLowerCase().trim();
    // One character is noise; two is "pH", which is a real topic.
    if (topic.length < 2) return false;
    return new RegExp(`\\b${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  });
}

/** The most actionable insight for a question, or null. */
export function topInsightForQuestion(all: Insight[], questionText: string): Insight | null {
  const matches = insightsForQuestion(all, questionText);
  if (!matches.length) return null;
  return [...matches].sort(
    (a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind),
  )[0];
}

/**
 * The single most useful insight for a student, or null.
 *
 * Ranked by kind rather than recency: a command-word trap they keep falling into
 * is more actionable before an exam than a general note about technique, and
 * both beat being told what good answers look like.
 */
export function topInsight(all: Insight[], topics: string[]): Insight | null {
  const matches = insightsForTopics(all, topics);
  if (!matches.length) return null;
  return [...matches].sort(
    (a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind),
  )[0];
}
