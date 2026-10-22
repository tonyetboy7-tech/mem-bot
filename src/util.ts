export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export async function getJSON<T = any>(url: string, init: RequestInit = {}, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return (await r.json()) as T;
    } catch (e) { last = e; await sleep(1200 * (i + 1)); }
  }
  throw last instanceof Error ? last : new Error(`failed ${url}`);
}

/** percentile rank of each value inside its own list, 0..1 (ties share a rank) */
export function pctRank(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map(v => {
    const lo = sorted.indexOf(v), hi = sorted.lastIndexOf(v);
    return ((lo + hi) / 2) / (n - 1);
  });
}

export const short = (s: string) => (s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);
