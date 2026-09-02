/**
 * Splitting a student's own past paper into practisable questions.
 *
 * The fixtures below are written the way pdf.js actually hands text over —
 * one space-joined line per page, no newlines, page furniture sitting in the
 * middle of sentences. Testing against tidy text would pass here and fail on
 * every real upload.
 *
 * The question in `EDEXCEL_MATHS` is transcribed from the paper in RED's own
 * recording, including its "(Total for Question 14 is 2 marks)" line.
 */
import { describe, expect, it } from 'vitest';
import {
  bodyOf, detectBoard, detectSubject, looksLikeExamPaper, marksIn, parseExamPaper, tidy,
} from '../src/lib/examPaper';

/** Realistic pdf.js output: one page, everything space-joined. */
const EDEXCEL_MATHS =
  '*P72844A0328* DO NOT WRITE IN THIS AREA Answer ALL questions. Write your answers in the ' +
  'spaces provided. You must write down all the stages in your working. ' +
  '1 Work out 3.7 × 4.2 (Total for Question 1 is 2 marks) ' +
  '2 Simplify fully 5a + 3b - 2a + b (Total for Question 2 is 2 marks) ' +
  '3 The table shows the number of hours worked. Find the median. (Total for Question 3 is 3 marks) ' +
  'Turn over ► ' +
  '4 (a) Write 0.000 45 in standard form. (1) ' +
  '4 (b) Work out (3 × 10^5) ÷ (6 × 10^2). Give your answer in standard form. (2) ' +
  '(Total for Question 4 is 3 marks) ' +
  '5 On the grid, sketch the curve with equation y = 2^x. Give the coordinates of any points ' +
  'of intersection with the axes. (Total for Question 5 is 2 marks) ' +
  '© 2023 Pearson Education Ltd';

const AQA_BIOLOGY =
  'AQA GCSE Biology Paper 1 Higher Tier Time allowed: 1 hour 45 minutes ' +
  '1 Figure 1 shows a plant cell. 1 (a) Name structure X. [1 mark] ' +
  '1 (b) Explain how the cell wall supports the plant. [3 marks] ' +
  '2 A student investigated osmosis in potato cylinders. Describe the method. [4 marks] ' +
  '3 Enzymes are biological catalysts. Explain the effect of temperature on enzyme activity. [6 marks]';

describe('cleaning up what pdf.js hands over', () => {
  it('strips page furniture that lands mid-sentence', () => {
    const t = tidy(EDEXCEL_MATHS);
    expect(t).not.toMatch(/DO NOT WRITE IN THIS AREA/i);
    expect(t).not.toMatch(/Turn over/i);
    expect(t).not.toMatch(/\*P72844A0328\*/);
    expect(t).not.toMatch(/Answer ALL questions/i);
    // and the actual questions survive
    expect(t).toContain('Work out 3.7 × 4.2');
  });

  it('collapses the whitespace pdf extraction leaves behind', () => {
    expect(tidy('a   b \n\n  c')).toBe('a b c');
  });

  it('never throws on rubbish input', () => {
    expect(tidy('')).toBe('');
    expect(tidy(null as unknown as string)).toBe('');
    expect(tidy(undefined as unknown as string)).toBe('');
    expect(tidy(42 as unknown as string)).toBe('');
  });
});

describe('is this a past paper at all?', () => {
  it('recognises one', () => {
    expect(looksLikeExamPaper(EDEXCEL_MATHS)).toBe(true);
    expect(looksLikeExamPaper(AQA_BIOLOGY)).toBe(true);
  });

  it('does not mistake ordinary notes for one', () => {
    // THE ONE THAT MATTERS IN THE OTHER DIRECTION. Getting this wrong sends
    // someone's revision notes into a practice flow that makes no sense for
    // them, and the existing summary path is the right one for notes.
    const notes =
      'Photosynthesis happens in the chloroplasts. The equation is carbon dioxide plus water ' +
      'goes to glucose plus oxygen, using light energy. Chlorophyll absorbs mainly red and ' +
      'blue light which is why leaves look green. Factors affecting the rate include light ' +
      'intensity, carbon dioxide concentration and temperature.';
    expect(looksLikeExamPaper(notes)).toBe(false);
  });

  it('is not fooled by a single stray "marks"', () => {
    expect(looksLikeExamPaper('I got 45 marks in my mock which was a grade 6 overall.')).toBe(false);
  });

  it('says no to something too short to judge', () => {
    expect(looksLikeExamPaper('1 Work out 2 + 2 (1 mark)')).toBe(false);
    expect(looksLikeExamPaper('')).toBe(false);
  });
});

