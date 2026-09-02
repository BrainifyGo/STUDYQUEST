/**
 * Mining public examiner reports.
 *
 * Two rules are absolute here, and most of this file guards them.
 *
 * THE REPORT TEXT IS NOT OURS. Every report says so on its own first page. The
 * `Insight` type has no field to put copied text in, and the prompt says to
 * write findings rather than reword sentences.
 *
 * NO INSIGHT WITHOUT A SOURCE. An examiner insight is worth something only
 * because a real examiner wrote it about a real cohort. An invented one is worse
 * than nothing: a confident, unfalsifiable claim about the exam.
 *
 * The header fixture is transcribed from a real AQA GCSE Biology report
 * (8461/1H, June 2023) EXACTLY as pdf.js extracts it, spacing damage included.
 */
import { describe, expect, it } from 'vitest';
import {
  KIND_LABELS,
  buildMiningPrompt, citation, insightsForTopics, looksLikeExaminerReport,
  parseInsights, readReportMeta, topInsight,
  type Insight, type InsightKind, type Provenance,
} from '../src/lib/examinerReport';

/** Verbatim from the real PDF, spacing artefacts and all. */
const REAL_HEADER =
  'GCSE BIOLOGY 8461/1H Paper 1 Higher tier R eport on the Examination 8461 /1H June 202 3 '
  + 'Version: 1.0 Further copies of this Report are available from aqa.org.uk '
  + 'Copyright © 20 2 3 AQA and its licensors. All rights reserved. AQA retains the copyright '
  + 'on all its publications. REPORT ON THE EXAMINATION – GCSE BIOLOGY – 8461/1H – J UNE 202 3 '
  + 'General comments: There were six questions on this paper. While the standard of performance '
  + 'in practical-based questions showed an improvement on previous years, it was sadly noticeable '
  + 'when a student had not been given the opportunity to carry out required practical activities. '
  + 'Students were noticeably less able to access questions that assessed essential methods. '
  + 'Candidates frequently confused osmosis with diffusion and did not refer to a partially '
  + 'permeable membrane. Many students described the trend rather than explaining it.';

const source: Provenance = {
  board: 'AQA',
  qualification: 'GCSE',
  subject: 'Biology',
  paperCode: '8461/1H',
  session: 'June 2023',
  url: 'https://www.aqa.org.uk/files/example.pdf',
};

const rows = (...items: Record<string, unknown>[]) => JSON.stringify(items);

const good = {
  topic: 'Osmosis',
  kind: 'misconception',
  issue: 'Candidates repeatedly confused osmosis with diffusion and left out the partially permeable membrane.',
  practise: 'Write the definition including the membrane, then three questions comparing the two.',
};

describe('reading what a report is about', () => {
  it('reads all five fields off a real AQA report', () => {
    expect(readReportMeta(REAL_HEADER)).toEqual({
      board: 'AQA',
      qualification: 'GCSE',
      subject: 'Biology',
      paperCode: '8461/1H',
      session: 'June 2023',
    });
  });

  it('finds the session despite pdf.js splitting the words apart', () => {
    /*
      THE BUG THE REAL FILE FOUND. Extraction turns "JUNE 2023" into "J UNE 202 3",
      so the session was unmatchable and came back null until the match was run
      against a de-spaced copy of the header. No fixture would have shown this.
    */
    expect(readReportMeta('Report on the Examination 8461/1H J UNE 202 3').session)
      .toBe('June 2023');
    expect(readReportMeta('Report on the Examination November 2020').session)
      .toBe('November 2020');
  });

  it('says null rather than guessing', () => {
    // A wrong attribution is worse than a missing one — the whole value of an
    // insight is that it traces to a specific paper and cohort.
    expect(readReportMeta('Some revision notes about cells')).toEqual({
      board: null, qualification: null, subject: null, paperCode: null, session: null,
    });
    expect(readReportMeta('')).toMatchObject({ board: null });
  });

  it('prefers the longer subject name', () => {
    expect(readReportMeta('OCR GCSE Computer Science J277/01 June 2023').subject)
      .toBe('Computer Science');
  });

  it('recognises an examiner report, and not a paper or notes', () => {
    expect(looksLikeExaminerReport(REAL_HEADER)).toBe(true);
    expect(looksLikeExaminerReport('1 Work out 0.7 x 0.5 [1 mark] 2 Solve 2x < 26 [1 mark]'))
      .toBe(false);
    expect(looksLikeExaminerReport('')).toBe(false);
  });
});

describe('what the miner is told', () => {
  it('forbids quoting, because the report is the board\'s copyright', () => {
    const p = buildMiningPrompt(readReportMeta(REAL_HEADER), REAL_HEADER);
    expect(p).toMatch(/your own words/i);
    expect(p).toMatch(/do not quote/i);
    expect(p).toMatch(/copyright/i);
  });

  it('forbids inventing findings the report does not contain', () => {
    const p = buildMiningPrompt(readReportMeta(REAL_HEADER), REAL_HEADER);
    // \s+ rather than a space: the prompt is a template literal and wraps
    // mid-phrase. Where the line breaks is formatting, not meaning.
    expect(p).toMatch(/do\s+not\s+invent/i);
    expect(p).toMatch(/fewer,\s+real\s+insights/i);
  });

  it('tells it what the report is, so the insights land in context', () => {
    const p = buildMiningPrompt(readReportMeta(REAL_HEADER), REAL_HEADER);
    expect(p).toContain('AQA GCSE Biology 8461/1H');
    expect(p).toContain('June 2023');
  });
});

