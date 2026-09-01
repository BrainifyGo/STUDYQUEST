import React from 'react';
import {
  MAX_SETS, MAX_YEAR, MIN_YEAR,
  difficultyFor, setFor, subjectKey, targetGradeBand, tierFor,
  type StudyLevel, type SubjectSet,
} from '../lib/studyLevel';

/**
 * Year group, and set per subject.
 *
 * The shape of this form is the feature. Two things it must not do:
 *
 *   - Ask for one set for the whole student. Set 1 for Maths and set 4 for
 *     French is an ordinary timetable, and collapsing that pitches every subject
 *     at the student's best one.
 *   - Ask for a set without asking how many sets that subject runs. Set 3 of 4
 *     is near the bottom; set 3 of 7 is above the middle. Without the second
 *     number the first one cannot be read.
 *
 * "Not setted" is offered on every subject because plenty of subjects are not,
 * and a student forced to invent a set would be pitched on a number they made up.
 */

/** The subjects most likely to be setted, first. The rest are still addable. */
const COMMON_SUBJECTS = [
  'Maths', 'English', 'Science', 'Biology', 'Chemistry', 'Physics',
  'History', 'Geography', 'French', 'Spanish', 'Computer Science',
];

interface Props {
  value: StudyLevel;
  onChange: (next: StudyLevel) => void;
  /** Subjects to show rows for. Defaults to the common list. */
  subjects?: string[];
}

export const StudyLevelPicker: React.FC<Props> = ({ value, onChange, subjects }) => {
  const rows = subjects?.length ? subjects : COMMON_SUBJECTS;

  const setYear = (year: number) => onChange({ ...value, year });

  const setSubject = (subject: string, next: SubjectSet | null) => {
    const sets = { ...value.sets };
    const key = subjectKey(subject);
    if (next === null) delete sets[key];
    else sets[key] = next;
    onChange({ ...value, sets });
  };

  return (
    <div className="space-y-6">
      {/* ── Year ─────────────────────────────────────────────── */}
      <div>
        <label className="block text-[11px] font-black uppercase tracking-widest text-text-dim mb-2">
          What year are you in?
        </label>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              aria-pressed={value.year === y}
              className={[
                'min-w-11 min-h-11 rounded-xl px-3 text-sm font-bold transition-all',
                value.year === y
                  ? 'bg-primary text-white'
                  : 'bg-white/5 text-text-dim hover:bg-white/10 border border-border-main',
              ].join(' ')}
            >
              {y}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-text-dim">
          Year 12 and 13 are sixth form, which is graded A*–E rather than 9–1.
        </p>
      </div>

      {/* ── Set per subject ──────────────────────────────────── */}
      <div>
        <label className="block text-[11px] font-black uppercase tracking-widest text-text-dim mb-1">
          What set are you in?
        </label>
        <p className="mb-3 text-[12px] text-text-dim">
          Set 1 is the top set. Leave a subject on <strong>No sets</strong> if it isn&rsquo;t setted —
          that&rsquo;s a real answer, not a blank.
        </p>

        <div className="space-y-2">
          {rows.map((subject) => (
            <SubjectRow
              key={subject}
              subject={subject}
              value={setFor(value, subject)}
              onChange={(next) => setSubject(subject, next)}
            />
          ))}
        </div>
      </div>

      <LevelPreview level={value} subjects={rows} />
    </div>
  );
};

const SubjectRow: React.FC<{
  subject: string;
  value: SubjectSet | null;
  onChange: (next: SubjectSet | null) => void;
}> = ({ subject, value, onChange }) => {
  const of = value?.of ?? 4;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-main bg-white/[0.02] px-3 py-2">
      <span className="min-w-[110px] text-sm font-bold">{subject}</span>

      <select
        aria-label={`${subject} set`}
        value={value ? String(value.set) : ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : { set: Number(e.target.value), of })
        }
        className="min-h-11 rounded-lg border border-border-main bg-black/20 px-2 text-sm"
      >
        <option value="">No sets</option>
        {Array.from({ length: of }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            Set {n}
          </option>
        ))}
      </select>

      {/* Meaningless on its own — this is the number that makes set 3 readable. */}
      {value && (
        <>
          <span className="text-[12px] text-text-dim">out of</span>
          <select
            aria-label={`${subject} number of sets`}
            value={String(of)}
            onChange={(e) => {
              const nextOf = Number(e.target.value);
              // Moving from 7 sets to 3 must not leave the student in set 6.
              onChange({ set: Math.min(value.set, nextOf), of: nextOf });
            }}
            className="min-h-11 rounded-lg border border-border-main bg-black/20 px-2 text-sm"
          >
            {Array.from({ length: MAX_SETS - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
};

/**
 * Shows what the settings actually do, before the student saves them.
 *
 * A form that stores numbers and changes nothing visible is indistinguishable
 * from a broken one, so this states the consequence out loud.
 */
const LevelPreview: React.FC<{ level: StudyLevel; subjects: string[] }> = ({ level, subjects }) => {
  const shown = subjects.filter((s) => setFor(level, s));
  if (!shown.length) {
    return (
      <p className="text-[12px] text-text-dim">
        Nothing set yet — questions will be pitched at Year {level.year} generally.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border-main bg-white/[0.02] p-3">
      <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-text-dim">
        What you&rsquo;ll get
      </p>
      <div className="space-y-1">
        {shown.map((s) => {
          const band = targetGradeBand(level, s);
          const tier = tierFor(level, s);
          return (
            <div key={s} className="flex flex-wrap gap-x-2 text-[12.5px]">
              <span className="min-w-[110px] font-bold">{s}</span>
              <span className="text-text-dim">
                difficulty {difficultyFor(level, s)}/10
                {tier && ` · ${tier} tier`}
                {band && ` · aiming grade ${band.low}–${band.high}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudyLevelPicker;
