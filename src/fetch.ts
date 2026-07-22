/**
 * Polite, bounded HTTP layer. Per scan ACS makes at most ~8 GET requests to
 * fixed, well-known paths. Identifies itself honestly via User-Agent.
 */

const USER_AGENT =
  'agentic-commerce-score/0.1 (+https://github.com/arenza-ai/agentic-commerce-score)';

export const DEFAULT_TIMEOUT_MS = 10_000;
/** Shopify storefronts routinely ship >1 MB of HTML; cap at 3 MB. */
const MAX_BODY_BYTES = 3 * 1024 * 1024;

export interface FetchTextResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  text: string;
  error?: string;
}

/** Reject obviously non-public hosts (safety when embedded in a server). */
export function isPublicHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  // IPv4 literal → allow only clearly public ranges (block private/loopback/link-local).
  const ip4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ip4) {
    const [a, b] = [Number(ip4[1]), Number(ip4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
      return false;
    }
  }
  if (h.includes(':')) return false; // IPv6 literals: out of scope, reject
  return true;
}

/** Normalize user input ("https://www.foo.com/x", "foo.com") → bare host. */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0]!.split('?')[0]!.split('#')[0]!;
  return s;
}

export async function fetchText(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<FetchTextResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/json,application/xml,text/plain,*/*',
      },
    });
    const finalUrl = res.url || url;
    // Bounded read: stream up to MAX_BODY_BYTES then stop.
    let text = '';
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (received >= MAX_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      text += decoder.decode();
    } else {
      text = await res.text();
    }
    return { ok: res.ok, status: res.status, finalUrl, text };
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message) : String(err);
    return { ok: false, status: 0, finalUrl: url, text: '', error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Existence probe that tolerates HEAD-hostile servers by falling back to GET. */
export async function urlExists(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<boolean> {
  const r = await fetchText(url, timeoutMs);
  if (!r.ok) return false;
  // Some platforms soft-404 (200 + HTML error page). Treat tiny/empty as missing
  // only for text artifacts; callers needing stricter validation parse content.
  return r.text.trim().length > 0;
}
