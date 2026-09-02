/**
 * Official exam board resources — specifications, past papers, mark schemes and
 * examiner reports, on the boards' own sites.
 *
 * StudyQuest LINKS, it does not host. Everything here points at a public page the
 * board publishes itself, which is both the legal position and the honest one:
 * the boards keep these current, and a copy taken today is wrong by September.
 *
 * TWO RULES, AND THE FIRST IS THE IMPORTANT ONE.
 *
 * 1. NOTHING IN THIS FILE IS FROM MEMORY. Every URL below returned HTTP 200 when
 *    it was added, checked with `npm run check:links`, which is committed
 *    alongside it. A plausible-looking link that 404s is worse than no link: the
 *    student assumes the material is gone rather than that we made it up.
 *
 * 2. SUBJECT PAGES, NOT DEEP PDF LINKS. A direct link to
 *    "AQA-8461-SQP-JUN23.PDF" rots the moment the board reorganises, and boards
 *    reorganise constantly. The subject page always carries the current
 *    specification, the newest papers and the latest examiner reports, so it
 *    stays right without anyone maintaining it. Where a board gives a stable
 *    document-level page, it gets its own entry.
 *
 * Adding a board or a subject is adding rows here. Nothing else changes.
 */

export type BoardId = 'aqa' | 'edexcel' | 'ocr' | 'eduqas';

export interface Board {
  id: BoardId;
  /** As students say it. */
  name: string;
  /** The legal entity, for the "official resource" line. */
  fullName: string;
  home: string;
}

export const BOARDS: Record<BoardId, Board> = {
  aqa: {
    id: 'aqa', name: 'AQA', fullName: 'AQA',
    home: 'https://www.aqa.org.uk/',
  },
  edexcel: {
    id: 'edexcel', name: 'Edexcel', fullName: 'Pearson Edexcel',
    home: 'https://qualifications.pearson.com/en/home.html',
  },
  ocr: {
    id: 'ocr', name: 'OCR', fullName: 'Oxford Cambridge and RSA',
    home: 'https://www.ocr.org.uk/',
  },
  eduqas: {
    id: 'eduqas', name: 'Eduqas', fullName: 'WJEC Eduqas',
    home: 'https://www.eduqas.co.uk/',
  },
};

export type Qualification = 'GCSE' | 'A-Level';

/**
 * What a link leads to.
 *
 * `hub` is deliberately its own type rather than a fudge. A subject page carries
 * everything at once, and pretending it is "the specification" would be a small
 * lie the student discovers on arrival.
 */
export type DocType = 'hub' | 'specification' | 'past-papers' | 'examiner-reports';

export const DOC_LABELS: Record<DocType, string> = {
  hub: 'Everything for this subject',
  specification: 'Specification',
  'past-papers': 'Past papers & mark schemes',
  'examiner-reports': 'Examiner reports',
};

export interface Resource {
  id: string;
  board: BoardId;
  qualification: Qualification;
  subject: string;
  type: DocType;
  url: string;
  /** The board's own code, when it has one — students search by it. */
  code?: string;
  /** Only where a resource really is fixed to one year. */
  year?: number;
  /** When the URL last returned 200. Set by scripts/check-links.mjs. */
  checked: string;
}

const CHECKED = '2026-09-02';

