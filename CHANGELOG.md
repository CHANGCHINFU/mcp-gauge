# Changelog

All notable changes to **mcp-gauge** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

## [Unreleased]
- (add upcoming changes here)

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
