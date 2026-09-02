import React from 'react';
import {
  THEMES, resolveTheme, themeForDay,
  type Theme, type ThemeChoice,
} from '../lib/themes';

/**
 * Pick how the app looks.
 *
 * Shown as real swatches rather than names, because "Orchid" means nothing until
 * you see it. Each swatch is painted with that theme's own page, card, text and
 * accent colours, so the choice is made from the thing itself.
 *
 * "A new one each day" sits alongside the fixed ones as a choice of equal
 * standing, not a toggle bolted underneath — it is a way to want the app to
 * look, the same as any other.
 */

interface Props {
  value: ThemeChoice;
  onChange: (next: ThemeChoice) => void;
  /** Used only to show which theme today would be. */
  salt?: string;
}

export const ThemePicker: React.FC<Props> = ({ value, onChange, salt = '' }) => {
  const today = themeForDay(new Date(), salt);
  const isDaily = value.kind === 'daily';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {THEMES.map((theme) => (
          <Swatch
            key={theme.id}
            theme={theme}
            selected={value.kind === 'fixed' && value.id === theme.id}
            onSelect={() => onChange({ kind: 'fixed', id: theme.id })}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange({ kind: 'daily' })}
        aria-pressed={isDaily}
        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
          isDaily
            ? 'border-brand-purple bg-brand-purple/10'
            : 'border-border-main bg-glass-bg hover:border-brand-purple/40'
        }`}
      >
        {/* The next few days, so "it changes" is shown rather than promised. */}
        <span className="flex shrink-0 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((d) => {
            const t = themeForDay(new Date(Date.now() + d * 86_400_000), salt);
            return (
              <span
                key={d}
                className="h-6 w-3 rounded-full border border-white/10"
                style={{ background: t.accent }}
              />
            );
          })}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-black tracking-tight">Surprise me</span>
          <span className="mt-0.5 block text-[12px] text-text-dim">
            A different one every morning. Today would be <strong>{today.name}</strong>.
          </span>
        </span>
      </button>
    </div>
  );
};

const Swatch: React.FC<{ theme: Theme; selected: boolean; onSelect: () => void }> = ({
  theme, selected, onSelect,
}) => {
  const { vars } = resolveTheme(theme);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={theme.name}
      className={`overflow-hidden rounded-2xl border-2 text-left transition-all ${
        selected ? 'border-brand-purple' : 'border-transparent hover:border-border-main'
      }`}
    >
      {/* Painted in the theme's own colours — the only honest preview. */}
      <span className="block p-3" style={{ background: theme.bgMain }}>
        <span
          className="mb-2 block rounded-lg p-2"
          style={{ background: theme.bgSecondary }}
        >
          <span
            className="mb-1 block h-1.5 w-10 rounded-full"
            style={{ background: theme.accent }}
          />
          <span
            className="block h-1 w-full rounded-full"
            style={{ background: vars['--text-dim'] }}
          />
        </span>
        <span
          className="block text-[11px] font-black tracking-tight"
          style={{ color: theme.textMain }}
        >
          {theme.name}
        </span>
      </span>
    </button>
  );
};

export default ThemePicker;