describe('reading what a question is worth', () => {
  it('reads the Edexcel total line', () => {
    expect(marksIn('Work out 3.7 × 4.2 (Total for Question 1 is 2 marks)')).toBe(2);
  });

  it('prefers the total line over a number inside the question', () => {
    // "3 marks" appears twice here; the total is the authoritative one.
    expect(marksIn('Each box is worth 3 marks. (Total for Question 7 is 5 marks)')).toBe(5);
  });

  it('reads AQA square brackets and the singular', () => {
    expect(marksIn('Name structure X. [1 mark]')).toBe(1);
    expect(marksIn('Explain the effect of temperature. [6 marks]')).toBe(6);
  });

  it('reads a bare trailing bracket only at the end', () => {
    expect(marksIn('Write 0.000 45 in standard form. (1)')).toBe(1);
    // Mid-sentence brackets are not mark allocations.
    expect(marksIn('Expand (2) times (x + 3) and simplify fully.')).toBeNull();
  });

  it('returns null rather than guessing', () => {
    expect(marksIn('Describe what happens next.')).toBeNull();
  });

  it('rejects readings that cannot be a single question', () => {
    expect(marksIn('(0 marks)')).toBeNull();
    expect(marksIn('(80 marks)')).toBeNull();     // that is a whole paper
  });
});

describe('splitting a paper into questions', () => {
  it('finds every question in the Edexcel paper', () => {
    const paper = parseExamPaper(EDEXCEL_MATHS);
    const numbers = paper.questions.map((q) => q.number);
    expect(numbers).toEqual(['1', '2', '3', '4(a)', '4(b)', '5']);
  });

  it('keeps each question with its own marks', () => {
    const paper = parseExamPaper(EDEXCEL_MATHS);
    const byNumber = Object.fromEntries(paper.questions.map((q) => [q.number, q.marks]));
    expect(byNumber['1']).toBe(2);
    expect(byNumber['3']).toBe(3);
    expect(byNumber['4(a)']).toBe(1);
    expect(byNumber['4(b)']).toBe(2);
  });

  it('keeps the wording of the question itself', () => {
    const paper = parseExamPaper(EDEXCEL_MATHS);
    const q5 = paper.questions.find((q) => q.number === '5')!;
    expect(q5.text).toContain('sketch the curve with equation');
    expect(q5.text).toContain('points of intersection with the axes');
  });

  it('handles AQA numbering too', () => {
    const paper = parseExamPaper(AQA_BIOLOGY);
    expect(paper.questions.map((q) => q.number)).toEqual(['1', '1(a)', '1(b)', '2', '3']);
    expect(paper.questions.find((q) => q.number === '3')!.marks).toBe(6);
  });

  it('ignores numbers that appear inside a sentence', () => {
    /*
      THE FAILURE THIS IS BUILT AGAINST. A bare digit followed by a capital is
      the only boundary signal left once the line breaks are gone, so "…in 2
      Simplify…" inside prose would split a question in half. Real question
      numbers run in order, so anything out of sequence is dropped.
    */
    const tricky =
      '1 A shop sells 3 Apples for 90p. Work out the cost of 7 Apples. (Total for Question 1 is 2 marks) ' +
      '2 Solve 5x = 20 (Total for Question 2 is 1 mark)';
    const paper = parseExamPaper(tricky);
    expect(paper.questions.map((q) => q.number)).toEqual(['1', '2']);
    expect(paper.questions[0].text).toContain('cost of 7 Apples');
  });

  it('adds up only the marks it could actually read', () => {
    expect(parseExamPaper(EDEXCEL_MATHS).totalMarks).toBe(2 + 2 + 3 + 1 + 2 + 2);
  });

  it('returns nothing rather than nonsense for notes', () => {
    const paper = parseExamPaper('Just some revision notes about the water cycle and evaporation.');
    expect(paper.questions).toEqual([]);
    expect(paper.totalMarks).toBeNull();
  });

  it('survives empty and malformed input', () => {
    expect(parseExamPaper('').questions).toEqual([]);
    expect(parseExamPaper(null as unknown as string).questions).toEqual([]);
  });
});

