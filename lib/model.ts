// The token radar's model: one snapshot of the protocol universe in, one ranked board out (radar-2).
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the floor: the early rows the radar exists to find. A protocol is
// pre-token when its own record carries no token at all (no market cap, no CoinGecko id, no symbol);
// the protocols whose token already trades are kept in a separate set, never mixed into the ranked
// board, and shown at the market's own values instead of a model's.
//
// Implied value follows only from the snapshot's own figures. No protocol name is ever special-cased:
// the same function scores every row, and every factor it uses is printed on the row.
//
//   base       = tvl_usd x base_multiple                      (what a launch would capitalise at TVL)
//   growth     = clamp(change_7d, growth_floor, growth_cap)   (the protocol's own 7-day momentum)
//   growthMult = 1 + (growth / 100) x growth_weight
//   maturity   = maturity_floor + min(age_days, maturity_days) / maturity_days x maturity_range
//                (age_days is how long DefiLlama has tracked a protocol that records no token; a
//                 protocol tracked for less than unproven_days is scaled by unproven_penalty)
//   sectorMult = the category's premium, from the table below, matched on DefiLlama's category text
//   chainMult  = the first chain's premium plus a breadth bonus per extra chain, capped
//   implied    = max(1, round(base x growthMult x maturityMult x sectorMult x chainMult))
//
// The constants are the model's, stated on the dashboard and changeable in its sandbox.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  unproven_days: number;
  unproven_penalty: number;
  breadth_step: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.28,
  growth_weight: 0.6,
  growth_floor: -60,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  unproven_days: 120,
  unproven_penalty: 0.85,
  breadth_step: 0.03,
  breadth_cap: 0.12,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 360;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A sector's premium over the base multiple, matched on the protocol's own category text. */
interface SectorRule {
  match: string[];
  multiplier: number;
  label: string;
}

/**
 * The sector table: keyed on DefiLlama's category words, never on a protocol's name, and applied to
 * every protocol whose category contains one of the words. A category no rule names keeps 1.0.
 */
const SECTORS: SectorRule[] = [
  { match: ['rwa', 'real world'], multiplier: 1.35, label: 'real-world assets' },
  { match: ['lending', 'cdp', 'collateral'], multiplier: 1.25, label: 'lending' },
  { match: ['perp', 'derivative', 'options'], multiplier: 1.2, label: 'derivatives' },
  { match: ['dex', 'yield', 'leveraged farm', 'amm'], multiplier: 1.15, label: 'trading' },
  { match: ['prediction'], multiplier: 1.15, label: 'prediction markets' },
  { match: ['curator', 'vault', 'allocator'], multiplier: 1.1, label: 'vaults' },
  { match: ['basis trade', 'delta neutral'], multiplier: 1.1, label: 'basis trading' },
  { match: ['bridge', 'canonical bridge', 'cross chain'], multiplier: 1.05, label: 'bridging' },
  { match: ['liquid staking', 'restak'], multiplier: 0.85, label: 'staking receipts' },
  { match: ['stablecoin', 'stable'], multiplier: 0.9, label: 'stable assets' },
  { match: ['insurance'], multiplier: 1.0, label: 'cover' },
  { match: ['cex'], multiplier: 0.8, label: 'centralised exchange' },
];

/** The premium of the first chain a protocol names; a chain no rule names keeps 1.0. */
const CHAINS: Array<[string, number]> = [
  ['ethereum', 1.12],
  ['solana', 1.12],
  ['base', 1.08],
  ['sui', 1.06],
  ['aptos', 1.05],
  ['bsc', 1.05],
  ['binance', 1.05],
  ['arbitrum', 1.05],
  ['hyperliquid', 1.05],
  ['ton', 1.05],
  ['optimism', 1.03],
  ['polygon', 1.02],
  ['avalanche', 1.02],
];

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with every factor the implied value used. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    sector_multiplier: number;
    sector_label: string;
    chain_multiplier: number;
    age_days: number | null;
    breadth: number;
  };
  farm_cost_usd: number;
  farm_days: number;
  thesis: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  sector_multiplier: number;
  chain_multiplier: number;
  sector_label: string;
  farm_cost_usd: number;
  farm_days: number;
  thesis: string;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  token_status: 'trading';
  mcap_over_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  pre_token_size: number;
  trading_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The sector premium and label a category gets, from the sector table alone. */
