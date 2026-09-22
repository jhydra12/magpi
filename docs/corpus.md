# Launch Week demo corpus

The 32 source documents in `supabase/corpus/` are fictional and MIT licensed with the repository. Supaphone, its people, and its launches are inventions for the Digital Brain demo. No customer or Supabase internal material belongs here. `supabase/corpus/COMPANY.md` fixes the company facts. `supabase/corpus/manifest.json` is the source loader's index.

The source documents run from 14 to 22 September 2026. Launch Week runs from 26 to 30 October 2026, 34 days after the last source update. The four shared spaces are Company, Engineering, Marketing, and Finance. The folder also has four replacement Dream-history fixtures dated 22 September; they are generated output, outside the 32 source-document count.

## Demo questions

1. What are we launching in the next Launch Week?
2. What's at risk of not making it?

The first answer needs two Company calendar pages and later owner updates. The second needs planned dates, separate blocking evidence, and the latest owner decisions. No single loaded document gives the complete answer to either question.

## Truth table

| Launch         | Owner             | Target day | Latest status    | Dependency and risk                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ----------------- | ---------- | ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared Inbox   | Priya Raghunathan | Mon 26 Oct | On track, 22 Sep | Import checklist passed                                                                      | [calendar](../supabase/corpus/company/notion-launch-week-monday-tuesday.md), [import issue](../supabase/corpus/marketing/linear-GTM-62-shared-inbox-import.md), [owner update](../supabase/corpus/marketing/slack-gtm-2026-09-22-shared-inbox.md)                                                                                                 |
| Audit Trail    | Ben Achilov       | Mon 26 Oct | On track, 22 Sep | Retention and export test passed                                                             | [plan](../supabase/corpus/engineering/notion-audit-trail-retention.md), [test issue](../supabase/corpus/engineering/linear-ENG-410-audit-retention.md), [owner update](../supabase/corpus/engineering/slack-engineering-2026-09-22-audit.md)                                                                                                      |
| Usage Alerts   | Maya Restrepo     | Tue 27 Oct | On track, 22 Sep | Email copy and send check passed                                                             | [plan](../supabase/corpus/marketing/notion-usage-alerts-launch.md), [send check](../supabase/corpus/marketing/drive-usage-alerts-send-check.md), [owner update](../supabase/corpus/marketing/slack-gtm-2026-09-22-usage-alerts.md)                                                                                                                |
| Partner API    | Dana Provenzano   | Wed 28 Oct | At risk, 22 Sep  | Security has no clean restricted-account sample; the old serializer exposed an internal note | [calendar](../supabase/corpus/company/notion-launch-week-wednesday-friday.md), [security issue](../supabase/corpus/engineering/linear-SEC-214-partner-scopes.md), [test report](../supabase/corpus/engineering/drive-partner-api-security-review.md), [latest update](../supabase/corpus/engineering/slack-engineering-2026-09-22-partner-api.md) |
| EU Region      | Sam Lindqvist     | Thu 29 Oct | At risk, 22 Sep  | Production-size load test missed the search-response limit twice                             | [plan](../supabase/corpus/engineering/notion-eu-region-plan.md), [load report](../supabase/corpus/engineering/drive-eu-region-load-test.md), [repeat issue](../supabase/corpus/engineering/linear-ENG-431-eu-capacity.md), [latest update](../supabase/corpus/engineering/slack-engineering-2026-09-22-eu-run.md)                                 |
| Billing Portal | John Mbeki        | Fri 30 Oct | On track, 22 Sep | Example invoices match; full reconciliation is scheduled                                     | [plan](../supabase/corpus/finance/notion-billing-portal-cutover.md), [comparison](../supabase/corpus/finance/drive-billing-portal-reconciliation.md), [owner update](../supabase/corpus/finance/slack-finance-2026-09-22-billing.md)                                                                                                              |

## Exact expected answers

**What are we launching in the next Launch Week?**

> Launch Week is 26 to 30 October. Monday: Shared Inbox, owned by Priya Raghunathan, and Audit Trail, owned by Ben Achilov. Tuesday: Usage Alerts, owned by Maya Restrepo. Wednesday: Partner API, owned by Dana Provenzano. Thursday: EU Region, owned by Sam Lindqvist. Friday: Billing Portal, owned by John Mbeki. Partner API and EU Region are at risk; the other four are on track.

**What's at risk of not making it?**

> Partner API, Dana Provenzano's Wednesday launch, is at risk. Security is waiting for a clean restricted-account response after an internal note appeared in the sample; the 22 September update kept the target date but withheld partner credentials. [Review](../supabase/corpus/engineering/linear-SEC-214-partner-scopes.md) · [sample report](../supabase/corpus/engineering/drive-partner-api-security-review.md) · [latest update](../supabase/corpus/engineering/slack-engineering-2026-09-22-partner-api.md).
>
> EU Region, Sam Lindqvist's Thursday launch, is at risk. The production-size load test missed the search-response limit, and the 22 September repeat was still over it. The target stays 29 October pending a passing run. [Load report](../supabase/corpus/engineering/drive-eu-region-load-test.md) · [repeat issue](../supabase/corpus/engineering/linear-ENG-431-eu-capacity.md) · [latest update](../supabase/corpus/engineering/slack-engineering-2026-09-22-eu-run.md).

## Retrieval checks

- Partner API was on track in the 17 September plan. The 19 September decision narrowed the first release to read-only access. The 22 September update marks it at risk pending security approval.
- EU Region was on track after the small run. The 21 September production-size report and 22 September repeat make the current risk clear.
- Usage Alerts and “threshold emails” name the same launch. The later Marketing notes establish the customer name.
- The EU Region load report and 22 September engineering conversation concern the same failed check without linking to each other.
- The exact-match identifier `CAP-7F3` occurs in one source document.
- Five source documents about lunch, new-starter accounts, laptops, photos, and expenses are unrelated to the demo questions.

## Rebuild and checks

Run `pnpm corpus:manifest`, `pnpm check:corpus`, and `pnpm test:seeds` after changing source documents. The manifest builder derives a title, source, space, URL, and edit date from each file. Dates later than 22 September in a document's content describe planned work; source edit dates stop on 22 September.