describe('the cover page', () => {
  /*
    CAUGHT ON REALISTIC TEXT, NOT ON A FIXTURE. A real Edexcel front page says
    "Paper 1 (Non-Calculator)", and a digit followed by a capital is exactly the
    boundary signal this parser relies on — so "Paper 1" became question 1 and
    the genuine question 1 was swallowed into it. Every board prints an
    instruction block right before question 1, so that is the real starting line.
  */
  const COVER =
    'Pearson Edexcel GCSE (9-1) Mathematics Paper 1 (Non-Calculator) Higher Tier ' +
    'Time: 1 hour 30 minutes You must have: Ruler, pen, HB pencil. ' +
    'Answer ALL questions. Write your answers in the spaces provided. ' +
    'You must write down all the stages in your working. ' +
    '1 Write 0.037 as a fraction in its simplest form. (Total for Question 1 is 2 marks) ' +
    '2 Solve 4x + 7 = 2x + 19 (Total for Question 2 is 2 marks)';

  it('does not turn "Paper 1" into question 1', () => {
    const paper = parseExamPaper(COVER);
    expect(paper.questions).toHaveLength(2);
    expect(paper.questions[0].text).toContain('Write 0.037 as a fraction');
    expect(paper.questions[0].text).not.toContain('Non-Calculator');
  });

  it('still reads the board and subject, which are printed on that cover', () => {
    const paper = parseExamPaper(COVER);
    expect(paper.board).toBe('Edexcel');
    expect(paper.subject).toBe('Mathematics');
  });

  it('handles the AQA cover, worded nothing like the Edexcel one', () => {
    /*
      Transcribed from a real AQA GCSE Maths paper (8300/1H, June 2023) — the one
      RED linked. The first version of this only knew Edexcel's phrasing, so the
      cut landed halfway through the cover and question 1 came out as
      "1 Non - Calculator Please write clearly in block capitals…".
    */
    const aqa =
      '* jun2383001H01 * IB/M/Jun23/E8 8300/1H GCSE MATHEMATICS Higher Tier Paper 1 ' +
      'Please write clearly in block capitals. Centre number Candidate number ' +
      'AQA Realising potential For Examiner’s Use Pages Mark 2–3 4–5 TOTAL ' +
      'Friday 19 May 2023 Morning Time allowed: 1 hour 30 minutes Materials For this paper you ' +
      'must have: mathematical instruments. You must not use a calculator. ' +
      'Instructions Use black ink or black ball-point pen. Fill in the boxes at the top of this page. ' +
      'Answer all questions. You must answer the questions in the spaces provided. ' +
      'Do all rough work in this book. Cross through any work you do not want to be marked. ' +
      'Information The marks for questions are shown in brackets. The maximum mark for this paper is 80. ' +
      '1 (a) Work out 0.7 × 0.5 [1 mark] Answer ' +
      '1 (b) Work out 27 ÷ 0.6 [1 mark] Answer ' +
      '2 Solve 2x < 26 [1 mark] Answer';

    const paper = parseExamPaper(aqa);
    expect(paper.board).toBe('AQA');
    expect(paper.questions[0].text).toContain('Work out 0.7');
    expect(paper.questions[0].text).not.toMatch(/block capitals|Examiner|Time allowed/i);
    expect(paper.questions.map((q) => q.number)).toEqual(['1(a)', '1(b)', '2']);
  });

  it('keeps the whole paper when there is no instruction block', () => {
    const noCover = '1 Work out 12 × 8 (2 marks) 2 Work out 45 ÷ 9 (2 marks)';
    expect(bodyOf(noCover)).toBe(noCover);
  });

  it('does not cut so far that the paper disappears', () => {
    // A stray marker near the end must not leave an empty body.
    const odd = '1 Work out 2 + 2 (1 mark) Answer ALL questions.';
    expect(bodyOf(odd)).toBe(odd);
  });
});

