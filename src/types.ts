export interface Candidate {
  mint: string; symbol: string; name: string; image?: string;
  pairAddress: string; dexId: string; url: string;
  priceUsd: number; priceNative: number; mcap: number; liqUsd: number;
  v1h: number; v6h: number; buys1h: number; sells1h: number;
  chg5m: number; chg1h: number; chg6h: number; ageH: number;
  x?: string; site?: string;
  geckoRank?: number; boosted?: boolean; xMentions1h?: number;
  parts?: Record<string, number>; score?: number; reject?: string;
}
export interface Recipient { wallet: string; balance: string; share: number; amount?: string; }
export interface Pick {
  hour: string; mint: string; symbol: string; name: string; image?: string; url: string;
  solIn: number; tokensOut: string; decimals: number; buyPriceUsd: number; mcapAtBuy: number;
  buyTx?: string; nowPriceUsd?: number; sinceBuyPct?: number;
  drop?: { count: number; txs: string[]; recipients: Recipient[] };
  score: number; parts: Record<string, number>;
}
