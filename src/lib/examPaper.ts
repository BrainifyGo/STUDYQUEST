/**
 * Turning a past paper the student already has into something practisable.
 *
 * StudyQuest does not host exam papers — those belong to AQA, Pearson, OCR and
 * WJEC, and redistributing them is their call, not ours. What a student does
 * with a paper they downloaded themselves is a different matter entirely, so
 * this works on a file THEY supply and we never store it.
 *
 * The existing PDF path flattens a file into one blob and writes a summary.
 * That is right for notes and wrong for a paper: it loses where each question
 * starts, what it is worth, and therefore any way to practise it one question at
 * a time. This finds the boundaries.
 *
 * The input is deliberately assumed to be MESSY. pdf.js gives back
 * `items.map(i => i.str).join(' ')` per page — one long space-joined line with
 * no newlines at all, headers and footers mixed into the middle of sentences.
 * Everything here is written against that, not against tidy text.
 */

export interface ExamQuestion {
  /** "1", "7", "14(a)" — as printed on the paper. */
  number: string;
  text: string;
  /** Marks, when the paper states them. Null when it does not. */
  marks: number | null;
}

export interface ExamPaper {
  questions: ExamQuestion[];
  /** Sum of the marks we could read. Null when the paper never says. */
  totalMarks: number | null;
  board: Board | null;
  /** From the paper's own wording, not the filename. */
  subject: string | null;
}

export type Board = 'AQA' | 'Edexcel' | 'OCR' | 'WJEC';

/*
  Page furniture. Every one of these appears mid-sentence once pdf.js has joined
  a page into one line, so they have to go before anything else is attempted.
*/
const BOILERPLATE: RegExp[] = [
  /\bDO NOT WRITE IN THIS AREA\b/gi,
  /\bTurn over\s*►?/gi,
  /\bBLANK PAGE\b/gi,
  /*
    The optional tail is not decoration. Without it the shorter pattern matched
    first and left "in the spaces provided." stranded at the front of question 1
    on a real AQA paper. One pattern that swallows the whole sentence cannot
    half-match it.
  */
  /\bAnswer\s+ALL\s+questions(\s+in the spaces? provided)?\.?/gi,
  /\bAnswer\s+all\s+questions(\s+in the spaces? provided)?\.?/gi,
  /\bWrite your answers? in the spaces? provided\b/gi,
  /\bYou must write down all the stages in your working\b/gi,
  /\bDiagram NOT accurately drawn\b/gi,
  /\*[A-Z]\d{5,}[A-Z]?\d*\*/g,          // *P72844A0328* — the barcode on Edexcel papers
  /\bIB\/[A-Z]\/[A-Za-z0-9/]+\b/g,      // AQA's item bank reference
  /\bPage \d+ of \d+\b/gi,
  /©\s*\d{4}\s*[A-Za-z ]*\b/g,     // © 2023 Pearson Education Ltd

  /*
    AQA's own furniture, found by opening a real 2022 Biology paper through the
    new board-link route. Question 1 arrived reading:

      "1 H H 2 * 02 * Do not write outside the box There are no questions on
       this page DO NOT WRITE ON THIS PAGE ANSWER IN THE SPACES PROVIDED 3
       * 03 * Do not write outside the box Answer all questions in the spaces
       provided. 0 1 This question is about cells and transport."

    Every word before "0 1" is printed down the margin and across the blank
    pages, and pdf.js joins it all into the first question. None of the existing
    patterns matched it, because they were written against Edexcel papers.
  */
  /*
    The page number goes WITH the marker, and that matters more than it looks.

    Each page begins "2  * 02 *  IB/M/Jun22/8461/1H  Do not write outside the
    box". Removing only the words left the bare page numbers behind, and a
    stray "2" reads exactly like the start of question 2 — the first attempt at
    this turned a 9-question paper into 39 questions, one of which was titled
    "2 Do not write outside the box". So the page number is swallowed with it.
  */
  /\b\d{1,3}\s*\*\s*\d{2}\s*\*/g,   // "2 * 02 *" — page number and AQA page marker
  /\b(Higher|Foundation)\s+Tier\b/gi,   // printed down the cover; leaks into Q1
  /\bDo not write\s+outside the box\b/gi,
  /\bThere are no questions on this page\b/gi,
  /\bDO NOT WRITE ON THIS PAGE\b/gi,
  /\bANSWER IN THE SPACES PROVIDED\b/gi,
];

const BOARD_PATTERNS: [Board, RegExp][] = [
  ['Edexcel', /\bEdexcel\b|\bPearson\b/i],
  ['AQA', /\bAQA\b|\bAssessment and Qualifications Alliance\b/i],
  ['OCR', /\bOCR\b|\bOxford Cambridge and RSA\b/i],
  ['WJEC', /\bWJEC\b|\bEduqas\b/i],
];

