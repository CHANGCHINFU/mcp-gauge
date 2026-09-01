#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";
var BASE = (process.env.GAUGE_BASE_URL || "https://api.truthbear.co").replace(/\/$/, "");
var MAX = BigInt(process.env.GAUGE_MAX_USDC || "350000");
var DAILY_MAX = BigInt(process.env.GAUGE_DAILY_MAX_USDC || "5000000");
var _spendDay = "";
var _spentToday = 0n;
function assertDailyCap() {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (today !== _spendDay) {
    _spendDay = today;
    _spentToday = 0n;
  }
  if (_spentToday + MAX > DAILY_MAX) {
    throw new Error(`GAUGE daily spend cap reached (${DAILY_MAX} atomic USDC/day). Blocks runaway/prompt-injection wallet drain. Raise GAUGE_DAILY_MAX_USDC or restart to reset.`);
  }
  _spentToday += MAX;
}
function wallet() {
  let pk = process.env.EVM_PRIVATE_KEY || process.env.GAUGE_PRIVATE_KEY;
  if (!pk) return null;
  if (!pk.startsWith("0x")) pk = "0x" + pk;
  return createWalletClient({ account: privateKeyToAccount(pk), chain: base, transport: http() });
}
async function freeGet(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`GAUGE ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function paidGet(path) {
  const w = wallet();
  if (!w) throw new Error("EVM_PRIVATE_KEY not set \u2014 paid GAUGE tools need a Base-mainnet wallet with a little USDC (x402, gasless, no API key). Set EVM_PRIVATE_KEY in this MCP server's env. Free tools (gauge_catalog/sample/preview/river_free) work without a wallet.");
  assertDailyCap();
  const payFetch = wrapFetchWithPayment(fetch, w, MAX);
  const r = await payFetch(BASE + path, { method: "GET" });
  if (!r.ok) throw new Error(`GAUGE ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
var q = (s) => encodeURIComponent(s);
var ok = (o) => ({ content: [{ type: "text", text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });
var fail = (e) => ({ content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true });
var server = new McpServer({ name: "gauge", version: "0.1.0" });
server.registerTool("gauge_catalog", {
  title: "GAUGE catalog (free)",
  description: "List all 180+ available signal_id + entity pairs across USGS, NOAA, EPA, CAMS, ERA5, FRED, SEC-EDGAR, and crypto. Use this first to discover what to query with verify_signal or the $0.25 bundles. Free.",
  inputSchema: {}
}, async () => {
  try {
    return ok(await freeGet("/gauge/catalog"));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_preview", {
  title: "GAUGE preview & pricing menu (free)",
  description: "Get pricing menu and available region/entity lists (regions, agri_regions, grid_regions, shipping_regions, filing_watchlist). Use to discover valid loc/entity values for the $0.25 bundle tools. Free.",
  inputSchema: {}
}, async () => {
  try {
    return ok(await freeGet("/gauge/preview"));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_sample", {
  title: "GAUGE free sample record",
  description: "Preview the exact JSON shape of a paid response \u2014 value, thresholds, 5-year norms, source URL, and Bitcoin-anchored record_hash. Use to inspect output format before paying. Free.",
  inputSchema: {}
}, async () => {
  try {
    return ok(await freeGet("/gauge/sample"));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_river_free", {
  title: "Free US river reading",
  description: "Get a live USGS river reading (gage height or streamflow) with Bitcoin-anchored receipt. Returns current value, previous, change, trend, and source URL. Free. Example: entity 07010000 = Mississippi at St. Louis.",
  inputSchema: {
    entity: z.string().describe("USGS site id, e.g. 07010000"),
    signal_id: z.enum(["hydrology.river-level", "hydrology.streamflow"]).optional().describe("default hydrology.river-level")
  }
}, async ({ entity, signal_id }) => {
  try {
    return ok(await freeGet(`/gauge/raw?signal_id=${q(signal_id || "hydrology.river-level")}&entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_anchor", {
  title: "Bitcoin anchor proof for a record_hash (free)",
  description: "Verify any GAUGE receipt against Bitcoin. Returns Merkle proof + OpenTimestamps data proving a record existed at a specific time, independently verifiable without our server. Use to audit past responses. Free.",
  inputSchema: {
    hash: z.string().describe("the record_hash from any GAUGE response, e.g. sha256:5969b8a147f438254eda...")
  }
}, async ({ hash }) => {
  try {
    return ok(await freeGet(`/gauge/anchor?hash=${q(hash)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("verify_signal", {
  title: "Verify one official fact before you act ($0.01)",
  description: "Check one official fact from 180+ signals before acting (trade, payout, route, alert). $0.01. Returns value, action thresholds, 5-year seasonal norms, source URL, and Bitcoin-anchored receipt. No data found \u2192 no charge. For multi-source cross-validation, use the $0.25 bundle tools instead.",
  inputSchema: {
    signal_id: z.string().describe("what to check, in genus.species form, e.g. hydrology.river-level, macro.unemployment, crypto.spot, earthquake.current_activity - full list free via gauge_catalog"),
    entity: z.string().describe("which object, PAIRED WITH signal_id, e.g. 07010000 for hydrology.river-level, japan for earthquake.current_activity - valid pairs free via gauge_catalog")
  }
}, async ({ signal_id, entity }) => {
  try {
    return ok(await paidGet(`/gauge?signal_id=${q(signal_id)}&entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_flood_risk", {
  title: "Flood-risk / anomaly record ($0.01)",
  description: "Check if a hydrology/air/precip reading is abnormal vs official thresholds + 5-year baseline. $0.01. Same endpoint as verify_signal; prefer verify_signal for non-hydrology signals. No data \u2192 no charge.",
  inputSchema: {
    signal_id: z.string().describe("e.g. hydrology.river-level, hydrology.streamflow, airquality.aqi, airquality.pm25, precipitation.daily, precipitation.wetness30d"),
    entity: z.string().describe("USGS site id for rivers, or city id (e.g. us-chicago) for air/precip \u2014 see gauge_catalog")
  }
}, async ({ signal_id, entity }) => {
  try {
    return ok(await paidGet(`/gauge?signal_id=${q(signal_id)}&entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_region", {
  title: "Region bundle: air + rain + river ($0.25)",
  description: "Cross-check 3 independent sources for a region: air quality + precipitation + nearest river. $0.25. Flags contradictions between sources. Returns all readings + Bitcoin-anchored receipt. loc e.g. us-stlouis, us-chicago (see gauge_preview). Set x402 maxValue \u2265 $0.25.",
  inputSchema: { loc: z.string().describe("city id, e.g. us-stlouis") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_crop_drought", {
  title: "Agriculture triangle: crop drought ($0.25)",
  description: "Cross-check 3 sources for crop drought: soil moisture (USDM D0\u2013D4) + heat/growing-degree-days + satellite crop health (NOAA VHI). $0.25. Flags if sources contradict (e.g. drought declared but canopy green). Bitcoin-anchored receipt. loc e.g. us-iowa, ar-pampas, ua-ukraine. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { loc: z.string().describe("grain region id, e.g. us-iowa, ar-pampas, ua-ukraine") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/agri-region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_grid_stress", {
  title: "Power grid triangle: grid stress & energy inflation ($0.25)",
  description: "Cross-check 3 sources for power grid stress: demand pressure + renewable output (solar/wind) + energy inflation. $0.25. Flags misleading signals (e.g. high demand but also high renewables). Bitcoin-anchored receipt. loc e.g. us-ercot, us-caiso, eu-germany. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { loc: z.string().describe("grid region id, e.g. us-ercot, us-caiso, eu-germany") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/grid-region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_route_disruption", {
  title: "Shipping triangle: route disruption & throughput ($0.25)",
  description: "Cross-check 3 sources for shipping route disruption: sea state vs thresholds + wave cause (storm vs swell) + live AIS vessel traffic. $0.25. Bitcoin-anchored receipt for cargo dispute audit. loc e.g. malacca, suez-redsea, hormuz, channel. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { loc: z.string().describe("chokepoint id, e.g. malacca, suez-redsea, hormuz, channel") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/shipping-region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_filing_check", {
  title: "Regulatory-filing triangle: corporate distress & insider ($0.25)",
  description: "Cross-check 3 SEC EDGAR sources for corporate distress: 8-K material events (bankruptcy/default/restatement) + late-filing delinquency + insider buy/sell pattern. $0.25. Bitcoin-anchored receipt for regulatory audit trail. entity = ticker e.g. AMC, CVNA, GME. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { entity: z.string().describe("ticker from watchlist, e.g. AMC, CVNA, GME, BA (see gauge_preview filing_watchlist)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/filing-company?entity=${q(entity.toUpperCase())}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_stablecoin_lifecycle", {
  title: "Stablecoin lifecycle triangle: peg-distress & redemption flight ($0.25)",
  description: "Cross-check 3 sources for stablecoin stress: peg drift from $1 + redemption acceleration + downstream protocol exposure. $0.25. Catches bank-run signals before price moves. Bitcoin-anchored receipt. Not investment advice. entity e.g. terrausd-ust, usdc-circle, usdt. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { entity: z.string().describe("stablecoin id, e.g. terrausd-ust, usdc-circle, usdt (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/stablecoin-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_rwa_lifecycle", {
  title: "Tokenized RWA lifecycle triangle: redemption pressure & exposure cascade ($0.25)",
  description: "Cross-check 3 sources for tokenized RWA health: lifecycle position + redemption pressure (NAV vs supply + outflows) + downstream exposure if it unwinds. $0.25. Bitcoin-anchored receipt. Not investment advice. entity e.g. blackrock-buidl, ondo-ousg. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { entity: z.string().describe("RWA issuer id, e.g. blackrock-buidl, ondo-ousg (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/rwa-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_lrt_lifecycle", {
  title: "Liquid-restaking (LRT) lifecycle triangle: redemption queue & collateral cascade ($0.25)",
  description: "Cross-check 3 sources for LRT collateral risk: discount-to-NAV (vs ETH, not $1) + withdrawal queue backlog + contagion map if LRT depegs. $0.25. Bitcoin-anchored receipt. Not investment advice. entity e.g. etherfi-weeth, renzo-ezeth. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { entity: z.string().describe("LRT id, e.g. etherfi-weeth, renzo-ezeth (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/lrt-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_defi_lending", {
  title: "DeFi lending protocol lifecycle triangle: bad-debt stress & contagion ($0.25)",
  description: "Cross-check 3 sources for DeFi lending stress: utilization + underwater-position pressure + contagion to correlated protocols. $0.25. Bitcoin-anchored receipt. Not investment advice. entity = protocol id (see gauge_catalog). Set x402 maxValue \u2265 $0.25.",
  inputSchema: { entity: z.string().describe("DeFi lending protocol id (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/defilending-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_depin_network", {
  title: "DePIN network lifecycle triangle: reward churn & downstream exposure ($0.25)",
  description: "Cross-check 3 sources for DePIN network health: network liveness + reward-churn pressure (emissions vs participation) + downstream exposure. $0.25. Bitcoin-anchored receipt. Not investment advice. entity e.g. helium, render, filecoin. Set x402 maxValue \u2265 $0.25.",
  inputSchema: { entity: z.string().describe("DePIN network id, e.g. helium, render, filecoin (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/depin-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_resolution_as_of", {
  title: "Proposer-feed resolution: official fact + evidence + source-agreement confidence ($0.01)",
  description: "Resolve a prediction-market question to the official fact. $0.01. Returns answer, evidence URL, source-agreement confidence, and Bitcoin-anchored receipt for disputed settlements. No charge if the fact is not yet officially determinable. Not a prediction \u2014 recorded official fact only.",
  inputSchema: {
    issuer: z.string().describe("the entity/issuer the question is about (e.g. a ticker or issuer id)"),
    form: z.string().optional().describe("the official form/event type to resolve against (e.g. a filing form), if applicable"),
    as_of: z.string().optional().describe("optional cutoff timestamp \u2014 resolve the fact as known at this instant (ISO 8601)")
  }
}, async ({ issuer, form, as_of }) => {
  try {
    const params = [`issuer=${q(issuer)}`];
    if (form) params.push(`form=${q(form)}`);
    if (as_of) params.push(`as_of=${q(as_of)}`);
    return ok(await paidGet(`/resolve/proposer?${params.join("&")}`));
  } catch (e) {
    return fail(e);
  }
});
var transport = new StdioServerTransport();
await server.connect(transport);
console.error("mcp-gauge running (stdio). Base=" + BASE + " wallet=" + (wallet() ? "set" : "unset \u2014 free tools only"));
