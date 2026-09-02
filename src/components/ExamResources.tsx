import React, { useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import {
  BOARDS, DOC_LABELS,
  boardsWithResources, describeResource, findResources, rankFor,
  type BoardId,
} from '../lib/examBoards';
import { useUserStore } from '../store/useUserStore';
import { normaliseLevel } from '../lib/studyLevel';

/**
 * Official exam board resources.
 *
 * Every row leaves StudyQuest. That is the point — the boards publish these,
 * keep them current, and own them. A copy made today is wrong by September, and
 * a copy is not ours to make.
 *
 * So the design job is honesty rather than presentation: say whose site it is
 * before the student taps, and open it in a new tab so their revision session is
 * still here when they come back.
 */

export const ExamResources: React.FC = () => {
  const { userData } = useUserStore();
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState<BoardId | ''>('');

  /*
    Their own subjects float to the top. Not filtered TO them — students take
    subjects the app has never been told about, and hiding those would read as
    the list being broken rather than personalised.
  */
  const mySubjects = useMemo(() => {
    if (!userData?.studyLevel) return [];
    return Object.keys(normaliseLevel(userData.studyLevel).sets);
  }, [userData?.studyLevel]);

  const results = useMemo(
    () => rankFor(findResources({ query, board: board || null }), { subjects: mySubjects }),
    [query, board, mySubjects],
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-black tracking-tight">Official exam board resources</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          Specifications, past papers, mark schemes and examiner reports — on the board&rsquo;s
          own site, where they stay current.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[180px] flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Subject, board, or a code like 8461"
            aria-label="Search exam board resources"
            className="min-h-11 w-full rounded-xl border border-border-main bg-glass-bg pl-9 pr-3 text-sm"
          />
        </label>

        <select
          value={board}
          onChange={(e) => setBoard(e.target.value as BoardId | '')}
          aria-label="Filter by exam board"
          className="min-h-11 rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
        >
          <option value="">All boards</option>
          {boardsWithResources().map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-main p-5 text-[13px] text-text-dim">
          Nothing matches that. Try the subject name, or the code printed on your paper
          &mdash; 8461, J560, 1MA1.
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <a
                href={r.url}
                target="_blank"
                /*
                  noopener is a security requirement, not a nicety: without it
                  the opened page can reach back through window.opener. noreferrer
                  keeps the boards from seeing which of our pages sent them.
                */
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border-main bg-glass-bg p-4 transition-all hover:border-brand-purple/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {describeResource(r)}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-text-dim">
                    {DOC_LABELS[r.type]} · Official {BOARDS[r.board].fullName} resource
                  </span>
                </span>
                {/* Says it leaves the app, before the tap rather than after. */}
                <ExternalLink size={16} aria-hidden className="shrink-0 text-text-dim" />
                <span className="sr-only">(opens on the {BOARDS[r.board].fullName} website)</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11.5px] leading-relaxed text-text-dim">
        StudyQuest links to these rather than copying them. They belong to the exam boards,
        who keep them up to date.
      </p>
    </div>
  );
};

export default ExamResources;