export function sectorOf(category: string | null): { multiplier: number; label: string } {
  const c = (category ?? '').toLowerCase();
  for (const rule of SECTORS) if (rule.match.some((m) => c.includes(m))) return { multiplier: rule.multiplier, label: rule.label };
  return { multiplier: 1.0, label: category === null ? 'untagged' : category.toLowerCase() };
}

/** The chain premium and breadth of a protocol's chain list: the first chain's rule plus a breadth bonus. */
export function chainOf(protocol: SnapshotProtocol, model: ModelConstants): { multiplier: number; first: string; breadth: number } {
  const first = protocol.chains.length > 0 ? protocol.chains[0]! : 'its main chain';
  const key = first.toLowerCase();
  const rule = CHAINS.find(([name]) => key.includes(name));
  const firstPremium = rule === undefined ? 1.0 : rule[1];
  const breadth = Math.min(model.breadth_cap, Math.max(0, protocol.chains.length - 1) * model.breadth_step);
  return { multiplier: firstPremium + breadth, first, breadth };
}

/** Every factor and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): {
  implied: number;
  base: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  sectorMult: number;
  sectorLabel: string;
  chainMult: number;
  breadth: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const yearsIn = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const maturityMult = age !== null && age < model.unproven_days ? yearsIn * model.unproven_penalty : yearsIn;
  const sector = sectorOf(protocol.category);
  const chain = chainOf(protocol, model);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * sector.multiplier * chain.multiplier));
  return {
    implied,
    base,
    growthPct,
    growthMult,
    maturityMult,
    sectorMult: sector.multiplier,
    sectorLabel: sector.label,
    chainMult: chain.multiplier,
    breadth: chain.breadth,
    age,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol's token already trades: its record carries a market cap, a CoinGecko id or a ticker. */
