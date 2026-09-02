/**
 * Writing a practice paper rather than reproducing one.
 *
 * Two things are being guarded, and only one of them is code.
 *
 * The first is legal, and it lives in the prompt: these have to be ORIGINAL
 * questions. Real papers belong to the exam boards; questions written in the
 * style of a specification do not. A test cannot prove a model obeyed that, but
 * it can prove we asked — and if that instruction is ever dropped from the
 * prompt, this suite says so.
 *
 * The second is that nothing unusable reaches a student. A question with no
 * marks cannot be marked, a fragment cannot be answered, and a 40-mark question
 * is a misread of the format. All three would otherwise arrive looking real and
 * then behave strangely.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUESTIONS, MAX_QUESTIONS, MIN_QUESTIONS,
  buildPaperPrompt, clampCount, paperTitle, parseGeneratedPaper, specId, totalMarks,
  type PaperSpec,
} from '../src/lib/generatePaper';

const spec = (over: Partial<PaperSpec> = {}): PaperSpec => ({
  subject: 'Chemistry', count: 6, ...over,
});

const json = (rows: unknown) => JSON.stringify(rows);

describe('the instruction that makes this legal at all', () => {
  it('demands original questions, in as many words', () => {
    /*
      A model asked for "a past paper question" will happily try to reproduce a
      real one from memory, and reproducing an exam board's question is exactly
      what StudyQuest must not do. This is the line that prevents it.
    */
    const p = buildPaperPrompt(spec());
    expect(p).toMatch(/ORIGINAL/);
    expect(p).toMatch(/do not reproduce/i);
    expect(p).toMatch(/write a different one/i);
  });

  it('asks for the style of the specification, not the content of a paper', () => {
    expect(buildPaperPrompt(spec())).toMatch(/same specification content in the same style/i);
  });
});

describe('what the paper is asked to look like', () => {
  it('names the subject and topic', () => {
    const p = buildPaperPrompt(spec({ topic: 'electrolysis', board: 'AQA' }));
    expect(p).toContain('electrolysis');
    expect(p).toContain('AQA');
  });

  it('ties marks to the command word, because that is what real papers do', () => {
    const p = buildPaperPrompt(spec());
    expect(p).toMatch(/"State" is worth 1/);
    expect(p).toMatch(/"Evaluate" is worth 6/);
    expect(p).toMatch(/vary the marks/i);
  });

  it('carries the student level and tier through', () => {
    const p = buildPaperPrompt(spec({ level: 'Year 11, set 1 of 4 for Chemistry.', tier: 'Higher' }));
    expect(p).toContain('Year 11, set 1 of 4');
    expect(p).toMatch(/Higher tier/);
  });

  it('rules out what cannot be answered in a text box', () => {
    const p = buildPaperPrompt(spec());
    expect(p).toMatch(/no multiple choice/i);
    expect(p).toMatch(/no diagrams/i);
  });

  it('keeps the count sane whatever it is handed', () => {
    expect(clampCount(1)).toBe(MIN_QUESTIONS);
    expect(clampCount(500)).toBe(MAX_QUESTIONS);
    expect(clampCount('lots')).toBe(DEFAULT_QUESTIONS);
    expect(clampCount(undefined)).toBe(DEFAULT_QUESTIONS);
    expect(clampCount(6)).toBe(6);
  });
});

describe('reading back what the model wrote', () => {
  const good = [
    { number: '1', text: 'State one use of electrolysis in industry.', marks: 1 },
    { number: '2', text: 'Explain why molten lead bromide conducts electricity.', marks: 3 },
    { number: '3', text: 'Calculate the mass of copper deposited when 0.5 mol of electrons pass.', marks: 4 },
  ];

  it('reads a clean reply', () => {
    const paper = parseGeneratedPaper(json(good));
    expect(paper.questions).toHaveLength(3);
    expect(paper.questions[1].text).toMatch(/molten lead bromide/);
    expect(paper.questions[1].marks).toBe(3);
    expect(paper.rejected).toEqual([]);
  });

  it('digs it out of a fence and a sentence of preamble', () => {
    const paper = parseGeneratedPaper(`Here you go!\n\`\`\`json\n${json(good)}\n\`\`\``);
    expect(paper.questions).toHaveLength(3);
  });

  it('renumbers in sequence', () => {
    // A model that skips from 3 to 5 leaves a paper that looks like it lost a page.
    const paper = parseGeneratedPaper(json([
      { number: '1', text: 'State one use of electrolysis in industry.', marks: 1 },
      { number: '7', text: 'Explain why molten lead bromide conducts.', marks: 3 },
    ]));
    expect(paper.questions.map((q) => q.number)).toEqual(['1', '2']);
  });

  it('adds up the marks', () => {
    expect(totalMarks(parseGeneratedPaper(json(good)).questions)).toBe(8);
  });
});