describe('nothing is stored without a source', () => {
  it('REFUSES outright when there is no source report', () => {
    /*
      The rule the whole feature rests on, enforced at the only door in. An
      insight with no provenance is a confident claim about the exam that nobody
      can check — worse than having no insights at all.
    */
    expect(() => parseInsights(rows(good), {} as Provenance))
      .toThrow(/no source report/i);
    expect(() => parseInsights(rows(good), { ...source, url: '' }))
      .toThrow(/no source report/i);
  });

  it('attaches the source itself rather than trusting the model', () => {
    const { insights } = parseInsights(rows(good), source);
    expect(insights[0].source).toEqual(source);
  });

  it('ignores a source the model tries to supply', () => {
    const forged = { ...good, source: { board: 'OCR', url: 'https://example.com/made-up' } };
    const { insights } = parseInsights(rows(forged), source);
    expect(insights[0].source.board).toBe('AQA');
    expect(insights[0].source.url).toBe(source.url);
  });

  it('has nowhere to put copied report text', () => {
    // `quote` does not exist on Insight, deliberately — there is no field to
    // accidentally fill with the board's sentences.
    const { insights } = parseInsights(rows({ ...good, quote: 'verbatim from the report' }), source);
    expect(insights[0]).not.toHaveProperty('quote');
    expect(JSON.stringify(insights[0])).not.toContain('verbatim from the report');
  });
});

describe('throwing away what cannot stand up', () => {
  it('drops an insight with no topic to attach it to', () => {
    const { insights, rejected } = parseInsights(rows(good, { ...good, topic: '' }), source);
    expect(insights).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/no topic/i);
  });

  it('drops a finding too vague to act on', () => {
    const { insights, rejected } = parseInsights(
      rows(good, { ...good, topic: 'Cells', issue: 'Some errors.' }), source);
    expect(insights).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/vague/i);
  });

  it('drops one with nothing to practise', () => {
    const { rejected } = parseInsights(
      rows(good, { ...good, topic: 'Cells', practise: 'Revise.' }), source);
    expect(rejected[0].reason).toMatch(/practise/i);
  });

  it('drops a kind it does not recognise', () => {
    const { rejected } = parseInsights(
      rows(good, { ...good, topic: 'Cells', kind: 'vibes' }), source);
    expect(rejected[0].reason).toMatch(/unknown kind/i);
  });

  it('drops repeats', () => {
    const { insights, rejected } = parseInsights(rows(good, good), source);
    expect(insights).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicate/i);
  });

  it('THROWS rather than showing an empty insights page', () => {
    expect(() => parseInsights(rows({ topic: '', issue: '', practise: '' }), source))
      .toThrow(/nothing usable/i);
    for (const bad of ['', 'I could not read it', '[broken', '{"not":"a list"}']) {
      expect(() => parseInsights(bad, source), JSON.stringify(bad)).toThrow();
    }
  });

  it('labels every kind it accepts', () => {
    for (const k of Object.keys(KIND_LABELS) as InsightKind[]) {
      expect(KIND_LABELS[k], k).toBeTruthy();
    }
  });
});

describe('connecting an insight to this student', () => {
  const make = (topic: string, kind: InsightKind): Insight => ({
    id: `i-${topic}-${kind}`.toLowerCase(),
    topic, kind,
    issue: 'Candidates repeatedly got this wrong in a way worth describing here.',
    practise: 'Do three questions on it and check the wording.',
    source,
    created_at: '2026-09-02T00:00:00.000Z',
  });

  const all = [
    make('Osmosis', 'misconception'),
    make('Osmosis and diffusion', 'command-word'),
    make('Electrolysis', 'mistake'),
    make('Homeostasis', 'technique'),
  ];

  it('matches the topics a student is weak on', () => {
    /*
      THE POINT OF THE WHOLE FEATURE. A page of examiner insights is a nicer PDF.
      It earns its place when the app can say "the thing you keep doing is the
      thing examiners write about every year" — about that topic, at that moment.
    */
    const found = insightsForTopics(all, ['Osmosis']);
    expect(found.map((i) => i.topic))
      .toEqual(['Osmosis', 'Osmosis and diffusion']);
  });

  it('does not let a broad student topic drag in unrelated insights', () => {
    // "Biology" must not match every biology insight ever written.
    expect(insightsForTopics(all, ['Biology'])).toEqual([]);
  });

  it('is case insensitive and ignores useless topics', () => {
    expect(insightsForTopics(all, ['ELECTROLYSIS'])).toHaveLength(1);
    expect(insightsForTopics(all, ['', '  ', 'a'])).toEqual([]);
    expect(insightsForTopics([], ['Osmosis'])).toEqual([]);
  });

  it('picks the most actionable one before an exam', () => {
    // A command-word trap beats a note on what good answers look like.
    expect(topInsight(all, ['Osmosis'])!.kind).toBe('command-word');
  });

  it('returns null rather than something irrelevant', () => {
    expect(topInsight(all, ['Photosynthesis'])).toBeNull();
    expect(topInsight([], ['Osmosis'])).toBeNull();
  });
});

describe('showing where it came from', () => {
  it('cites the paper and the session', () => {
    expect(citation(source)).toBe('AQA GCSE Biology 8461/1H, June 2023');
  });

  it('copes with a partial source', () => {
    expect(citation({ ...source, paperCode: '', session: '' }))
      .toBe('AQA GCSE Biology');
  });
});