describe('what paper is this', () => {
  it('names the board from the paper, not the filename', () => {
    expect(detectBoard(EDEXCEL_MATHS)).toBe('Edexcel');      // via "Pearson"
    expect(detectBoard(AQA_BIOLOGY)).toBe('AQA');
    expect(detectBoard('OCR GCSE Computer Science J277')).toBe('OCR');
    expect(detectBoard('Some notes with no board on them')).toBeNull();
  });

  it('names the subject, preferring the longer match', () => {
    expect(detectSubject(AQA_BIOLOGY)).toBe('Biology');
    expect(detectSubject('GCSE English Literature Paper 2')).toBe('English Literature');
    expect(detectSubject('GCSE Maths Higher Tier')).toBe('Mathematics');
  });

  it('says nothing rather than guessing a subject', () => {
    expect(detectSubject('A page of numbers and nothing else')).toBeNull();
  });
});

describe('AQA page furniture, from a real paper opened by link', () => {
  /*
    FOUND BY OPENING A REAL PAPER, NOT BY IMAGINING ONE.

    AQA GCSE Biology 8461/1H June 2022, fetched through the board-link route.
    Question 1 arrived with everything printed down the margins and across the
    blank pages glued to the front of it, because pdf.js joins a page into one
    line and none of the existing patterns were written against AQA.

    Transcribed exactly as it extracted, spacing damage included.
  */
  const REAL_Q1 = '1 H H 2 * 02 * Do not write outside the box There are no '
    + 'questions on this page DO NOT WRITE ON THIS PAGE ANSWER IN THE SPACES '
    + 'PROVIDED 3 * 03 * Do not write outside the box Answer all questions in '
    + 'the spaces provided. 0 1 This question is about cells and transport.';

  it('strips it back to the actual question', () => {
    const cleaned = tidy(REAL_Q1);
    expect(cleaned).toContain('This question is about cells and transport');
    for (const junk of [
      'Do not write outside the box',
      'There are no questions on this page',
      'DO NOT WRITE ON THIS PAGE',
      'ANSWER IN THE SPACES PROVIDED',
      'Answer all questions in the spaces provided',
      '* 02 *',
      '* 03 *',
    ]) {
      expect(cleaned, junk).not.toContain(junk);
    }
  });

  it('does not eat the question itself', () => {
    // A furniture rule that also removed content would be worse than the junk.
    expect(tidy('0 2 . 1 Explain why the box is heavier. [3 marks]'))
      .toContain('Explain why the box is heavier');
    expect(tidy('Answer all questions in the spaces provided. 0 1 Describe osmosis.'))
      .toContain('Describe osmosis');
  });
});

describe('the fixes that came out of a real AQA paper', () => {
  it('collapses whitespace BEFORE matching furniture', () => {
    /*
      THE BUG THAT MADE EVERY OTHER PATTERN USELESS ON AQA.

      A PDF places text by position, so pdf.js returns what looks like one
      phrase but is "Do not write" and "outside the box" with a line break
      between them. Every pattern here was written with single spaces, so on a
      real AQA paper not one of them matched and the margin text sailed into
      question 1.
    */
    expect(tidy('Do not write\noutside the box Explain osmosis.'))
      .toBe('Explain osmosis.');
    expect(tidy('Answer   all   questions in the spaces provided. Describe it.'))
      .toBe('Describe it.');
  });

  it('takes the page number away with the page marker', () => {
    /*
      Removing only the words left the bare page numbers behind, and a stray "2"
      reads exactly like the start of question 2. That turned a 9-question paper
      into 39, one of them titled "2 Do not write outside the box".
    */
    const cleaned = tidy('2 * 02 * Do not write outside the box 0 1 About cells.');
    expect(cleaned).not.toMatch(/^\s*2\b/);
    expect(cleaned).toContain('About cells');
  });

  it('does not half-match "answer all questions"', () => {
    // The shorter pattern used to win and strand "in the spaces provided."
    expect(tidy('Answer all questions in the spaces provided. 0 1 About cells.'))
      .not.toContain('in the spaces provided');
  });
});
