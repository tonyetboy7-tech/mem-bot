/** offline check of mem's brain: rules, scoring, holder eligibility and payout math. Run: npm run sim */
import { quickReject } from '../src/scan';
import { scoreAll } from '../src/score';
import { eligible, computeShares, splitAmount } from '../src/shares';
import { Candidate } from '../src/types';

const base: Candidate = { mint: '', symbol: '', name: '', pairAddress: '', dexId: 'pumpswap', url: '', priceUsd: 0.001, priceNative: 0.000006, mcap: 2_000_000, liqUsd: 150_000, v1h: 400_000, v6h: 1_200_000, buys1h: 1500, sells1h: 900, chg5m: 2, chg1h: 30, chg6h: 60, ageH: 20, x: 'https://x.com/a' };
const c = (o: Partial<Candidate>): Candidate => ({ ...base, ...o });
const cands = [
  c({ mint: 'A', symbol: 'GLORP', v1h: 900_000, buys1h: 3000, sells1h: 1200, geckoRank: 2, chg1h: 45 }),
  c({ mint: 'B', symbol: 'SNOOT', v1h: 300_000, geckoRank: 9 }),
  c({ mint: 'C', symbol: 'ROCKET', chg1h: 720 }),
  c({ mint: 'D', symbol: 'BABY', ageH: 0.2 }),
  c({ mint: 'E', symbol: 'DUMP', chg5m: -25 }),
  c({ mint: 'F', symbol: 'WHALE', mcap: 150_000_000 }),
  c({ mint: 'G', symbol: 'GHOST', x: undefined }),
  c({ mint: 'H', symbol: 'BONKLE', v1h: 500_000, buys1h: 2000, sells1h: 1900, geckoRank: 15, liqUsd: 300_000 }),
  c({ mint: 'I', symbol: 'REPEAT' }),
];
const recent = { I: Date.now() - 3600e3 };
for (const x of cands) x.reject = quickReject(x, recent) ?? undefined;
const passed = scoreAll(cands.filter(x => !x.reject));
console.log('rejected:', cands.filter(x => x.reject).map(x => `${x.symbol}: ${x.reject}`).join(' | '));
console.log('ranked:', passed.map(x => `${x.symbol} ${x.score} ${JSON.stringify(x.parts)}`).join('\n        '));
const expectReject: Record<string, string> = { C: 'too hot right now', D: 'too new', E: 'dumping', F: 'already huge', G: 'no X account', I: 'already bought today' };
for (const [m, why] of Object.entries(expectReject)) if (cands.find(x => x.mint === m)!.reject !== why) throw new Error(`expected ${m} rejected for ${why}`);
if (passed[0].symbol !== 'GLORP') throw new Error('GLORP should win');

/* holders: 80 wallets, a whale, a flash-buyer who only showed up at the drop, a seller mid-hour */
const M = 1_000_000_000_000n; // 1M $MEM raw
const s0: Record<string, string> = {}, s1: Record<string, string> = {}, s2: Record<string, string> = {};
for (let i = 0; i < 80; i++) { const b = (BigInt(80 - i) * M) / 4n + M; s0['w' + i] = s1['w' + i] = s2['w' + i] = b.toString(); }
s0.whale = s1.whale = s2.whale = (400n * M).toString();
s2.flash = (300n * M).toString();
s0.seller = (200n * M).toString(); s1.seller = (2n * M).toString(); s2.seller = (200n * M).toString();
const el = eligible([s0, s1, s2]);
if (el.has('flash')) throw new Error('flash buyer must not qualify');
if (el.get('seller') !== 2n * M) throw new Error('seller counts at their lowest balance');
const shares = computeShares(el, 50, 0.10);
const sum = shares.reduce((a, b) => a + b.share, 0);
const whale = shares.find(x => x.wallet === 'whale')!;
console.log(`recipients ${shares.length}, share sum ${sum.toFixed(6)}, whale ${(whale.share * 100).toFixed(2)}% (cap 10%), smallest ${(shares[shares.length - 1].share * 100).toFixed(3)}%`);
if (shares.length !== 50) throw new Error('top 50 only');
if (Math.abs(sum - 1) > 1e-9) throw new Error('shares must sum to 1');
if (whale.share > 0.1 + 1e-9) throw new Error('cap broken');
for (let i = 1; i < shares.length; i++) if (shares[i].share > shares[i - 1].share + 1e-12) throw new Error('order broken');
const total = 123_456_789_012_345n;
const amts = splitAmount(total, shares.map(x => x.share));
const sent = amts.reduce((a, b) => a + b, 0n);
console.log(`tokens: bought ${total}, sent ${sent}, dust kept ${total - sent}`);
if (sent > total) throw new Error('overspend');
if ((total - sent) * 1_000_000_000n > total) throw new Error('too much dust');
const few = computeShares(new Map([['a', 10n * M], ['b', 1n * M]]), 50, 0.10);
console.log('two holders:', few.map(x => `${x.wallet} ${(x.share * 100).toFixed(1)}%`).join(', '));
console.log('ALL CHECKS PASSED');
