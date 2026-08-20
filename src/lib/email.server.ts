/**
 * Sending email.
 *
 * WHY THIS EXISTS AT ALL. Two separate things needed it and neither could be
 * built without it: reset-by-code (RED preferred a pasted code to Firebase's
 * emailed link) and the study-planner reminders, which have been saving
 * reminders nobody ever receives. One sender serves both.
 *
 * WHY RESEND. It is one HTTPS POST with an API key — no SMTP, no connection
 * pool, no extra dependency in package.json — and its free tier is 3,000
 * emails a month, which is far more than this app will send. Swapping provider
 * later means changing `deliver()` and nothing else.
 *
 * IT IS OPTIONAL, AND FAILS LOUDLY RATHER THAN SILENTLY. With no key set,
 * `sendEmail` throws `EmailNotConfigured` instead of pretending to work. A
 * password reset that quietly sends nothing is worse than one that says it is
 * not set up: the person sits waiting for an email that was never going to
 * arrive.
 */

export class EmailNotConfigured extends Error {
  constructor() {
    super('Email is not configured on the server (RESEND_API_KEY is not set).');
    this.name = 'EmailNotConfigured';
  }
}

export const emailConfigured = (): boolean => !!process.env.RESEND_API_KEY?.trim();

interface Mail {
  to: string;
  subject: string;
  /** Plain text. Every mail here is short enough not to need HTML. */
  text: string;
}

export async function sendEmail({ to, subject, text }: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new EmailNotConfigured();

  // Resend's sandbox sender works without a verified domain, which means this
  // runs before anybody has set DNS up. Set EMAIL_FROM once studyquest.app is
  // verified, or mail will land in spam.
  const from = process.env.EMAIL_FROM?.trim() || 'StudyQuest <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Email send failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
}

/** The reset-code mail, in one place so the wording is not buried in a route. */
export const resetCodeEmail = (code: string): Pick<Mail, 'subject' | 'text'> => ({
  subject: `${code} is your StudyQuest reset code`,
  text:
    `Your StudyQuest password reset code is:\n\n` +
    `    ${code}\n\n` +
    `Type it into the app to set a new password. It expires in 10 minutes.\n\n` +
    `If you did not ask to reset your password, you can ignore this email — ` +
    `nothing has changed on your account.\n`,
});
