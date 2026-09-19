# Demo admin reset

- [x] Define the reset scope and deletion order for demo-created dream data.
- [x] Add an admin-only reset action and Demo page.
- [x] Add Demo to the admin navigation below Billing.
- [x] Verify the action and page with focused checks and browser validation.

## Review

- Typecheck and lint pass; the authenticated browser shows Demo below Billing with the red Reset button. The action was not clicked during verification.

# Connected Dream graph

- [x] Add bridge documents to the company corpus and seed them into the demo organization.
- [x] Write entity discoveries in batches so the graph can update during a run.
- [x] Merge matching entities across spaces in the graph.
- [x] Verify the entity worker tests, web typecheck, and connected hosted data.

## Review

- Eight bridge documents were added and ingested. The hosted entity data now resolves to one merged graph component.

# Expand the demo corpus

- [x] Define 30 additional team spaces, membership, document templates, and cross-space links.
- [x] Generate and manifest deterministic corpus documents for the 30 spaces.
- [x] Update seed and reset flows so the expanded demo is repeatable and scoped to the demo organization.
- [x] Update global Dream submission and rate limits for the expanded space count.
- [x] Add tests for space counts, document routing, cross-space links, and global Dream submission.
- [x] Reset and seed the hosted demo organization, then verify ingestion readiness.

## Review

- The hosted demo now has 37 spaces, 1,333 source documents, 1,788 chunks, and 1,333 successful ingest jobs. The 30 new spaces each have 12 documents across four providers.

# Simplify Spaces and Entities

- [x] Remove organization-wide membership copy and hide Spaces from the main navigation.
- [x] Add document, member, and latest Dream metadata to the Entities view.
- [x] Run focused tests, lint, and typecheck.

## Review

- Spaces is hidden from the main navigation. Entities now shows aggregate document and member counts plus the latest completed Dream time in UTC.

# Repair production graph rendering

- [ ] Reproduce production renderer error and convert every graph color to sRGB bytes.
- [ ] Size the canvas to its container and remove fixed positioning offsets.
- [ ] Add real-browser color regression coverage and verify production in both themes.
