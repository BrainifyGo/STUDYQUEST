/**
 * Turn a Firebase auth error into something a person can act on.
 *
 * Sign-in used to be `catch (err) { console.error(...) }` — so when it failed, the
 * button did nothing at all and the reason sat in a console nobody had open. That
 * is how "some people can't log in" goes unexplained for a day.
 *
 * The domain case matters most: `auth/unauthorized-domain` is not a user mistake,
 * it is a deployment that was never finished. It fails for everyone on the live
 * URL while working perfectly on localhost, so whoever tests locally sees nothing
 * wrong — which is exactly how it reaches real users.
 */

export interface AuthErrorInfo {
  message: string;
  /** True when this is a configuration fault, not something the user did. */
  isSetupProblem: boolean;
}

export function describeAuthError(err: unknown): AuthErrorInfo {
  const code = String(
    (err as { code?: string } | null)?.code ?? ''
  ).replace(/^auth\//, '');

  switch (code) {
    case 'unauthorized-domain':
      return {
        isSetupProblem: true,
        message:
          `This site isn't authorised for sign-in yet. Add ${location.hostname} ` +
          'in Firebase → Authentication → Settings → Authorised domains.',
      };

    case 'operation-not-allowed':
      return {
        isSetupProblem: true,
        message:
          'That sign-in method is switched off. Enable it in Firebase → Authentication → Sign-in method.',
      };

    case 'popup-blocked':
      return {
        isSetupProblem: false,
        message: 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
      };

    case 'popup-closed-by-user':
    case 'cancelled-popup-request':
      return { isSetupProblem: false, message: 'Sign-in was cancelled.' };

    case 'network-request-failed':
      return { isSetupProblem: false, message: 'No connection. Check your internet and try again.' };

    case 'too-many-requests':
      return { isSetupProblem: false, message: 'Too many attempts. Wait a minute and try again.' };

    case 'email-already-in-use':
      return { isSetupProblem: false, message: 'That email already has an account. Try signing in instead.' };

    case 'invalid-email':
      return { isSetupProblem: false, message: "That email address doesn't look right." };

    case 'weak-password':
      return { isSetupProblem: false, message: 'Pick a longer password — at least 6 characters.' };

    // Firebase deliberately returns one code for a wrong password AND an unknown
    // account, so that nobody can use the login form to find out which emails
    // have accounts. The message keeps that property.
    case 'invalid-credential':
    case 'wrong-password':
    case 'user-not-found':
      return { isSetupProblem: false, message: 'Wrong email or password.' };

    case 'user-disabled':
      return { isSetupProblem: false, message: 'That account has been disabled.' };

    default:
      return {
        isSetupProblem: false,
        message: code
          ? `Sign-in failed (${code}). Try again in a moment.`
          : 'Sign-in failed. Try again in a moment.',
      };
  }
}