describe('nothing unusable reaches the student', () => {
  it('drops a question with no marks, because it cannot be marked', () => {
    const paper = parseGeneratedPaper(json([
      { number: '1', text: 'Explain why ionic compounds conduct when molten.', marks: 3 },
      { number: '2', text: 'Describe the test for chlorine gas in a laboratory.' },
    ]));
    expect(paper.questions).toHaveLength(1);
    expect(paper.rejected[0].reason).toMatch(/no marks/i);
  });

  it('drops a fragment, because it cannot be answered', () => {
    const paper = parseGeneratedPaper(json([
      { number: '1', text: 'Explain why ionic compounds conduct when molten.', marks: 3 },
      { number: '2', text: 'Why?', marks: 2 },
    ]));
    expect(paper.questions).toHaveLength(1);
    expect(paper.rejected[0].reason).toMatch(/too short/i);
  });

  it('drops a mark allocation that is not a GCSE question', () => {
    const paper = parseGeneratedPaper(json([
      { number: '1', text: 'Explain why ionic compounds conduct when molten.', marks: 3 },
      { number: '2', text: 'Evaluate the entire history of chemistry as a discipline.', marks: 80 },
      { number: '3', text: 'State the formula for sodium chloride please.', marks: 0 },
    ]));
    expect(paper.questions).toHaveLength(1);
    expect(paper.rejected).toHaveLength(2);
  });

  it('drops a repeat, which models produce more than you would hope', () => {
    const paper = parseGeneratedPaper(json([
      { number: '1', text: 'Explain why molten lead bromide conducts electricity.', marks: 3 },
      { number: '2', text: 'Explain  why molten lead bromide conducts electricity.', marks: 3 },
    ]));
    expect(paper.questions).toHaveLength(1);
    expect(paper.rejected[0].reason).toMatch(/duplicate/i);
  });

  it('THROWS when nothing survives, rather than showing an empty paper', () => {
    /*
      An empty paper is worse than an error: the student sits looking at a
      screen that says nothing is wrong and offers nothing to do.
    */
    expect(() => parseGeneratedPaper(json([{ text: 'no', marks: 900 }]))).toThrow(/usable/i);
  });

  it('THROWS on a reply it cannot read at all', () => {
    for (const bad of ['', '   ', 'I cannot do that', '[broken', '{"not":"a list"}']) {
      expect(() => parseGeneratedPaper(bad), JSON.stringify(bad)).toThrow();
    }
    expect(() => parseGeneratedPaper(null as unknown as string)).toThrow();
  });
});

describe('naming and finding a paper again', () => {
  it('titles it from what was asked for', () => {
    expect(paperTitle(spec({ board: 'AQA', topic: 'Electrolysis' })))
      .toBe('AQA · Electrolysis practice');
    expect(paperTitle(spec())).toBe('Chemistry practice');
  });

  it('gives the same spec the same id on the same day, so reloading resumes', () => {
    const day = new Date(2026, 8, 2);
    expect(specId(spec({ topic: 'moles' }), day)).toBe(specId(spec({ topic: 'moles' }), day));
  });

  it('gives a fresh id tomorrow, so a new day means new questions', () => {
    expect(specId(spec(), new Date(2026, 8, 2)))
      .not.toBe(specId(spec(), new Date(2026, 8, 3)));
  });

  it('separates different topics', () => {
    const day = new Date(2026, 8, 2);
    expect(specId(spec({ topic: 'moles' }), day)).not.toBe(specId(spec({ topic: 'alkanes' }), day));
  });

  it('produces an id safe to use as a document key', () => {
    const id = specId(spec({ subject: 'English Lit / Language', topic: 'Macbeth (Act 1)' }));
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
