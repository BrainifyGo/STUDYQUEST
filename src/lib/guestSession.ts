export interface GuestSession {
  createdAt: number;
  generationsUsed: number;
  studyKit?: any;
}

export const GUEST_SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const createGuestSession = (): GuestSession => {
  const session: GuestSession = {
    createdAt: Date.now(),
    generationsUsed: 0,
  };
  localStorage.setItem('brainify_guest_session', JSON.stringify(session));
  return session;
};

export const getGuestSession = (): GuestSession | null => {
  try {
    const stored = localStorage.getItem('brainify_guest_session');
    if (!stored) return null;

    const session: GuestSession = JSON.parse(stored);
    const now = Date.now();

    // Check if session has expired
    if (now - session.createdAt > GUEST_SESSION_DURATION) {
      clearGuestSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error reading guest session:', error);
    return null;
  }
};

export const incrementGuestGeneration = (): number => {
  const session = getGuestSession();
  if (!session) return 0;

  session.generationsUsed += 1;
  localStorage.setItem('brainify_guest_session', JSON.stringify(session));
  return session.generationsUsed;
};

export const clearGuestSession = (): void => {
  localStorage.removeItem('brainify_guest_session');
};

export const getGuestTimeRemaining = (): number => {
  const session = getGuestSession();
  if (!session) return 0;

  const elapsed = Date.now() - session.createdAt;
  const remaining = GUEST_SESSION_DURATION - elapsed;
  return Math.max(0, remaining);
};

export const saveGuestStudyKit = (studyKit: any): void => {
  const session = getGuestSession();
  if (!session) return;

  session.studyKit = studyKit;
  localStorage.setItem('brainify_guest_session', JSON.stringify(session));
};

export const getGuestStudyKit = (): any => {
  const session = getGuestSession();
  return session?.studyKit || null;
};