/** Whitespace only. Keeps the furniture, because the board's name lives in it. */
export function normalise(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Clean the furniture out and normalise whitespace to single spaces.
 *
 * WHITESPACE IS COLLAPSED FIRST, and that order is the fix for a real bug. A PDF
 * lays text out by position, so pdf.js hands back what LOOKS like one phrase but
 * is actually "Do not write" and "outside the box" with a line break between
 * them. Every pattern below was written with single spaces, so on a real AQA
 * paper none of them matched and the margin text sailed through into question 1.
 *
 * Collapsing first also rescues the patterns that were already here: AQA prints
 * "Answer   all   questions", which "Answer all questions" never matched either.
 */
export function tidy(raw: string): string {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/\s+/g, ' ');
  for (const re of BOILERPLATE) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/*
  How a paper states what a question is worth. Ordered most specific first,
  because "(Total for Question 14 is 2 marks)" also contains "2 marks".
*/
const TOTAL_FOR_QUESTION = /\(\s*Total for Question\s+\d+[a-z]?\s+is\s+(\d+)\s+marks?\s*\)/i;
const MARKS_PATTERNS: RegExp[] = [
  /\(\s*(\d+)\s+marks?\s*\)/i,          // (3 marks)
  /\[\s*(\d+)\s+marks?\s*\]/i,          // [3 marks]
  /\[\s*(\d+)\s*\]\s*$/,                // [3]  — OCR, only at the very end
  /\(\s*(\d+)\s*\)\s*$/,                // (3)  — Edexcel sub-part, only at the end
];

/**
 * Marks for one question's text, or null when the paper does not say.
 *
 * `subPart` matters: "(Total for Question 4 is 3 marks)" is printed AFTER 4(b),
 * so it lands inside 4(b)'s slice. That 3 is what question 4 is worth in total,
 * not what 4(b) is worth — 4(b)'s own value is its trailing "(2)".
 */
export function marksIn(text: string, subPart = false): number | null {
  let t = text;
  if (subPart) {
    // "…standard form. (2) (Total for Question 4 is 3 marks)" — the 3 belongs to
    // question 4, and while it sits at the end, 4(b)'s own "(2)" is no longer
    // the last thing in the string, so the anchored pattern below misses it.
    t = t.replace(TOTAL_FOR_QUESTION, '').trim();
  } else {
    const total = t.match(TOTAL_FOR_QUESTION);
    if (total) return Number(total[1]);
  }

  for (const re of MARKS_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const n = Number(m[1]);
      // A question worth 0, or worth 60, is a misread rather than a question.
      if (n > 0 && n <= 30) return n;
    }
  }
  return null;
}

/**
 * Where each question begins.
 *
 * A bare number followed by a capital letter is the only reliable signal once
 * the line breaks are gone, and it is not reliable enough on its own — "…is 2 A
 * grade…" matches too. So candidates are found first and filtered after, using
 * the fact that real question numbers run 1, 2, 3… in order.
 */
