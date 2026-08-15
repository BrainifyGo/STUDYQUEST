// Client-side AI entry point. Generation itself happens server-side (see
// server.ts /api/generate + src/lib/aiProviders.server.ts) so provider API
// keys never ship in the browser bundle. This file only talks to that route.
export const callAI = async (
  prompt: string,
  systemPrompt?: string,
  onModelChange?: (modelName: string) => void
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
    body: JSON.stringify({ prompt, systemPrompt }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Generation failed. Please try again.');
  }

  onModelChange?.(data.model);
  return data.result;
};
