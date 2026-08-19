/**
 * mcp-gauge — Model Context Protocol server for GAUGE.
 *
 * Exposes GAUGE's verifiable, pay-per-call signals to any MCP host (Claude Desktop, Cursor,
 * MCP-compatible agents). Free discovery tools need no wallet; paid screening-level tools pay
 * per call in USDC on Base via x402 (EIP-3009 gasless, no API key). Pure description: official
 * sources (USGS/NOAA/EPA/CAMS/ERA5/FRED/Marine/SEC-EDGAR) + back-testable stats + record_hash.
 *
 * Env:
 *   GAUGE_BASE_URL     default https://api.truthbear.co
 *   EVM_PRIVATE_KEY    0x Base-mainnet key (needs a little USDC) — required only for PAID tools
 *   GAUGE_MAX_USDC     atomic per-call cap, default 350000 ($0.35)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE = (process.env.GAUGE_BASE_URL || "https://api.truthbear.co").replace(/\/$/, "");
// ★★2026-08-16 security review: the cap was $0.12 while 10 of the 12 paid tools call
//   $0.25 endpoints. x402-fetch rejects locally when maxAmountRequired > maxValue, so those
//   tools were DEAD ON ARRIVAL - the request never left the client, nothing reached our logs,
//   and the agent just saw a generic failure. Our own 402 challenge literally warns about this:
//   "above the x402 client default maxValue ... your own client rejects this payment locally".
//   We shipped that warning for third parties and then configured our own client into it.
//   $0.35 is the highest bundle price in the live catalog (plus /gauge/subscribe at $9.90,
//   which no tool here calls), so 350000 covers every tool while still blocking a runaway.
const MAX = BigInt(process.env.GAUGE_MAX_USDC || "350000"); // $0.35 per-call cap - covers every paid tool in the live catalog
// Daily cumulative spend cap — defends against prompt-injection / runaway agent draining the wallet
// via repeated paid calls (each ≤ MAX). In-memory (resets on restart / at UTC midnight); counts MAX per
// paid call as a conservative upper bound. Raise GAUGE_DAILY_MAX_USDC to increase. Default $5/day.
const DAILY_MAX = BigInt(process.env.GAUGE_DAILY_MAX_USDC || "5000000");
let _spendDay = "";
let _spentToday = 0n;
function assertDailyCap() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _spendDay) { _spendDay = today; _spentToday = 0n; }
  if (_spentToday + MAX > DAILY_MAX) {
    throw new Error(`GAUGE daily spend cap reached (${DAILY_MAX} atomic USDC/day). Blocks runaway/prompt-injection wallet drain. Raise GAUGE_DAILY_MAX_USDC or restart to reset.`);
  }
  // ★NOTE (2026-08-16): this charges the *worst case* (MAX) up front and never refunds, so a
  //   $0.01 call, a failed call, and an honest no_charge:true miss all burn the full cap.
  //   That contradicts the "no charge when nothing is found" promise at the budget layer.
  //   Charging the settled amount instead needs the settlement response threaded back here;
  //   left as-is for now rather than half-done, but it is a real over-count - see docs.
  _spentToday += MAX;
}

function wallet() {
  let pk = process.env.EVM_PRIVATE_KEY || process.env.GAUGE_PRIVATE_KEY;
  if (!pk) return null;
  if (!pk.startsWith("0x")) pk = "0x" + pk;
  return createWalletClient({ account: privateKeyToAccount(pk as `0x${string}`), chain: base, transport: http() });
}
async function freeGet(path: string): Promise<any> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`GAUGE ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function paidGet(path: string): Promise<any> {
  const w = wallet();
  if (!w) throw new Error("EVM_PRIVATE_KEY not set — paid GAUGE tools need a Base-mainnet wallet with a little USDC (x402, gasless, no API key). Set EVM_PRIVATE_KEY in this MCP server's env. Free tools (gauge_catalog/sample/preview/river_free) work without a wallet.");
  assertDailyCap();   // daily cumulative spend cap - stops a prompt-injected or runaway agent from draining the wallet with repeated paid calls
  // cast: viem WalletClient signs EIP-3009 at runtime; x402-fetch's SignerWallet type is stricter across viem versions
  const payFetch = wrapFetchWithPayment(fetch, w as any, MAX);
  const r = await payFetch(BASE + path, { method: "GET" });
  if (!r.ok) throw new Error(`GAUGE ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const q = (s: string) => encodeURIComponent(s);
const ok = (o: any) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });
const fail = (e: any) => ({ content: [{ type: "text" as const, text: "Error: " + (e?.message || String(e)) }], isError: true });

const server = new McpServer({ name: "gauge", version: "0.1.0" });

// ───────────────────────── FREE tools (no wallet) ─────────────────────────
server.registerTool("gauge_catalog", {
  title: "GAUGE catalog (free)",
  description: "List all GAUGE signals — hydrology (river level/streamflow), air quality (AQI/PM2.5), precipitation/drought, agriculture (drought/heat/crop VHI), power grid (demand/renewables/energy inflation), shipping (route disruption/sea state/AIS throughput), regulatory filing (8-K/late filing/insider) — with the entities you can query. Free, no payment.",
  inputSchema: {},
}, async () => { try { return ok(await freeGet("/gauge/catalog")); } catch (e) { return fail(e); } });

server.registerTool("gauge_preview", {
  title: "GAUGE preview & pricing menu (free)",
  description: "GAUGE coverage counts, à-la-carte pricing menu, and the lists of region/company bundles (regions, agri_regions, grid_regions, shipping_regions, filing_watchlist). Use this to discover what to buy. Free.",
  inputSchema: {},
}, async () => { try { return ok(await freeGet("/gauge/preview")); } catch (e) { return fail(e); } });

server.registerTool("gauge_sample", {
  title: "GAUGE free sample record",
  description: "A free full sample GAUGE record — shows exactly what a paid response contains: current reading vs official thresholds (band, distance-to-action), seasonal statistical anomaly (percentile/strata), sources + record_hash provenance. Try before you buy.",
  inputSchema: {},
}, async () => { try { return ok(await freeGet("/gauge/sample")); } catch (e) { return fail(e); } });

server.registerTool("gauge_river_free", {
  title: "Free US river reading",
  description: "Free raw US river reading (gage height / streamflow) for a USGS site id — current/previous/change/trend/sources/record_hash. No payment. Example site 07010000 = Mississippi at St. Louis.",
  inputSchema: {
    entity: z.string().describe("USGS site id, e.g. 07010000"),
    signal_id: z.enum(["hydrology.river-level", "hydrology.streamflow"]).optional().describe("default hydrology.river-level"),
  },
}, async ({ entity, signal_id }) => { try { return ok(await freeGet(`/gauge/raw?signal_id=${q(signal_id || "hydrology.river-level")}&entity=${q(entity)}`)); } catch (e) { return fail(e); } });

// ───────────────────────── PAID tools (x402, USDC on Base) ─────────────────────────
// 2026-08-19: a correctly-named front door for the cheap tier.
//   Why: the problem was never the price. The entry price ($0.005-$0.01) is cheaper than about
//   69% of the services in this market that have real, multi-buyer volume. The problem is the
//   shape of the catalogue: eleven $0.25 bundles against one cheap tool, and that one cheap tool
//   was called `gauge_flood_risk`. A planner looking for "check one official fact before I act"
//   would never pick a tool named after floods.
//   So: add a generic name pointing at the same $0.01 endpoint. No price change, no delivery
//   change, no existing tool renamed - this is a front door, not a migration.
//   The naming also carries the positioning: these facts are a PRE-EXECUTION CHECK, not a query.
//   In this market the money follows action and checkout rails; agents pay when a piece of data
//   stops them making an expensive real-world mistake.
server.registerTool("verify_signal", {
  title: "Verify one official fact before you act ($0.01)",
  description: "PRE-EXECUTION CHECK. Verify one official-source fact before your agent commits to an action - a payout, an order, a route, a filing, an alert. Returns the current official reading against the OFFICIAL threshold ladder (band, distance-to-action), a 5-year same-season percentile so you can tell routine from unusual, the source URL, and a record_hash you can recompute offline to prove the answer was not altered. 180+ signals across macro, weather, hazard, shipping, filings, crypto and lifecycle lines - this is the cheapest and most general entry point; the $0.25 *_region tools are the multi-leg audit version of the same thing. Costs $0.01 USDC on Base via x402. Free coverage check first at gauge_catalog. Descriptive only, never a forecast or advice. No data -> not billed.",
  inputSchema: {
    signal_id: z.string().describe("what to check, in genus.species form, e.g. hydrology.river-level, macro.unemployment, crypto.spot, earthquake.current_activity - full list free via gauge_catalog"),
    entity: z.string().describe("which object, PAIRED WITH signal_id, e.g. 07010000 for hydrology.river-level, japan for earthquake.current_activity - valid pairs free via gauge_catalog"),
  },
}, async ({ signal_id, entity }) => { try { return ok(await paidGet(`/gauge?signal_id=${q(signal_id)}&entity=${q(entity)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_flood_risk", {
  title: "Flood-risk / anomaly record ($0.01)",
  description: "Hydrology/air/precipitation alias of verify_signal - same endpoint, same $0.01 price; prefer verify_signal for anything else. Verifiable flood-risk / anomaly record for one signal+entity: current vs official USGS/NOAA/EPA/CAMS thresholds (band, distance-to-action) + 5yr seasonal anomaly (percentile/strata) + record_hash. Costs $0.01 USDC on Base via x402. Works for hydrology/air/precip signals.",
  inputSchema: {
    signal_id: z.string().describe("e.g. hydrology.river-level, hydrology.streamflow, airquality.aqi, airquality.pm25, precipitation.daily, precipitation.wetness30d"),
    entity: z.string().describe("USGS site id for rivers, or city id (e.g. us-chicago) for air/precip — see gauge_catalog"),
  },
}, async ({ signal_id, entity }) => { try { return ok(await paidGet(`/gauge?signal_id=${q(signal_id)}&entity=${q(entity)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_region", {
  title: "Region bundle: air + rain + river ($0.25)",
  description: "Three-leg region bundle for a US city: air quality + precipitation + nearby river, with cross-line corroboration narrative. Costs $0.25 USDC on Base. loc e.g. us-stlouis, us-chicago (see gauge_preview regions). Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { loc: z.string().describe("city id, e.g. us-stlouis") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_crop_drought", {
  title: "Agriculture triangle: crop drought ($0.25)",
  description: "Agriculture triangle for a grain region: agricultural drought (soil moisture vs official USDM D0–D4) + heat/GDD + crop vegetation health (NOAA satellite VHI) + cross-validation (has drought hit the crop canopy). For ag traders & crop insurers. Costs $0.25 USDC on Base. loc e.g. us-iowa, ar-pampas, ua-ukraine. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { loc: z.string().describe("grain region id, e.g. us-iowa, ar-pampas, ua-ukraine") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/agri-region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_grid_stress", {
  title: "Power grid triangle: grid stress & energy inflation ($0.25)",
  description: "Power grid triangle for a grid region: electricity demand pressure (temperature HDD/CDD load proxy) + renewable resource (solar/wind) + energy inflation (US CPI Energy YoY) / natural gas price + cross-validation (high demand × low renewables = grid squeeze → energy inflation). For power/energy & macro/inflation traders, utilities. Costs $0.25 USDC on Base. loc e.g. us-ercot, us-caiso, eu-germany. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { loc: z.string().describe("grid region id, e.g. us-ercot, us-caiso, eu-germany") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/grid-region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_route_disruption", {
  title: "Shipping triangle: route disruption & throughput ($0.25)",
  description: "Shipping/port triangle for a chokepoint: logistics-flow disruption (WMO sea state + wind vs operational thresholds) + sea-state cause (wave decomposition: local-storm vs distant-swell) + live AIS vessel throughput (waiting vs transiting + congestion) + cross-validation. For shipping lines, commodity/freight traders, ports, marine insurers. Costs $0.25 USDC on Base. loc e.g. malacca, suez-redsea, hormuz, channel. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { loc: z.string().describe("chokepoint id, e.g. malacca, suez-redsea, hormuz, channel") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/shipping-region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_filing_check", {
  title: "Regulatory-filing triangle: corporate distress & insider ($0.25)",
  description: "Regulatory-filing triangle for a company: 8-K material events (item severity — bankruptcy/default/restatement/delisting = critical) + NT late-filing delinquency (distress leading indicator) + Form 4 insider net open-market buy/sell + cross-validation (do insiders confirm the distress by selling or contradict it by buying). All official SEC EDGAR. For event-driven/activist/short funds, quant funds, credit & distressed analysts. Costs $0.25 USDC on Base. entity = ticker e.g. AMC, CVNA, GME. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { entity: z.string().describe("ticker from watchlist, e.g. AMC, CVNA, GME, BA (see gauge_preview filing_watchlist)") },
}, async ({ entity }) => { try { return ok(await paidGet(`/gauge/filing-company?entity=${q(entity.toUpperCase())}`)); } catch (e) { return fail(e); } });

// ──────────── PAID tools — crypto / emerging-finance lifecycle (x402, USDC on Base) ────────────
server.registerTool("gauge_stablecoin_lifecycle", {
  title: "Stablecoin lifecycle triangle: peg-distress & redemption flight ($0.25)",
  description: "Verifiable stablecoin lifecycle record for one issuer: peg-distress band (current price vs the $1 anchor — distance-to-action) + redemption-flight pressure (supply/reserve/outflow dynamics) + downstream exposure cascade + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of where a stablecoin sits in its lifecycle — not investment advice, no buy/sell framing. Costs $0.25 USDC on Base via x402. entity e.g. terrausd-ust, usdc-circle, usdt. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { entity: z.string().describe("stablecoin id, e.g. terrausd-ust, usdc-circle, usdt (see gauge_catalog)") },
}, async ({ entity }) => { try { return ok(await paidGet(`/gauge/stablecoin-region?entity=${q(entity)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_rwa_lifecycle", {
  title: "Tokenized RWA lifecycle triangle: redemption pressure & exposure cascade ($0.25)",
  description: "Verifiable tokenized real-world-asset (RWA) issuer lifecycle record: issuer lifecycle band + redemption pressure (NAV vs on-chain supply, outflow) + exposure cascade to downstream holders/protocols + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of a tokenized-asset issuer's lifecycle position — not investment advice, no buy/sell framing. Costs $0.25 USDC on Base via x402. entity e.g. blackrock-buidl, ondo-ousg. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { entity: z.string().describe("RWA issuer id, e.g. blackrock-buidl, ondo-ousg (see gauge_catalog)") },
}, async ({ entity }) => { try { return ok(await paidGet(`/gauge/rwa-region?entity=${q(entity)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_lrt_lifecycle", {
  title: "Liquid-restaking (LRT) lifecycle triangle: redemption queue & collateral cascade ($0.25)",
  description: "Verifiable liquid-restaking-token (LRT) lifecycle record: lifecycle band anchored to ETH-NAV (NOT $1) + redemption-queue pressure (withdrawal backlog, discount-to-NAV) + collateral cascade to protocols using the LRT as collateral + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of where an LRT sits in its lifecycle — not investment advice, no buy/sell framing. Costs $0.25 USDC on Base via x402. entity e.g. etherfi-weeth, renzo-ezeth. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { entity: z.string().describe("LRT id, e.g. etherfi-weeth, renzo-ezeth (see gauge_catalog)") },
}, async ({ entity }) => { try { return ok(await paidGet(`/gauge/lrt-region?entity=${q(entity)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_defi_lending", {
  title: "DeFi lending protocol lifecycle triangle: bad-debt stress & contagion ($0.25)",
  description: "Verifiable DeFi lending-protocol lifecycle record: protocol lifecycle band + bad-debt stress (utilization, insolvency/underwater-position pressure) + contagion cascade to correlated protocols and collateral + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of a lending protocol's lifecycle position — not investment advice, no buy/sell framing. Costs $0.25 USDC on Base via x402. entity = protocol id (see gauge_catalog). Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { entity: z.string().describe("DeFi lending protocol id (see gauge_catalog)") },
}, async ({ entity }) => { try { return ok(await paidGet(`/gauge/defilending-region?entity=${q(entity)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_depin_network", {
  title: "DePIN network lifecycle triangle: reward churn & downstream exposure ($0.25)",
  description: "Verifiable DePIN (decentralized physical infrastructure) network lifecycle record: network-liveness lifecycle band (active nodes/coverage/throughput) + reward-churn pressure (emissions vs participation, node attrition) + downstream exposure cascade + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of a DePIN network's lifecycle position — not investment advice, no buy/sell framing. Costs $0.25 USDC on Base via x402. entity e.g. helium, render, filecoin. Set your x402 client maxValue to at least $0.25 - the common default of $0.10 rejects this locally, before the request is sent.",
  inputSchema: { entity: z.string().describe("DePIN network id, e.g. helium, render, filecoin (see gauge_catalog)") },
}, async ({ entity }) => { try { return ok(await paidGet(`/gauge/depin-region?entity=${q(entity)}`)); } catch (e) { return fail(e); } });

// ──────────── PAID tool — Proposer-Feed resolution for prediction-market LLM proposers (x402) ────────────
server.registerTool("gauge_resolution_as_of", {
  title: "Proposer-feed resolution: official fact + evidence + source-agreement confidence ($0.01)",
  description: "Resolves a prediction-market question to the OFFICIAL FACT for an issuer/form. Returns the official answer (boolean) + a verifiable evidence_url + source_tier + a source-AGREEMENT confidence in [0,1] + _citation. This is the recorded official fact and how strongly official sources agree on it — it is NOT a prediction of the market outcome, and the confidence is NOT a probability that the market resolves yes. Honest-fails with no charge ({ answer:null, confidence:0, no_charge:true, note }) when the fact is not officially determinable as of the cutoff. Screening-grade, official sources only. Costs $0.01 USDC on Base via x402 (no charge on honest-fail).",
  inputSchema: {
    issuer: z.string().describe("the entity/issuer the question is about (e.g. a ticker or issuer id)"),
    form: z.string().optional().describe("the official form/event type to resolve against (e.g. a filing form), if applicable"),
    as_of: z.string().optional().describe("optional cutoff timestamp — resolve the fact as known at this instant (ISO 8601)"),
  },
}, async ({ issuer, form, as_of }) => {
  try {
    const params = [`issuer=${q(issuer)}`];
    if (form) params.push(`form=${q(form)}`);
    if (as_of) params.push(`as_of=${q(as_of)}`);
    return ok(await paidGet(`/resolve/proposer?${params.join("&")}`));
  } catch (e) { return fail(e); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("mcp-gauge running (stdio). Base=" + BASE + " wallet=" + (wallet() ? "set" : "unset — free tools only"));
