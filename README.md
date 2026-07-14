# mcp-gauge — MCP server for GAUGE (verifiable signals, pay-per-call in USDC via x402)

[![MCP server score](https://glama.ai/mcp/servers/CHANGCHINFU/mcp-gauge/badges/score.svg)](https://glama.ai/mcp/servers/CHANGCHINFU/mcp-gauge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Model Context Protocol](https://img.shields.io/badge/Model_Context_Protocol-server-blue)](https://modelcontextprotocol.io)

Give any **MCP host** (Claude Desktop, Cursor, MCP-compatible agents) access to **GAUGE**'s verifiable, screening-level signals across many domains (weather, drought, agriculture, power grid, shipping, regulatory filings, and more) — and let the agent **pay per call in USDC on Base via [x402](https://x402.org)** (EIP-3009 gasless, **no API key, no signup**).

**Pure description** — official-source facts (USGS / NOAA / EPA / CAMS / ERA5 / FRED / Open-Meteo Marine / SEC EDGAR) + back-testable statistics + `record_hash` (OpenTimestamps, Bitcoin-anchored). The agent decides. Payment settles **directly to the provider wallet**.

Backed by the GAUGE service at **https://aeml-x402.zeabur.app**.

> **Part of Truth Bear 🐻** — GAUGE is the data engine behind [Truth Bear](https://gauge-frontdesk.zeabur.app), the natural-language front desk for AI agents and SMBs. Ask in plain language, get the official fact + its source + a verifiable `record_hash` — no prediction, no advice, the rest is your call. *An analyst, not a commander.* Front desk: **https://gauge-frontdesk.zeabur.app** · discovery: `/.well-known/x402`, `/llms.txt`.

## Why MCP + x402

- **Discovery** is free and open (MCP): any MCP host lists these tools with zero setup.
- **Payment** is crypto (x402): the agent pays USDC only when it calls a *paid* tool.
- Free tools (`gauge_catalog`, `gauge_preview`, `gauge_sample`, `gauge_river_free`) need **no wallet** — try before you buy.

## Tools

| Tool | Price | What |
|---|---|---|
| `gauge_catalog` | free | All signals + queryable entities |
| `gauge_preview` | free | Coverage, pricing menu, bundle lists |
| `gauge_sample` | free | A full sample record (what paid looks like) |
| `gauge_river_free` | free | Raw US river reading (USGS site id) |
| `gauge_flood_risk` | **$0.05** | Flood-risk/anomaly record vs official thresholds + seasonal anomaly + hash |
| `gauge_region` | **$0.10** | City bundle: air + precipitation + river + cross-check |
| `gauge_crop_drought` | **$0.10** | Agriculture triangle: drought (USDM) + heat/GDD + crop VHI |
| `gauge_grid_stress` | **$0.10** | Power grid triangle: demand + renewables + energy inflation |
| `gauge_route_disruption` | **$0.10** | Shipping triangle: route disruption + sea state + AIS throughput |
| `gauge_filing_check` | **$0.10** | Regulatory-filing triangle: 8-K + late filing + Form 4 insider |

**130+ signals (and growing)** across hydrology, air quality, precipitation, agriculture, power grid, shipping and regulatory filing — with **global coverage** (US plus Argentina, Brazil, China, India, Ukraine, EU and more). Check the live set anytime via the free `gauge_catalog` tool.

## Install & configure

Requires Node 18+. The MCP host runs the server over **stdio**. Install straight from GitHub — **no npm account, no signup** (the built `dist/` is committed):

```bash
npx -y github:CHANGCHINFU/mcp-gauge
```

### Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "gauge": {
      "command": "npx",
      "args": ["-y", "github:CHANGCHINFU/mcp-gauge"],
      "env": {
        "EVM_PRIVATE_KEY": "0xYOUR_BASE_WALLET_KEY_WITH_A_LITTLE_USDC"
      }
    }
  }
}
```

Omit `EVM_PRIVATE_KEY` to use **free tools only** (catalog / preview / sample / river).

### Cursor / other MCP hosts / Claude Code

- **Claude Code**: `claude mcp add gauge -- npx -y github:CHANGCHINFU/mcp-gauge` (add `--env EVM_PRIVATE_KEY=0x…` for paid tools).
- **Cursor / others**: command `npx -y github:CHANGCHINFU/mcp-gauge`, transport stdio, optional `EVM_PRIVATE_KEY` env.

### From source

```bash
git clone https://github.com/CHANGCHINFU/mcp-gauge && cd mcp-gauge
npm install && npm run build
node dist/index.js        # stdio
```

> Once published to npm the package name is `mcp-gauge-x402` (`npx -y mcp-gauge-x402`); until then use the GitHub form above.

## Config (env)

| Key | Required | Description |
|---|---|---|
| `EVM_PRIVATE_KEY` | for **paid** tools | 0x Base-mainnet wallet key; needs a little USDC (EIP-3009 gasless, no ETH). |
| `GAUGE_BASE_URL` | no | Default `https://aeml-x402.zeabur.app`. |
| `GAUGE_MAX_USDC` | no | Atomic per-call cap. Default `120000` ($0.12). |

> Handle the private key like any hot-wallet secret; fund it with a small USDC balance only.

## Verify (zero-trust)

Every paid record carries `record_hash` (canonical sha256) + Merkle root + OpenTimestamps (Bitcoin). Re-check via `POST /verify` or `/proof/:record_hash` at the GAUGE service.

## Distribution (maintainers)

- **GitHub install** (primary, no npm account): users run `npx -y github:CHANGCHINFU/mcp-gauge`.
- **awesome-mcp-servers**: submit a PR to a curated MCP server list for discoverability (no npm needed).
- **MCP Registry** (optional, needs npm): publish `mcp-gauge-x402` to npm, then `server.json` is ready for the [MCP publisher](https://github.com/modelcontextprotocol/registry):
  ```bash
  npm publish
  mcp-publisher login github
  mcp-publisher publish
  ```

MIT · AEML-DS Vanished-Data Exchange
