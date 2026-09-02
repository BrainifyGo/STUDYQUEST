/**
 * Official exam board resources.
 *
 * The catalogue is data, so most of what can go wrong is data going wrong: a
 * link typed from memory, a board name that does not match the URL it points at,
 * or an entry that silently duplicates another.
 *
 * What these tests CANNOT do is prove a link is alive — that needs the network,
 * and it is `npm run check:links`, which is committed for exactly that reason.
 * What they can do is prove nothing in here points somewhere it should not.
 */
import { describe, expect, it } from 'vitest';
import {
  BOARDS, DOC_LABELS, RESOURCES,
  boardsWithResources, describeResource, findResources, rankFor, subjects,
  type BoardId,
} from '../src/lib/examBoards';

/** Which domain each board is allowed to link to. */
const DOMAINS: Record<BoardId, RegExp> = {
  aqa: /^https:\/\/(www\.)?aqa\.org\.uk\//,
  edexcel: /^https:\/\/qualifications\.pearson\.com\//,
  ocr: /^https:\/\/(www\.)?ocr\.org\.uk\//,
  eduqas: /^https:\/\/(www\.)?eduqas\.co\.uk\//,
};

describe('every link points at the board it claims to', () => {
  it.each(RESOURCES.map((r) => [describeResource(r), r] as const))(
    '%s is on its own board\'s domain',
    (_name, r) => {
      /*
        THE ONE THAT MATTERS MOST. An entry labelled "AQA" that links to a
        revision blog is worse than no entry: the student trusts it BECAUSE
        StudyQuest called it official.
      */
      expect(r.url, r.id).toMatch(DOMAINS[r.board]);
    },
  );

  it('uses https everywhere, boards included', () => {
    for (const r of RESOURCES) expect(r.url, r.id).toMatch(/^https:\/\//);
    for (const b of Object.values(BOARDS)) expect(b.home, b.id).toMatch(/^https:\/\//);
  });

  it('has no duplicate ids and no duplicate URLs', () => {
    const ids = RESOURCES.map((r) => r.id);
    expect(new Set(ids).size, 'ids').toBe(ids.length);
    const urls = RESOURCES.map((r) => r.url);
    expect(new Set(urls).size, 'urls').toBe(urls.length);
  });

  it('records when each link was last checked', () => {
    // A catalogue with no check dates is a catalogue nobody can audit.
    for (const r of RESOURCES) expect(r.checked, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('names a real board for every resource', () => {
    for (const r of RESOURCES) expect(BOARDS[r.board], r.id).toBeTruthy();
  });

  it('labels every document type', () => {
    for (const r of RESOURCES) expect(DOC_LABELS[r.type], r.type).toBeTruthy();
  });

  it('covers all four UK boards a GCSE student might sit', () => {
    expect(boardsWithResources().map((b) => b.id).sort())
      .toEqual(['aqa', 'edexcel', 'eduqas', 'ocr']);
  });
});

describe('finding one', () => {
  it('filters by board', () => {
    const found = findResources({ board: 'ocr' });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((r) => r.board === 'ocr')).toBe(true);
  });

  it('filters by subject', () => {
    const found = findResources({ subject: 'Mathematics' });
    expect(found.length).toBeGreaterThan(1);
    expect(found.every((r) => r.subject === 'Mathematics')).toBe(true);
  });

  it('searches the board code, which is what students actually have', () => {
    // A student holding a paper knows "8461" long before they know the URL.
    expect(findResources({ query: '8461' }).map((r) => r.id)).toContain('aqa-gcse-biology');
    expect(findResources({ query: 'J277' }).map((r) => r.id))
      .toContain('ocr-gcse-computer-science');
  });

  it('searches subject and board name, case insensitively', () => {
    expect(findResources({ query: 'biology' }).length).toBeGreaterThan(0);
    expect(findResources({ query: 'EDEXCEL' }).length).toBeGreaterThan(0);
    expect(findResources({ query: 'pearson' }).length).toBeGreaterThan(0);
  });

  it('returns everything for an empty filter, and nothing for nonsense', () => {
    expect(findResources()).toHaveLength(RESOURCES.length);
    expect(findResources({ query: 'astrophysics of the moon' })).toEqual([]);
  });

  it('lists subjects once each, sorted', () => {
    const s = subjects();
    expect(new Set(s).size).toBe(s.length);
    expect(s).toEqual([...s].sort());
  });
});

describe('putting the student\'s own subjects first', () => {
  it('lifts their subjects and their board to the top', () => {
    const ranked = rankFor(RESOURCES, { subjects: ['Biology'], board: 'aqa' });
    expect(ranked[0].subject).toBe('Biology');
    expect(ranked[0].board).toBe('aqa');
  });

  it('does NOT hide everything else', () => {
    /*
      Students take subjects the app has never been told about, and a list that
      quietly dropped them would look broken rather than helpful.
    */
    const ranked = rankFor(RESOURCES, { subjects: ['Biology'], board: 'aqa' });
    expect(ranked).toHaveLength(RESOURCES.length);
  });

  it('is stable and alphabetical when it knows nothing about the student', () => {
    const ranked = rankFor(RESOURCES);
    const subjectsInOrder = ranked.map((r) => r.subject);
    expect(subjectsInOrder).toEqual([...subjectsInOrder].sort());
  });

  it('does not crash on an empty catalogue or missing options', () => {
    expect(rankFor([])).toEqual([]);
    expect(rankFor(RESOURCES, {})).toHaveLength(RESOURCES.length);
  });
});

describe('what the student reads', () => {
  it('describes a resource the way it would be said aloud', () => {
    const biology = RESOURCES.find((r) => r.id === 'aqa-gcse-biology')!;
    expect(describeResource(biology)).toBe('AQA GCSE Biology (8461)');
  });

  it('leaves the code out when there is not one', () => {
    const eduqas = RESOURCES.find((r) => r.id === 'eduqas-gcse-maths')!;
    expect(describeResource(eduqas)).toBe('Eduqas GCSE Mathematics');
  });

  it('does not call a subject page "the specification"', () => {
    // It carries the spec, the papers and the reports at once, and saying
    // otherwise is a small lie the student finds out about on arrival.
    expect(DOC_LABELS.hub).not.toMatch(/specification/i);
    expect(DOC_LABELS.hub).toMatch(/everything/i);
  });
});
