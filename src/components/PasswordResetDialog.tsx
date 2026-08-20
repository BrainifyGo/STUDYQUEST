import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, KeyRound, Loader2, Check, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Reset a password with a code rather than a link.
 *
 * RED asked for this specifically: Firebase's own reset emails a LINK, and a
 * link is a poor fit for how this actually gets used. Half the time the email
 * arrives on a phone while you are sitting at the laptop you are locked out of,
 * and tapping the link signs you in on the wrong device. A six-digit code you
 * read off one screen and type into another does not care which device it
 * landed on.
 *
 * Three steps, because it is three questions: who are you, prove it, what would
 * you like instead. The server holds the security properties — see the note on
 * /api/password/request-code in server.ts.
 */

type Step = 'email' | 'code' | 'password' | 'done';

interface Props {
  /** Prefilled when the person is signed in and changing their own password. */
  initialEmail?: string;
  onClose: () => void;
}

export const PasswordResetDialog: React.FC<Props> = ({ initialEmail = '', onClose }) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const post = async (path: string, body: unknown) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Something went wrong.');
    return data as any;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const requestCode = () =>
    run(async () => {
      await post('/api/password/request-code', { email: email.trim() });
      setStep('code');
    });

  const verifyCode = () =>
    run(async () => {
      const { ticket: t } = await post('/api/password/verify-code', { email: email.trim(), code });
      setTicket(t);
      setStep('password');
    });

  const setNewPassword = () =>
    run(async () => {
      await post('/api/password/reset', { email: email.trim(), ticket, password });
      setStep('done');
      toast.success('Password changed. Sign in with your new one.');
    });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        role="dialog"
        aria-label="Reset your password"
        className="w-full max-w-md glass border border-border-main rounded-[2rem] p-6 sm:p-8 space-y-6 relative"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 p-2 rounded-xl text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
        >
          <X size={18} />
        </button>

        <div className="space-y-2">
          <span className="w-12 h-12 rounded-2xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center text-brand-purple">
            <KeyRound size={20} />
          </span>
          <h2 className="text-xl font-black text-text-main tracking-tight">
            {step === 'email' && 'Reset your password'}
            {step === 'code' && 'Check your email'}
            {step === 'password' && 'Pick a new password'}
            {step === 'done' && 'All set'}
          </h2>
          <p className="text-sm text-text-dim leading-relaxed">
            {step === 'email' && 'We will email you a 6-digit code to type in here.'}
            {step === 'code' && `We sent a code to ${email}. It expires in 10 minutes, and it often lands in spam.`}
            {step === 'password' && 'At least 6 characters. You will be signed out everywhere else.'}
            {step === 'done' && 'Your password has been changed and every other device has been signed out.'}
          </p>
        </div>

        {step === 'email' && (
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.trim() && requestCode()}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl bg-glass-bg border border-border-main text-text-main focus:outline-none focus:border-brand-purple/60 transition-all"
            />
            <button
              onClick={requestCode}
              disabled={busy || !email.trim()}
              className="btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Send me a code
            </button>
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-3">
            <input
              // inputMode numeric brings up the number pad on a phone, which is
              // the only keyboard that makes sense for six digits.
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verifyCode()}
              placeholder="000000"
              className="w-full px-4 py-4 rounded-xl bg-glass-bg border border-border-main text-text-main text-2xl font-mono tracking-[0.4em] text-center focus:outline-none focus:border-brand-purple/60 transition-all placeholder:text-text-dim/30"
            />
            <button
              onClick={verifyCode}
              disabled={busy || code.length !== 6}
              className="btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Continue
            </button>
            <button
              onClick={() => { setStep('email'); setCode(''); setError(''); }}
              className="w-full py-2 text-text-dim hover:text-text-main text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft size={14} /> Use a different email
            </button>
          </div>
        )}

        {step === 'password' && (
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && password.length >= 6 && setNewPassword()}
              placeholder="New password"
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl bg-glass-bg border border-border-main text-text-main focus:outline-none focus:border-brand-purple/60 transition-all"
            />
            <button
              onClick={setNewPassword}
              disabled={busy || password.length < 6}
              className="btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Change my password
            </button>
          </div>
        )}

        {step === 'done' && (
          <button
            onClick={onClose}
            className="btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <Check size={16} /> Done
          </button>
        )}

        {error && <p className="text-sm text-red-400 leading-relaxed">{error}</p>}
      </motion.div>
    </div>
  );
};

export default PasswordResetDialog;
