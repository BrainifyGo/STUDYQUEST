// Client-side AI entry point. Generation itself happens server-side (see
// server.ts /api/generate + src/lib/aiProviders.server.ts) so provider API
// keys never ship in the browser bundle. This file only talks to that route.
export const callAI = async (
  prompt: string,
  systemPrompt?: string,
  onModelChange?: (modelName: string) => void,
  /**
   * Which paid feature is asking, if any.
   *
   * The server checks this against the plan on the verified token. Leaving it
   * out means ordinary study-kit generation, which Free gets within its budget.
   * A client cannot grant itself anything by lying here — it can only ask for a
   * gate to be applied.
   */
  feature?: 'ai-tutor'
): Promise<string> => {
  const { auth } = await import('./firebase');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.currentUser) {
    const idToken = await auth.currentUser.getIdToken();
    headers['Authorization'] = `Bearer ${idToken}`;
  }

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, systemPrompt, feature }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.error === 'PRO_REQUIRED') throw new Error('PRO_REQUIRED');
    throw new Error(data.error || 'Generation failed. Please try again.');
  }

  onModelChange?.(data.model);
  return data.result;
};