export function isTrading(p: SnapshotProtocol): boolean {
  return !isPreToken(p);
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const factors = impliedValue(p, snapshot.as_of, model);
    return { p, f: factors };
  });
  scored.sort((a, b) => b.f.implied - a.f.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const plan = farmPlan(s.p, s.f.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.f.age,
      implied_value_usd: s.f.implied,
      model: {
        base_multiple: model.base_multiple,
        base_usd: Math.round(s.f.base),
        growth_pct: round4(s.f.growthPct),
        growth_multiplier: round4(s.f.growthMult),
        maturity_multiplier: round4(s.f.maturityMult),
        sector_multiplier: s.f.sectorMult,
        sector_label: s.f.sectorLabel,
        chain_multiplier: round4(s.f.chainMult),
        age_days: s.f.age,
        breadth: round4(s.f.breadth),
      },
      farm_cost_usd: plan.capital + plan.fees,
      farm_days: plan.days,
      thesis: thesisOf(s.p, s.f),
      farm_steps: plan.steps.map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainName(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The sector's own opening action: what a farmer does on a protocol of this category, in one line. */
function entryActionOf(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('rwa') || c.includes('real world')) return `Pass ${name}'s own onboarding on ${chain} and mint $${capital} of its yield asset against your deposit.`;
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow 40 per cent of it in the same market.`;
  if (c.includes('perp') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and trade one small position a week on ${chain}.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('amm')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep it in range.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position a week on ${name}'s markets.`;
  if (c.includes('curator') || c.includes('vault') || c.includes('allocator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy ${capital} dollars of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis')) return `Open $${capital} of the delta-neutral basis trade on ${name} and roll it monthly.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The sector's second action: the one that doubles the protocol's own count of you, with its cost. */
function deepenActionOf(p: SnapshotProtocol, capital: number, chain: string): { text: string; cost: string; time: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('rwa') || c.includes('real world')) {
    return { text: `Hold the ${name} receipt through one full redemption cycle so the position is seen twice.`, cost: 'about $6 of gas per cycle on ' + chain, time: '30 days a cycle' };
  }
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) {
    return { text: `Borrow against the supplied position and repay on a fixed day each month so the borrow shows in every snapshot.`, cost: `about 4 per cent a year on $${Math.round(capital * 0.4)} borrowed`, time: '20 minutes a month' };
  }
  if (c.includes('perp') || c.includes('derivative') || c.includes('options')) {
    return { text: `Keep a maker order on the book for an hour a week and record each fill in the log.`, cost: `$${Math.round(capital * 0.01)} of fees a week`, time: '1 hour a week' };
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('amm')) {
    return { text: `Rebalance the range when the pool's price leaves it, and swap twice a week through the same pool.`, cost: `about $${Math.round(capital * 0.02)} of fees a month`, time: '15 minutes a week' };
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return { text: `Bridge a second time in the other direction so both sides of ${name} carry your address.`, cost: 'about 0.1 per cent of the amount plus gas', time: '20 minutes' };
  }
  return { text: `Make one qualifying action each week on ${name}: a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
}

/** A protocol's farm plan: six steps, each an action with a cost and a time, derived from its record. */
function farmPlan(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; capital: number; fees: number; days: number } {
  const chain = chainName(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const fees = capital >= 150 ? 12 : 6;
  const deepen = deepenActionOf(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet that holds only the $${capital} you plan to farm on ${chain}, and write its seed phrase down offline.`,
      cost: '$0 to create, under $3 of gas for the first transaction',
      time: '10 minutes',
    },
    {
      text: entryActionOf(p, capital, chain),
      cost: `$${capital} of capital and about $${Math.max(2, Math.round(capital * 0.02))} of gas`,
      time: '20 minutes to open the position',
    },
    {
      text: deepen.text,
      cost: deepen.cost,
      time: deepen.time,
    },
    {
      text: `Hold the position at least ${hold} days, so the activity is counted in more than one snapshot of ${p.name}.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points, rewards or app page before you withdraw, and claim only from the link the protocol publishes itself.`,
      cost: 'no fee to check, and never pay a claim fee',
      time: '10 minutes a month',
    },
    {
      text: `Log the wallet, the dates, the gas and every transaction in a farm log, and note the day you would unwind at.`,
      cost: 'nothing but the log',
      time: '5 minutes a month',
    },
  ];
  return { steps, capital, fees, days: hold };
}

/** One sentence a reader can check: the row's own figures and what a launch would be worth at them. */
function thesisOf(p: SnapshotProtocol, f: ReturnType<typeof impliedValue>): string {
  const tvl = Math.round(p.tvl_usd / 1_000_000);
  const age = f.age === null ? 'an unknown number of days' : `${f.age} days`;
  const growth = p.change_7d === null ? 'no reported 7-day change' : `${f.growthPct > 0 ? '+' : ''}${round4(f.growthPct)} per cent in 7 days`;
  const mcap = Math.round(f.implied / 1_000_000);
  return `${p.name} carries $${tvl}M of TVL on ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'} and records no token after ${age}, with ${growth}: a launch capitalised at ${round4(f.base / Math.max(p.tvl_usd, 1))} of TVL implies about $${mcap}M.`;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view (kept apart from the board). */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => isTrading(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      token_status: 'trading' as const,
      mcap_over_tvl: p.mcap_usd === null ? null : round4(p.mcap_usd / Math.max(p.tvl_usd, 1)),
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    sector_multiplier: row.model.sector_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    sector_label: row.model.sector_label,
    farm_cost_usd: row.farm_cost_usd,
    farm_days: row.farm_days,
    thesis: row.thesis,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    pre_token_size: board.length,
    trading_size: snapshot.protocols.filter(isTrading).length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