const QUESTION_START = /(?:^|\s)(\d{1,2})\s*(\([a-z]\))?\s+(?=[A-Z(£$"'£])/g;

export function looksLikeExamPaper(raw: string): boolean {
  const text = tidy(raw);
  if (text.length < 120) return false;

  // The strongest single signal: papers say what things are worth.
  const markMentions = (text.match(/\(\s*\d+\s+marks?\s*\)|\[\s*\d+\s+marks?\s*\]/gi) || []).length;
  if (markMentions >= 3) return true;

  const hasTotalLine = TOTAL_FOR_QUESTION.test(text);
  const hasPaperWords =
    /\bTotal for (the )?paper\b/i.test(text) ||
    /\bAnswer ALL questions\b/i.test(raw) ||
    /\bcalculators? may be used\b/i.test(text) ||
    /\bTime allowed\b/i.test(text);

  return hasTotalLine || (markMentions >= 1 && hasPaperWords);
}

export function detectBoard(raw: string): Board | null {
  // NOT tidy(): the copyright line carries "Pearson", and tidy() removes it.
  const text = normalise(raw);
  for (const [board, re] of BOARD_PATTERNS) if (re.test(text)) return board;
  return null;
}

/**
 * The subject as the paper states it, not as the file was named.
 * A file called "maths mock final FINAL(2).pdf" tells you nothing.
 */
export function detectSubject(raw: string): string | null {
  const text = normalise(raw);
  const SUBJECTS = [
    'Mathematics', 'Maths', 'Further Mathematics', 'Combined Science', 'Biology',
    'Chemistry', 'Physics', 'English Language', 'English Literature', 'History',
    'Geography', 'Computer Science', 'Business', 'Economics', 'Psychology',
    'Sociology', 'Religious Studies', 'French', 'Spanish', 'German',
  ];
  // Longest first, so "English Literature" wins over "English".
  for (const s of [...SUBJECTS].sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${s}\\b`, 'i').test(text)) return s === 'Maths' ? 'Mathematics' : s;
  }
  return null;
}

/**
 * Where the questions actually begin.
 *
 * A cover page is full of digits followed by capitals — "Paper 1 (Non-Calculator)",
 * "Higher Tier", "Time: 1 hour 30 minutes" — and "Paper 1" looks exactly like
 * question 1 to any boundary rule. On a real Edexcel paper that swallowed the
 * genuine question 1 into the front matter.
 *
 * Every board prints an instruction block immediately before question 1, so the
 * end of the LAST such instruction is where the paper proper starts. Computed on
 * the raw text, because tidy() deletes these very lines as furniture.
 */
export function bodyOf(raw: string): string {
  if (typeof raw !== 'string') return '';
  /*
    Every board words its instruction block differently, and the list below is
    from real papers rather than from memory. The first version only had
    Edexcel's phrasing, so on a genuine AQA paper the cut landed halfway through
    the cover and question 1 came out as "1 Non - Calculator Please write clearly
    in block capitals…".

    The last match wins, so more phrasings can only ever improve the cut.
  */
  const MARKERS = [
    // Edexcel
    /Answer ALL questions\.?/gi,
    /Write your answers? in the spaces? provided\.?/gi,
    /You must write down all the stages in your working\.?/gi,
    // AQA
    /You must answer the questions in the spaces provided\.?/gi,
    /The marks for questions are shown in brackets\.?/gi,
    /The maximum mark for this paper is\s*\d*\.?/gi,
    /Please write clearly in block capitals\.?/gi,
    /Do all rough work in this book[^.]*\.?/gi,
    // OCR and general
    /Instructions? to candidates/gi,
    /Information for candidates/gi,
    /Answer all the questions\.?/gi,
  ];
  let cut = 0;
  for (const re of MARKERS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) cut = Math.max(cut, m.index + m[0].length);
  }
  // Only trust it if it leaves a paper behind; some papers have no such block.
  return raw.length - cut > 80 ? raw.slice(cut) : raw;
}

/** Split a paper into its questions. Returns an empty list if it cannot. */
export function parseExamPaper(raw: string): ExamPaper {
  // Cover page off first, then furniture. Board and subject still come from the
  // WHOLE paper, because both are printed on the cover we just removed.
  const text = tidy(bodyOf(raw));
  const board = detectBoard(raw);
  const subject = detectSubject(raw);

  if (!text) return { questions: [], totalMarks: null, board, subject };

  // Collect every candidate boundary, then keep only those that continue the
  // sequence. A stray "2" inside a sentence does not follow question 1.
  type Candidate = { index: number; num: number; part: string; length: number };
  const candidates: Candidate[] = [];
  QUESTION_START.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUESTION_START.exec(text)) !== null) {
    candidates.push({
      index: m.index + (m[0].length - m[0].trimStart().length),
      num: Number(m[1]),
      part: m[2] || '',
      length: m[0].trimStart().length,
    });
    QUESTION_START.lastIndex = m.index + 1;   // allow overlapping starts
  }

  /*
    Real question numbers run in order, so `lastMain` tracks the question we are
    inside. A candidate is a boundary only if it opens the NEXT question, or is
    another lettered part of the current one. Everything else is a digit that
    happened to sit before a capital letter.
  */
  const kept: Candidate[] = [];
  let lastMain = 0;
  for (const c of candidates) {
    const opensNext = c.num === lastMain + 1;
    const anotherPart = c.num === lastMain && !!c.part;
    if (!opensNext && !anotherPart) continue;

    /*
      A bare "1" before "1 (a)" is NOT a duplicate to be thrown away. On AQA
      papers it carries the stem — "Figure 1 shows a plant cell" — which every
      sub-part below it depends on. Dropping it left the parts contextless.
      Parents that really are just a number are removed later by the length
      check, which is the honest place to decide it.
    */
    kept.push(c);
    if (opensNext) lastMain = c.num;
  }

  const questions: ExamQuestion[] = [];
  for (let i = 0; i < kept.length; i++) {
    const start = kept[i].index;
    const end = i + 1 < kept.length ? kept[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length < 12) continue;         // a number and nothing after it

    questions.push({
      number: `${kept[i].num}${kept[i].part}`,
      text: body,
      marks: marksIn(body, !!kept[i].part),
    });
  }

  const stated = questions.reduce<number | null>(
    (sum, q) => (q.marks === null ? sum : (sum || 0) + q.marks),
    null,
  );

  return { questions, totalMarks: stated, board, subject };
}
