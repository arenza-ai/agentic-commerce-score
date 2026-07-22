# Store candidate list — public sources

Compiled 2026-07-23. 746 unique registrable domains (normalized: lowercase, no www, no paths, deduped, country variants collapsed to primary domain). Candidates are *likely-Shopify* DTC storefronts; the scan itself verifies platform via `/products.json` et al., so residual false positives are filtered downstream.

Counts below are approximate domains contributed **pre-dedup** (sources overlap heavily; final list is the union minus exclusions).

## Primary web sources (fetched)

- https://fastbundle.co/blog/best-shopify-stores/ — "200 Best Shopify Stores in 2025" cross-vertical roundup — ~150 domains extracted, ~120 kept
- Omnisend "Best Shopify stores" vertical roundups (~250 extracted, ~130 kept):
  - https://www.omnisend.com/blog/shopify-beauty-stores/ (50 beauty)
  - https://www.omnisend.com/blog/shopify-food-and-beverage-stores/ (50 food & beverage)
  - https://www.omnisend.com/blog/shopify-pet-stores/ (50 pets)
  - https://www.omnisend.com/blog/shopify-jewelry-stores/ (25 jewelry)
  - https://www.omnisend.com/blog/shopify-electronics-store/ (50 electronics)
  - https://www.omnisend.com/blog/shopify-baby-store/ (20 baby)
  - https://www.omnisend.com/blog/home-decor-shopify-stores/ (20 home decor)
  - https://www.omnisend.com/blog/shopify-clothing-stores/ (30 clothing)
- https://www.pipiads.com/best-shopify-stores/top-shopify-clothing-stores — "Top 100 Shopify Clothing Stores" (traffic-ranked) — 100 extracted, ~45 kept (obscure regional stores dropped)
- https://wisepops.com/blog/shopify-stores + https://wisepops.com/blog/shopify-clothing-stores — 40+ best Shopify stores / 50 clothing examples — ~90 extracted, ~65 kept
- https://www.charleagency.com/articles/biggest-brands-on-shopify/ (53 biggest brands) + https://eastsideco.com/blog/63-biggest-names-and-brands-shopify (63 biggest names) — ~90 extracted, ~40 kept after excluding non-DTC entries (media/merch/big-box)
- https://www.trendtrack.io/blog-post/top-shopify-stores-by-revenue + https://www.trendtrack.io/blog-post/top-dtc-brands — revenue-ranked Shopify stores & top DTC brands — ~45 extracted, ~30 kept
- https://thehubcontent.com/news/fastest-growing-dtc-brands/ — "40 Fastest Growing DTC Brands" — ~38 extracted, ~30 kept
- https://www.skailama.com/blog/top-25-healthcare-brands-using-shopify — top 25 wellness brands on Shopify — 25 extracted, ~20 kept

## Secondary sources (search-result mentions, spot contributions)

- Vertical "best Shopify stores" roundups surfaced via search snippets: pagefly.io (top 50 beauty / 50 clothing), analyzify.com (sports & sportswear), identixweb.com, craftberry.co, foxecom.com, omnithemes.com, prateeksha.com (outdoor/camping), keevee.com (shoes), mgroupweb.com (baby) — ~30 domains kept in aggregate
- Coverage of Shopify agentic storefronts inside ChatGPT (merchant-side context for scan relevance): openai.com/index/buy-it-in-chatgpt/, digitalcommerce360.com, modernretail.co
- myip.ms Shopify-IP browse technique (23.227.38.x) consulted as method reference for "most popular Shopify sites"; its interactive tables were not scraped directly — used to validate that headliners (ColourPop etc.) rank top

## Model-knowledge supplement

- ~280 canonical famous DTC/Shopify brands added from assistant knowledge of widely documented Shopify merchants (Shopify Plus case studies, press coverage, BuiltWith-type platform lookups): e.g. Gymshark, SKIMS, Brooklinen, ColourPop, Mejuri, Ruggable, Liquid Death, OLIPOP, Ridge, Bombas, Vuori, Tecovas, Caraway, HexClad, Therabody, Lovevery. These carry the same "verify during scan" caveat as the web-sourced set.

## Exclusions applied

- Marketplaces (Amazon/Etsy/eBay/Society6-type), big-box retail (Walmart/Target/Decathlon/JB Hi-Fi/Staples), obviously non-Shopify platforms (Apple, Nike, Warby Parker, THG-run Myprotein, TechStyle-run Fabletics), media/merch shops (BBC, The Economist, Tesla merch), duplicate country variants (kept primary domain only), adult/regulated verticals (tobacco/vape/CBD/firearms) — none included.
