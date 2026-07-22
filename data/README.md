# State of Agentic Commerce — datasets

Periodic Agentic Commerce Score scans of leading DTC storefronts. Human-readable
summary + per-store pages: <https://arenza.ai/agentic-commerce-score/report>.

## 2026-07 (rubric v0.1)

`state-of-agentic-commerce-2026-07.ndjson` — one JSON record per scanned domain
(the `ScanRecord` shape emitted by `scripts/scan-batch.ts`: full `ScoreResult`
minus the per-product sample array).

Headline numbers (Shopify-detected storefronts only):

- **955** unique candidate domains scanned · **857** Shopify storefronts detected
- **694 / 857 (81%) are agent-buyable** (open feed + ≥80% required-field coverage
  + checkout rail + both policies + AI crawlers allowed)
- Mean score **90**, median **97** · grades: A 731 · B 37 · C 49 · D 33 · F 7
- Top failing checks: `product_schema` 13% fail (n=751) · `open_feed` 10% (n=857)
  · `description_depth` 8% (n=775) · `policies` 4% (n=857)
- 2% of storefronts refuse a declared bot user-agent at the homepage
- llms.txt is now near-universal on Shopify storefronts (the platform
  auto-serves an agent-instructions document), which is itself a 2026 finding

Candidate list provenance: [`candidate-sources-2026-07.md`](./candidate-sources-2026-07.md)
(public best-of-Shopify / DTC roundups + a canonical well-known-brand set; the
scan itself verifies platform, so non-Shopify candidates are excluded from the
headline stats).

Reproduce / rescan:

```bash
npm run build
node dist/scripts/scan-batch.js --input your-domains.txt --output rescan.ndjson
```

Scores are point-in-time (scanned 2026-07-23) and change as stores change.
Comparing scores across rubric versions is invalid — see [SCORE.md](../SCORE.md).
