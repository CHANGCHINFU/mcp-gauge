/**
 * mcp-gauge — Model Context Protocol server for GAUGE.
 *
 * Exposes GAUGE's verifiable, pay-per-call signals to any MCP host (Claude Desktop, Cursor,
 * MCP-compatible agents). Free discovery tools need no wallet; paid screening-level tools pay
 * per call in USDC on Base via x402 (EIP-3009 gasless, no API key). Pure description: official
 * sources (USGS/NOAA/EPA/CAMS/ERA5/FRED/Marine/SEC-EDGAR) + back-testable stats + record_hash.
 *
 * Env:
 *   GAUGE_BASE_URL     default https://aeml-x402.zeabur.app
 *   EVM_PRIVATE_KEY    0x Base-mainnet key (needs a little USDC) — required only for PAID tools
 *   GAUGE_MAX_USDC     atomic per-call cap, default 120000 ($0.12)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE = (process.env.GAUGE_BASE_URL || "https://aeml-x402.zeabur.app").replace(/\/$/, "");
const MAX = BigInt(process.env.GAUGE_MAX_USDC || "120000"); // $0.12 hard cap (allows $0.10 bundles, blocks $1 census)

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
server.registerTool("gauge_flood_risk", {
  title: "Flood-risk / anomaly record ($0.05)",
  description: "Verifiable flood-risk / anomaly record for one signal+entity: current vs official USGS/NOAA/EPA/CAMS thresholds (band, distance-to-action) + 5yr seasonal anomaly (percentile/strata) + record_hash. Costs $0.05 USDC on Base via x402. Works for hydrology/air/precip signals.",
  inputSchema: {
    signal_id: z.string().describe("e.g. hydrology.river-level, hydrology.streamflow, airquality.aqi, airquality.pm25, precipitation.daily, precipitation.wetness30d"),
    entity: z.string().describe("USGS site id for rivers, or city id (e.g. us-chicago) for air/precip — see gauge_catalog"),
  },
}, async ({ signal_id, entity }) => { try { return ok(await paidGet(`/gauge?signal_id=${q(signal_id)}&entity=${q(entity)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_region", {
  title: "Region bundle: air + rain + river ($0.10)",
  description: "Three-leg region bundle for a US city: air quality + precipitation + nearby river, with cross-line corroboration narrative. Costs $0.10 USDC on Base. loc e.g. us-stlouis, us-chicago (see gauge_preview regions).",
  inputSchema: { loc: z.string().describe("city id, e.g. us-stlouis") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_crop_drought", {
  title: "Agriculture triangle: crop drought ($0.10)",
  description: "Agriculture triangle for a grain region: agricultural drought (soil moisture vs official USDM D0–D4) + heat/GDD + crop vegetation health (NOAA satellite VHI) + cross-validation (has drought hit the crop canopy). For ag traders & crop insurers. Costs $0.10 USDC on Base. loc e.g. us-iowa, ar-pampas, ua-ukraine.",
  inputSchema: { loc: z.string().describe("grain region id, e.g. us-iowa, ar-pampas, ua-ukraine") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/agri-region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_grid_stress", {
  title: "Power grid triangle: grid stress & energy inflation ($0.10)",
  description: "Power grid triangle for a grid region: electricity demand pressure (temperature HDD/CDD load proxy) + renewable resource (solar/wind) + energy inflation (US CPI Energy YoY) / natural gas price + cross-validation (high demand × low renewables = grid squeeze → energy inflation). For power/energy & macro/inflation traders, utilities. Costs $0.10 USDC on Base. loc e.g. us-ercot, us-caiso, eu-germany.",
  inputSchema: { loc: z.string().describe("grid region id, e.g. us-ercot, us-caiso, eu-germany") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/grid-region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_route_disruption", {
  title: "Shipping triangle: route disruption & throughput ($0.10)",
  description: "Shipping/port triangle for a chokepoint: logistics-flow disruption (WMO sea state + wind vs operational thresholds) + sea-state cause (wave decomposition: local-storm vs distant-swell) + live AIS vessel throughput (waiting vs transiting + congestion) + cross-validation. For shipping lines, commodity/freight traders, ports, marine insurers. Costs $0.10 USDC on Base. loc e.g. malacca, suez-redsea, hormuz, channel.",
  inputSchema: { loc: z.string().describe("chokepoint id, e.g. malacca, suez-redsea, hormuz, channel") },
}, async ({ loc }) => { try { return ok(await paidGet(`/gauge/shipping-region?loc=${q(loc)}`)); } catch (e) { return fail(e); } });

server.registerTool("gauge_filing_check", {
  title: "Regulatory-filing triangle: corporate distress & insider ($0.10)",
  description: "Regulatory-filing triangle for a company: 8-K material events (item severity — bankruptcy/default/restatement/delisting = critical) + NT late-filing delinquency (distress leading indicator) + Form 4 insider net open-market buy/sell + cross-validation (do insiders confirm the distress by selling or contradict it by buying). All official SEC EDGAR. For event-driven/activist/short funds, quant funds, credit & distressed analysts. Costs $0.10 USDC on Base. entity = ticker e.g. AMC, CVNA, GME.",
  inputSchema: { entity: z.string().describe("ticker from watchlist, e.g. AMC, CVNA, GME, BA (see gauge_preview filing_watchlist)") },
}, async ({ entity }) => { try { return ok(await paidGet(`/gauge/filing-company?entity=${q(entity.toUpperCase())}`)); } catch (e) { return fail(e); } });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("mcp-gauge running (stdio). Base=" + BASE + " wallet=" + (wallet() ? "set" : "unset — free tools only"));
