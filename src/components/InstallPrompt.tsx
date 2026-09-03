import React, { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import {
  detectPlatform, installSteps, isInstalled, isIosSafari, wantsInstall,
} from '../lib/install';

/**
 * The install sheet — the only place StudyQuest can actually be installed.
 *
 * A site can only install ITS OWN app: `beforeinstallprompt` is same-origin, so
 * the marketing site cannot do this and does not try. It links here with
 * ?install=1 and this opens straight away.
 *
 * On iPhone there is no install API at all — Safari has never fired the event
 * and Apple has never offered an alternative — so the iOS path is instructions
 * for the Share menu. That is not a fallback for a failure; it is the only route
 * that exists, and pretending otherwise would leave every iPhone user tapping a
 * button that does nothing.
 */

/** The event Chrome fires. Not in TypeScript's DOM types, because it is not standard. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED = 'sq.install.dismissed';

export const InstallPrompt: React.FC = () => {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  // Read once into state rather than on every render: a value that can change
  // has to live in state, or React never repaints when it does.
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (isInstalled()) { setInstalled(true); return; }

    const onPrompt = (e: Event) => {
      // Stop Chrome's own mini-bar so there is one way in, not two competing.
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => { setInstalled(true); setOpen(false); };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // Arrived from the marketing site asking to install: open immediately.
    if (wantsInstall()) setOpen(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const platform = detectPlatform();
  const guide = installSteps(platform, !!event, isIosSafari());

  const install = async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A used prompt cannot be reused; Chrome fires a fresh one if they refuse.
    setEvent(null);
    if (outcome === 'accepted') setOpen(false);
  };

  /*
    The quiet nudge. Shown only where installing is genuinely useful — a phone —
    and only once: a banner a student has already said no to is an advert.
  */
  const showNudge = !open && !dismissed && (platform === 'ios' || platform === 'android');

  return (
    <>
      {showNudge && (
        <div className="fixed inset-x-3 bottom-20 z-40 flex items-center gap-3 rounded-2xl border border-border-main bg-glass-bg p-3 shadow-lg backdrop-blur md:hidden">
          <img src="/icon-192.png" alt="" width={36} height={36} className="rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">Add StudyQuest to your phone</p>
            <p className="text-[11.5px] text-text-dim">Its own icon, opens full screen.</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="min-h-9 shrink-0 rounded-xl bg-brand-purple px-3 text-[13px] font-black text-white"
          >
            Add
          </button>
          <button
            onClick={() => {
              try { localStorage.setItem(DISMISSED, '1'); } catch { /* private mode */ }
              setDismissed(true);
            }}
            aria-label="Not now"
            className="shrink-0 p-1 text-text-dim"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Install StudyQuest"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border-main bg-glass-bg p-5"
          >
            <div className="mb-3 flex items-start gap-3">
              <img src="/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-black leading-tight">{guide.title}</h3>
                {guide.blocked && (
                  <p className="mt-1 text-[12.5px] text-amber-400">{guide.blocked}</p>
                )}
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-text-dim">
                <X size={18} />
              </button>
            </div>

            <ol className="mb-4 space-y-2">
              {guide.steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                  {!guide.automatic && (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-purple/20 text-[11px] font-black text-brand-purple">
                      {i + 1}
                    </span>
                  )}
                  <span>{s}</span>
                </li>
              ))}
            </ol>

            {guide.automatic ? (
              <button
                onClick={() => void install()}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-purple px-4 font-black text-white"
              >
                <Download size={16} /> Install
              </button>
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-border-main p-3 text-[12.5px] text-text-dim">
                {platform === 'ios' && <Share size={15} className="shrink-0" />}
                It stays a website underneath &mdash; nothing to download, and it updates itself.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default InstallPrompt;
