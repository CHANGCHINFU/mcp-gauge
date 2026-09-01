# Changelog

All notable changes to **mcp-gauge** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

## [Unreleased]
- (add upcoming changes here)

## [1.0.4] - 2026-09-01
### Changed
- All 18 tool descriptions rewritten to 2-3 sentence agent-friendly format (improved discoverability)
- README rewritten with per-client install snippets (Claude Desktop, Cursor, Claude Code)
- Added FAQ, wallet safety guide, and free-vs-paid tool comparison

### Added
- `exports` field in package.json for ESM compatibility
- `repository`, `homepage`, `engines` fields in package.json
- Keywords: stablecoin, defi, depin, rwa, prediction-market
- `gauge_anchor` free tool (Bitcoin proof lookup, added in prior release)
- Crypto lifecycle tools: stablecoin, RWA, LRT, DeFi lending, DePIN (added in prior release)
- `gauge_resolution_as_of` prediction-market resolution tool (added in prior release)

## [0.1.0] - 2026-07-10
### Added
- Initial MCP server exposing GAUGE signals over stdio.
- Free tools: `gauge_catalog`, `gauge_preview`, `gauge_sample`, `gauge_river_free`.
- Paid tools (pay-per-call in USDC on Base via x402, EIP-3009 gasless, no API key):
  `gauge_flood_risk`, `gauge_region`, `gauge_crop_drought`, `gauge_grid_stress`,
  `gauge_route_disruption`, `gauge_filing_check`.
- Screening-level, verifiable records: current reading vs official thresholds +
  seasonal anomaly + `record_hash` provenance. Official sources
  (USGS / NOAA / EPA / CAMS / ERA5 / FRED / Open-Meteo Marine / SEC EDGAR).
- MIT LICENSE.

[Unreleased]: https://github.com/CHANGCHINFU/mcp-gauge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CHANGCHINFU/mcp-gauge/releases/tag/v0.1.0
