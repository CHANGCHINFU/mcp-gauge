#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";
var BASE = (process.env.GAUGE_BASE_URL || "https://aeml-x402.zeabur.app").replace(/\/$/, "");
var MAX = BigInt(process.env.GAUGE_MAX_USDC || "120000");
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
  description: "List all GAUGE signals \u2014 hydrology (river level/streamflow), air quality (AQI/PM2.5), precipitation/drought, agriculture (drought/heat/crop VHI), power grid (demand/renewables/energy inflation), shipping (route disruption/sea state/AIS throughput), regulatory filing (8-K/late filing/insider) \u2014 with the entities you can query. Free, no payment.",
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
  description: "GAUGE coverage counts, \xE0-la-carte pricing menu, and the lists of region/company bundles (regions, agri_regions, grid_regions, shipping_regions, filing_watchlist). Use this to discover what to buy. Free.",
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
  description: "A free full sample GAUGE record \u2014 shows exactly what a paid response contains: current reading vs official thresholds (band, distance-to-action), seasonal statistical anomaly (percentile/strata), sources + record_hash provenance. Try before you buy.",
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
  description: "Free raw US river reading (gage height / streamflow) for a USGS site id \u2014 current/previous/change/trend/sources/record_hash. No payment. Example site 07010000 = Mississippi at St. Louis.",
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
server.registerTool("gauge_flood_risk", {
  title: "Flood-risk / anomaly record ($0.05)",
  description: "Verifiable flood-risk / anomaly record for one signal+entity: current vs official USGS/NOAA/EPA/CAMS thresholds (band, distance-to-action) + 5yr seasonal anomaly (percentile/strata) + record_hash. Costs $0.05 USDC on Base via x402. Works for hydrology/air/precip signals.",
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
  title: "Region bundle: air + rain + river ($0.10)",
  description: "Three-leg region bundle for a US city: air quality + precipitation + nearby river, with cross-line corroboration narrative. Costs $0.10 USDC on Base. loc e.g. us-stlouis, us-chicago (see gauge_preview regions).",
  inputSchema: { loc: z.string().describe("city id, e.g. us-stlouis") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_crop_drought", {
  title: "Agriculture triangle: crop drought ($0.10)",
  description: "Agriculture triangle for a grain region: agricultural drought (soil moisture vs official USDM D0\u2013D4) + heat/GDD + crop vegetation health (NOAA satellite VHI) + cross-validation (has drought hit the crop canopy). For ag traders & crop insurers. Costs $0.10 USDC on Base. loc e.g. us-iowa, ar-pampas, ua-ukraine.",
  inputSchema: { loc: z.string().describe("grain region id, e.g. us-iowa, ar-pampas, ua-ukraine") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/agri-region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_grid_stress", {
  title: "Power grid triangle: grid stress & energy inflation ($0.10)",
  description: "Power grid triangle for a grid region: electricity demand pressure (temperature HDD/CDD load proxy) + renewable resource (solar/wind) + energy inflation (US CPI Energy YoY) / natural gas price + cross-validation (high demand \xD7 low renewables = grid squeeze \u2192 energy inflation). For power/energy & macro/inflation traders, utilities. Costs $0.10 USDC on Base. loc e.g. us-ercot, us-caiso, eu-germany.",
  inputSchema: { loc: z.string().describe("grid region id, e.g. us-ercot, us-caiso, eu-germany") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/grid-region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_route_disruption", {
  title: "Shipping triangle: route disruption & throughput ($0.10)",
  description: "Shipping/port triangle for a chokepoint: logistics-flow disruption (WMO sea state + wind vs operational thresholds) + sea-state cause (wave decomposition: local-storm vs distant-swell) + live AIS vessel throughput (waiting vs transiting + congestion) + cross-validation. For shipping lines, commodity/freight traders, ports, marine insurers. Costs $0.10 USDC on Base. loc e.g. malacca, suez-redsea, hormuz, channel.",
  inputSchema: { loc: z.string().describe("chokepoint id, e.g. malacca, suez-redsea, hormuz, channel") }
}, async ({ loc }) => {
  try {
    return ok(await paidGet(`/gauge/shipping-region?loc=${q(loc)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_filing_check", {
  title: "Regulatory-filing triangle: corporate distress & insider ($0.10)",
  description: "Regulatory-filing triangle for a company: 8-K material events (item severity \u2014 bankruptcy/default/restatement/delisting = critical) + NT late-filing delinquency (distress leading indicator) + Form 4 insider net open-market buy/sell + cross-validation (do insiders confirm the distress by selling or contradict it by buying). All official SEC EDGAR. For event-driven/activist/short funds, quant funds, credit & distressed analysts. Costs $0.10 USDC on Base. entity = ticker e.g. AMC, CVNA, GME.",
  inputSchema: { entity: z.string().describe("ticker from watchlist, e.g. AMC, CVNA, GME, BA (see gauge_preview filing_watchlist)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/filing-company?entity=${q(entity.toUpperCase())}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_stablecoin_lifecycle", {
  title: "Stablecoin lifecycle triangle: peg-distress & redemption flight ($0.10)",
  description: "Verifiable stablecoin lifecycle record for one issuer: peg-distress band (current price vs the $1 anchor \u2014 distance-to-action) + redemption-flight pressure (supply/reserve/outflow dynamics) + downstream exposure cascade + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of where a stablecoin sits in its lifecycle \u2014 not investment advice, no buy/sell framing. Costs $0.10 USDC on Base via x402. entity e.g. terrausd-ust, usdc-circle, usdt.",
  inputSchema: { entity: z.string().describe("stablecoin id, e.g. terrausd-ust, usdc-circle, usdt (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/stablecoin-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_rwa_lifecycle", {
  title: "Tokenized RWA lifecycle triangle: redemption pressure & exposure cascade ($0.10)",
  description: "Verifiable tokenized real-world-asset (RWA) issuer lifecycle record: issuer lifecycle band + redemption pressure (NAV vs on-chain supply, outflow) + exposure cascade to downstream holders/protocols + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of a tokenized-asset issuer's lifecycle position \u2014 not investment advice, no buy/sell framing. Costs $0.10 USDC on Base via x402. entity e.g. blackrock-buidl, ondo-ousg.",
  inputSchema: { entity: z.string().describe("RWA issuer id, e.g. blackrock-buidl, ondo-ousg (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/rwa-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_lrt_lifecycle", {
  title: "Liquid-restaking (LRT) lifecycle triangle: redemption queue & collateral cascade ($0.10)",
  description: "Verifiable liquid-restaking-token (LRT) lifecycle record: lifecycle band anchored to ETH-NAV (NOT $1) + redemption-queue pressure (withdrawal backlog, discount-to-NAV) + collateral cascade to protocols using the LRT as collateral + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of where an LRT sits in its lifecycle \u2014 not investment advice, no buy/sell framing. Costs $0.10 USDC on Base via x402. entity e.g. etherfi-weeth, renzo-ezeth.",
  inputSchema: { entity: z.string().describe("LRT id, e.g. etherfi-weeth, renzo-ezeth (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/lrt-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_defi_lending", {
  title: "DeFi lending protocol lifecycle triangle: bad-debt stress & contagion ($0.10)",
  description: "Verifiable DeFi lending-protocol lifecycle record: protocol lifecycle band + bad-debt stress (utilization, insolvency/underwater-position pressure) + contagion cascade to correlated protocols and collateral + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of a lending protocol's lifecycle position \u2014 not investment advice, no buy/sell framing. Costs $0.10 USDC on Base via x402. entity = protocol id (see gauge_catalog).",
  inputSchema: { entity: z.string().describe("DeFi lending protocol id (see gauge_catalog)") }
}, async ({ entity }) => {
  try {
    return ok(await paidGet(`/gauge/defilending-region?entity=${q(entity)}`));
  } catch (e) {
    return fail(e);
  }
});
server.registerTool("gauge_depin_network", {
  title: "DePIN network lifecycle triangle: reward churn & downstream exposure ($0.10)",
  description: "Verifiable DePIN (decentralized physical infrastructure) network lifecycle record: network-liveness lifecycle band (active nodes/coverage/throughput) + reward-churn pressure (emissions vs participation, node attrition) + downstream exposure cascade + cross-validation, from official/on-chain sources with record_hash. Screening-grade forensics of a DePIN network's lifecycle position \u2014 not investment advice, no buy/sell framing. Costs $0.10 USDC on Base via x402. entity e.g. helium, render, filecoin.",
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
  description: "Resolves a prediction-market question to the OFFICIAL FACT for an issuer/form. Returns the official answer (boolean) + a verifiable evidence_url + source_tier + a source-AGREEMENT confidence in [0,1] + _citation. This is the recorded official fact and how strongly official sources agree on it \u2014 it is NOT a prediction of the market outcome, and the confidence is NOT a probability that the market resolves yes. Honest-fails with no charge ({ answer:null, confidence:0, no_charge:true, note }) when the fact is not officially determinable as of the cutoff. Screening-grade, official sources only. Costs $0.01 USDC on Base via x402 (no charge on honest-fail).",
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