/*
  Subject pages, verified. Every board publishes the specification, past papers,
  mark schemes and examiner reports from these, which is why they are `hub`.
*/
export const RESOURCES: Resource[] = [
  // ── AQA ──────────────────────────────────────────────────────────────────
  { id: 'aqa-gcse-biology', board: 'aqa', qualification: 'GCSE', subject: 'Biology',
    type: 'hub', code: '8461', checked: CHECKED,
    url: 'https://www.aqa.org.uk/subjects/biology/gcse/biology-8461' },
  { id: 'aqa-gcse-chemistry', board: 'aqa', qualification: 'GCSE', subject: 'Chemistry',
    type: 'hub', code: '8462', checked: CHECKED,
    url: 'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462' },
  { id: 'aqa-gcse-physics', board: 'aqa', qualification: 'GCSE', subject: 'Physics',
    type: 'hub', code: '8463', checked: CHECKED,
    url: 'https://www.aqa.org.uk/subjects/physics/gcse/physics-8463' },
  { id: 'aqa-gcse-maths', board: 'aqa', qualification: 'GCSE', subject: 'Mathematics',
    type: 'hub', code: '8300', checked: CHECKED,
    url: 'https://www.aqa.org.uk/subjects/mathematics/gcse/mathematics-8300' },
  { id: 'aqa-past-papers', board: 'aqa', qualification: 'GCSE', subject: 'All subjects',
    type: 'past-papers', checked: CHECKED,
    url: 'https://www.aqa.org.uk/find-past-papers-and-mark-schemes' },

  // ── Pearson Edexcel ──────────────────────────────────────────────────────
  { id: 'edexcel-gcse-maths', board: 'edexcel', qualification: 'GCSE', subject: 'Mathematics',
    type: 'hub', code: '1MA1', checked: CHECKED,
    url: 'https://qualifications.pearson.com/en/qualifications/edexcel-gcses/mathematics-2015.html' },
  { id: 'edexcel-gcse-sciences', board: 'edexcel', qualification: 'GCSE',
    subject: 'Science (Biology, Chemistry, Physics)',
    type: 'hub', checked: CHECKED,
    url: 'https://qualifications.pearson.com/en/qualifications/edexcel-gcses/sciences-2016.html' },
  { id: 'edexcel-gcse-english-language', board: 'edexcel', qualification: 'GCSE',
    subject: 'English Language', type: 'hub', checked: CHECKED,
    url: 'https://qualifications.pearson.com/en/qualifications/edexcel-gcses/english-language-2015.html' },

  // ── OCR ──────────────────────────────────────────────────────────────────
  { id: 'ocr-gcse-maths', board: 'ocr', qualification: 'GCSE', subject: 'Mathematics',
    type: 'hub', code: 'J560', checked: CHECKED,
    url: 'https://www.ocr.org.uk/qualifications/gcse/mathematics-j560-from-2015/' },
  { id: 'ocr-gcse-computer-science', board: 'ocr', qualification: 'GCSE',
    subject: 'Computer Science', type: 'hub', code: 'J277', checked: CHECKED,
    url: 'https://www.ocr.org.uk/qualifications/gcse/computer-science-j277-from-2020/' },

  // ── WJEC Eduqas ──────────────────────────────────────────────────────────
  { id: 'eduqas-gcse-maths', board: 'eduqas', qualification: 'GCSE', subject: 'Mathematics',
    type: 'hub', checked: CHECKED,
    url: 'https://www.eduqas.co.uk/qualifications/mathematics-gcse/' },
];

/** Every subject that has at least one resource, for a filter. */
export function subjects(): string[] {
  return [...new Set(RESOURCES.map((r) => r.subject))].sort();
}

export function boardsWithResources(): Board[] {
  const ids = new Set(RESOURCES.map((r) => r.board));
  return [...ids].map((id) => BOARDS[id]);
}

export interface ResourceFilter {
  board?: BoardId | null;
  subject?: string | null;
  /** Free text over subject, board name and board code. */
  query?: string;
}

export function findResources(filter: ResourceFilter = {}): Resource[] {
  const q = (filter.query ?? '').trim().toLowerCase();

  return RESOURCES.filter((r) => {
    if (filter.board && r.board !== filter.board) return false;
    if (filter.subject && r.subject !== filter.subject) return false;
    if (!q) return true;
    return [r.subject, BOARDS[r.board].name, BOARDS[r.board].fullName, r.code, r.qualification]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q));
  });
}

/** "AQA GCSE Biology (8461)" — the line a student scans for. */
export function describeResource(r: Resource): string {
  const code = r.code ? ` (${r.code})` : '';
  return `${BOARDS[r.board].name} ${r.qualification} ${r.subject}${code}`;
}

/**
 * Rank a student's own subjects and board first.
 *
 * A Year 11 doing AQA Biology should not have to scroll past Eduqas Maths. The
 * list is not filtered down to them though — students take subjects the app does
 * not know about, and hiding everything else would look broken.
 */
export function rankFor(
  resources: Resource[],
  opts: { subjects?: string[]; board?: BoardId | null } = {},
): Resource[] {
  const mine = new Set((opts.subjects ?? []).map((s) => s.toLowerCase()));

  return [...resources].sort((a, b) => {
    const score = (r: Resource) =>
      (mine.has(r.subject.toLowerCase()) ? 2 : 0) + (opts.board && r.board === opts.board ? 1 : 0);
    return score(b) - score(a)
      || a.subject.localeCompare(b.subject)
      || BOARDS[a.board].name.localeCompare(BOARDS[b.board].name);
  });
}
