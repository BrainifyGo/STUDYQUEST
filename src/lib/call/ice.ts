import { ICE_SERVERS } from './peer';

/**
 * Where a call gets its ICE servers.
 *
 * STUN alone tells each browser what its own public address looks like and then
 * gets out of the way — the media flows directly between the two people, which
 * is why it costs nothing. It works on most home and mobile networks.
 *
 * It does NOT work behind a symmetric NAT or a firewall that blocks UDP, and
 * school networks do exactly that. Those calls need TURN, which **relays** the
 * audio and video and therefore costs real bandwidth. StudyQuest is for
 * students, so "fails at school" is not an acceptable place to leave it.
 *
 * THE KEY NEVER REACHES THE BROWSER. Cloudflare's TURN key is a long-term
 * secret; anyone holding it can relay traffic on the account. So the server
 * exchanges it for short-lived credentials and this only ever sees those.
 *
 * IF TURN IS NOT CONFIGURED, nothing breaks. The endpoint answers with the same
 * STUN-only list the app used before, so calls behave exactly as they do today
 * and simply keep failing on hostile networks. Degrading to the previous
 * behaviour is the whole point of doing it this way rather than throwing.
 */

let cached: { servers: RTCIceServer[]; until: number } | null = null;

/** How long a fetched set is reused in this tab, regardless of its own TTL. */
const CLIENT_CACHE_MS = 30 * 60 * 1000;

export function resetIceCache(): void {
  cached = null;
}

/** True when the list actually contains a relay, not just STUN. */
export function hasTurn(servers: RTCIceServer[]): boolean {
  return servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === 'string' && u.startsWith('turn'));
  });
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cached && Date.now() < cached.until) return cached.servers;

  try {
    // A short timeout on purpose: joining a call must not wait on this. If the
    // credential service is slow, going ahead with STUN beats making the user
    // stare at a button that does nothing.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('/api/turn-credentials', { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.iceServers) && data.iceServers.length) {
        cached = { servers: data.iceServers, until: Date.now() + CLIENT_CACHE_MS };
        return cached.servers;
      }
    }
  } catch {
    /* offline, aborted, or the endpoint is unavailable — fall through */
  }

  // Not cached: a failure here is usually transient, and caching it would keep
  // a whole session on STUN after one bad request.
  return ICE_SERVERS;
}
