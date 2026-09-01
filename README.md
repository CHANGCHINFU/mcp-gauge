# mcp-gauge — Verifiable facts for AI agents, pay-per-call via x402

[![MCP server score](https://glama.ai/mcp/servers/CHANGCHINFU/mcp-gauge/badges/score.svg)](https://glama.ai/mcp/servers/CHANGCHINFU/mcp-gauge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Model Context Protocol](https://img.shields.io/badge/Model_Context_Protocol-server-blue)](https://modelcontextprotocol.io)

**Check official facts before your AI agent acts.** 180+ signals from USGS, NOAA, SEC EDGAR, EPA, and more — each response includes multi-source cross-validation and a tamper-proof receipt anchored to Bitcoin via OpenTimestamps. No API key, no signup. Pay per call in USDC on Base via [x402](https://x402.org).

## Quick start

### Claude Desktop

Add to your config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```jsonc
{
  "mcpServers": {
    "gauge": {
      "command": "npx",
      "args": ["-y", "mcp-gauge-x402"],
      "env": {
        "EVM_PRIVATE_KEY": "0x..."   // optional — omit for free tools only
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root (or global config):

```jsonc
{
  "mcpServers": {
    "gauge": {
      "command": "npx",
      "args": ["-y", "mcp-gauge-x402"],
      "env": {
        "EVM_PRIVATE_KEY": "0x..."   // optional — omit for free tools only
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add gauge -- npx -y mcp-gauge-x402
# For paid tools, add the env:
claude mcp add gauge --env EVM_PRIVATE_KEY=0x... -- npx -y mcp-gauge-x402
```

### Other MCP hosts

Any MCP client that supports stdio transport works. Command: `npx -y mcp-gauge-x402`, set `EVM_PRIVATE_KEY` in env for paid tools.

> **Alternative: install from GitHub** (no npm account needed):
> ```
> npx -y github:CHANGCHINFU/mcp-gauge
> ```

### From source

```bash
git clone https://github.com/CHANGCHINFU/mcp-gauge && cd mcp-gauge
npm install && npm run build
node dist/index.js
```

## Payment setup

| | Without `EVM_PRIVATE_KEY` | With `EVM_PRIVATE_KEY` |
|---|---|---|
| Free tools | Yes | Yes |
| Paid tools | No (tools visible but calls fail) | Yes (auto-pays via x402) |

**How it works:** When your agent calls a paid tool, the GAUGE server returns an x402 payment challenge. The MCP client automatically pays in USDC on Base (EIP-3009 gasless — no ETH needed) and retries the request. The receipt is included in every response.

**Wallet safety:**
- Use a **dedicated burner wallet** with a small USDC balance — never your main wallet
- The private key never leaves your machine (processed locally by `x402-fetch`)
- Fund with just enough USDC for your expected usage
- Network: **Base mainnet** (Coinbase L2)

## Tools

### Free (no wallet needed)

| Tool | What it does |
|---|---|
| `gauge_catalog` | Browse 180+ available signals |
| `gauge_preview` | Coverage, pricing menu, bundle contents |
| `gauge_sample` | Full sample record with Bitcoin receipt |
| `gauge_river_free` | US river gauge reading (USGS) with receipt |
| `gauge_anchor` | Look up Bitcoin proof for any `record_hash` |

### Paid — single-source verification

| Tool | What it does |
|---|---|
| `verify_signal` | Check one official fact from 180+ signals. Bitcoin-anchored receipt. |
| `gauge_flood_risk` | Hydrology / air / precipitation alias of `verify_signal` |
| `gauge_resolution_as_of` | Prediction-market settlement — official fact + evidence + receipt |

### Paid — 3-source cross-validation bundles

| Tool | What it cross-checks |
|---|---|
| `gauge_region` | Air quality + precipitation + river level |
| `gauge_crop_drought` | Drought severity + heat/GDD + satellite crop health |
| `gauge_grid_stress` | Demand pressure + renewable output + energy inflation |
| `gauge_route_disruption` | Sea state + wave cause + live AIS vessel traffic |
| `gauge_filing_check` | SEC 8-K events + late filing + insider buy/sell |
| `gauge_stablecoin_lifecycle` | Peg drift + redemption acceleration + protocol exposure |
| `gauge_rwa_lifecycle` | Issuer lifecycle + redemption pressure + downstream exposure |
| `gauge_lrt_lifecycle` | Discount-to-NAV + withdrawal queue + collateral cascade |
| `gauge_defi_lending` | Utilization + bad-debt pressure + contagion |
| `gauge_depin_network` | Network liveness + reward churn + downstream exposure |

Prices are set by the live x402 challenge (use `gauge_preview` to check current pricing). If you drive the API with your own x402 client, set `maxValue` to at least **$0.25** — the default $0.10 makes your client reject bundle tools locally.

## Environment variables

| Key | Required | Description |
|---|---|---|
| `EVM_PRIVATE_KEY` | For paid tools | Base-mainnet wallet private key (0x...). Needs USDC, no ETH. |
| `GAUGE_BASE_URL` | No | API endpoint. Default: `https://api.truthbear.co` |
| `GAUGE_MAX_USDC` | No | Atomic per-call cap in USDC (6 decimals). Default: `350000` |

## Zero-trust verification

Every paid record carries a `record_hash` (canonical SHA-256). Daily Merkle roots are stamped to Bitcoin via OpenTimestamps. The stamp proves the record set existed no later than `stamped_at`. Re-check anytime:
- `gauge_anchor` tool (free)
- `POST /verify` or `/proof/:record_hash` at the GAUGE API
- Download attestation bytes and verify with the official `ots` CLI

## FAQ

**Do I need ETH for gas?**
No. x402 uses EIP-3009 (gasless USDC transfer). You only need USDC on Base.

**What if I don't set a private key?**
You can still use all 5 free tools. Paid tools will be listed but return an error when called.

**Is my private key sent to the server?**
No. The key stays on your machine. `x402-fetch` signs the payment locally and sends only the signed authorization to the GAUGE server.

**What happens if the data isn't available?**
The tool honest-fails with no charge. You only pay when you get a result.

**Can I verify the receipt without your server?**
Yes. Download the OpenTimestamps attestation via `gauge_anchor` and verify with the standard `ots` CLI tool against any Bitcoin node.

## Links

- Website: [truthbear.co](https://truthbear.co)
- Front desk: [gauge-frontdesk.zeabur.app](https://gauge-frontdesk.zeabur.app)
- API discovery: `https://api.truthbear.co/.well-known/x402`, `/llms.txt`
- Smithery: [smithery.ai/servers/a98741263/mcp-gauge](https://smithery.ai/servers/a98741263/mcp-gauge)
- GitHub: [CHANGCHINFU/mcp-gauge](https://github.com/CHANGCHINFU/mcp-gauge)

MIT · AEML-DS Vanished-Data Exchange
