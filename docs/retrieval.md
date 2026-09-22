# Retrieval

How Digital Brain finds the chunks that answer a question, and what its recall actually
is once a permission filter is applied.

## The design

Hybrid retrieval. Two arms, merged with reciprocal rank fusion:

1. **Semantic.** pgvector cosine distance against `chunks.embedding`, a
   `vector(1536)` column indexed with HNSW using `vector_cosine_ops`,
   `m = 16`, `ef_construction = 64`.
2. **Lexical.** Postgres full text search against `chunks.tsv`, a stored
   generated `tsvector` over `content` with an `english` configuration, indexed
   with GIN. Queries go through `websearch_to_tsquery` and rank with
   `ts_rank_cd`.

Both columns and both indexes are declared in
`supabase/schemas/31_chunks.sql:11-23`.

Both arms live in one function, `public.search()`, declared in
`supabase/schemas/80_functions.sql`:

```sql
create or replace function public.search(
  query_embedding extensions.vector(1536),
  query_text text,
  space_filter uuid[] default null,
  match_count integer default 20
)
returns table (
  chunk_id uuid,
  document_id uuid,
  space_id uuid,
  content text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
```

Three properties of that signature matter.

**`security invoker`.** The function runs as the caller, so the `chunks` row
level security policy applies to every call. That policy is
`chunks_select_visible`, which restricts rows to `space_id in (select
public.visible_space_ids())`. The permission check happens inside the vector
search rather than as a filter over its results, which is what makes the
two-user stage moment work: two people run the identical query against the
identical index and get different rows.

**One implementation.** Web, mobile and eventually the MCP server all call this
function. A second search implementation anywhere in the repository is a bug,
because a second implementation is a second place for the permission boundary to
be wrong.

**`space_filter` only ever narrows.** Passing an array of space ids
restricts the search further. It cannot add a space the caller could not already
see, because RLS still applies underneath it.

### How the two arms are merged

Each arm is ordered independently and truncated to `greatest(match_count * 4,
40)` rows (`supabase/schemas/80_functions.sql:101`). That over-fetch exists because reciprocal rank fusion only reorders
what it is given, so a candidate that neither arm returned cannot be recovered by
fusion.

The two candidate sets are combined with a full outer join on chunk id, and each
chunk scores:

```
score = 1 / (60 + semantic_rank) + 1 / (60 + lexical_rank)
```

written out at `supabase/schemas/80_functions.sql:140`, with a missing rank
contributing zero because the full outer join leaves the absent side null and
`coalesce` turns that term into 0. The constant k = 60 is the value from the
original reciprocal rank fusion paper. It damps the contribution of low-ranked
hits without needing a per-corpus tuning pass, and it lets the two arms be
combined without normalizing a cosine distance against a `ts_rank_cd` score,
which are not comparable quantities.

A chunk that both arms rank highly beats a chunk that only one arm found.

### Why digests are capped

A dream digest is a summary of the documents a question is about, so it scores
well on both arms for that question. After a week of nightly digests, or an
afternoon of rehearsal runs, a budget of twelve passages can fill with summaries
that mention the topic and leave out the source that states the fact. This is
what happened with the Fold S1 launch date on 18 September 2026: ten of twelve
passages were digests, none of which carried the date the GTM-7 ticket locks.

So after fusion, `search` joins each candidate to its document and keeps at most
`greatest(1, match_count / 4)` chunks whose document has `origin = 'dream'`,
by score. That is three of the chat's twelve. The other nine slots go to uploads
and synced documents in score order. A budget with room for every candidate is
unchanged, and a caller who wants only digests can still filter for them
afterwards. The cap is per call, not per digest, so ten copies of the same
digest count against the same three slots.

### Why pure vector search is not enough

Ask "what is the SSO ticket number" of a pure embedding search. The query embeds
to a point near every document about single sign-on, authentication and identity
providers, because that is what the sentence is about. The chunk that actually
contains `ENG-2471` is one of hundreds nearby, and nothing in the vector space
distinguishes a string of digits from the text around it. Embeddings encode what
a passage means, and an identifier means almost nothing.

The lexical arm matches the literal token. `websearch_to_tsquery` turns the
question into terms, the GIN index finds the chunks containing `sso` and
`ticket`, and the exact chunk ranks first in that arm even when it ranks
fiftieth in the semantic one. Fusion then puts it in the answer.

This class of question is common in a knowledge base: ticket numbers, error
codes, person names, product SKUs, dates, version strings. It also fails
visibly, which is why it would happen on stage.

## The one client path

`searchChunks` in `web/lib/search/search.ts:38` is the only code in the
repository that calls the `search` RPC. It is wired into the chat pipeline by the `search` dependency at
`web/lib/chat/deps.ts:22`.

Four things it does that matter to a reader of the SQL:

- It goes through the caller's Supabase client rather than the service client
  (`deps.supabase.rpc('search')`, `search.ts:48`), which is what makes `security invoker` mean anything. A
  service client here would run the function as `service_role` and every RLS
  predicate would pass.
- It returns an empty array for a blank query without calling the model or the
  database (`queryText === ''`, `search.ts:43`).
- It sends the embedding as a bracketed string, because PostgREST passes the
  parameter as text and pgvector parses it back (`serializeEmbedding`,
  `search.ts:29`).
- It omits `space_filter` from the request entirely when the caller passes null
  (`search.ts:52`), so the SQL default of null applies and RLS alone decides
  what is visible.

Match counts are declared twice. `DEFAULT_MATCH_COUNT` is 12 at `search.ts:26`
and nothing imports it. The chat path declares its own `MATCH_COUNT = 12` at
`web/lib/chat/answer.ts:40` and passes it as `matchCount` at `answer.ts:70`. The SQL default of
20 (`supabase/schemas/80_functions.sql:84`) is reached only by a caller that
omits the argument, which no code in this repository does.

Execute is revoked from `public` and `anon` and granted to `authenticated` and
`service_role` (`supabase/schemas/80_functions.sql:172-174`).

## Chunking

`supabase/functions/_shared/chunking.ts` is the only chunker. `chunkText` runs
with no options from the ingest job at
`supabase/functions/_shared/jobs/ingest.ts:238` and from the dream digest job at
`supabase/functions/_shared/jobs/dream_digest.ts:73`, so the two defaults the
module declares are the values every chunk in the corpus was cut with.

| Property           | Value                | Where it comes from                                                                                                              |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Target chunk size  | 800 estimated tokens | `DEFAULT_TARGET_TOKENS`, `chunking.ts:8`                                                                                         |
| Overlap            | 100 estimated tokens | `DEFAULT_OVERLAP_TOKENS`, `chunking.ts:16`                                                                                       |
| Minimum chunk size | none                 | No merge rule exists. Whatever is left at the end of a document is emitted as a chunk at `chunking.ts:156`, however short it is. |
| Maximum chunk size | the target           | `chunkText` flushes before adding a unit that would take the running estimate past the target, `chunking.ts:150`.                |

### Token counts are character counts divided by four

`estimateTokens` at `chunking.ts:38` is `Math.max(1, Math.ceil(text.length / 4))`.
The comment above it says it is not a real tokenizer, and gives the reason:
carrying one into the edge runtime costs a megabyte and a cold start to make a
boundary decision that is already approximate. Every token number in this
section is that estimate, including the `chunks.token_count` column written at
`ingest.ts:187`.

The counts that billing and limits read come from the models themselves and land
in `model_calls.input_tokens` and `model_calls.output_tokens`
(`supabase/schemas/70_usage_events.sql:29`).

### Boundary rules

`splitUnits` at `chunking.ts:85` cuts the text into pieces, each at most one
target's worth on its own, trying three boundaries in order:

1. Blank line, meaning a paragraph break. `splitParagraphs`, `chunking.ts:43`.
2. Sentence end, a `.`, `!` or `?` followed by whitespace. `splitSentences`,
   `chunking.ts:51`.
3. Whitespace between words, as the last resort. `splitWords`, `chunking.ts:59`.

Markdown headings are ordinary text to this code. Nothing reads `#` or prefers a
heading level as a cut. A heading line usually ends up as its own unit only
because most documents put a blank line after it.

`chunkText` at `chunking.ts:129` packs those units in order, joining them with a
blank line, and flushes when the next unit would take the chunk past the target,
so a chunk always holds a whole number of units. The join inserts two characters
per boundary, which is why a finished chunk's estimate can sit a few tokens above
the target.

Overlap is carried the same way. `tailWithin` at `chunking.ts:106` walks back
from the end of the flushed chunk taking whole units while they fit in the
100-token budget, and it always leaves at least one unit behind, because
repeating the whole previous chunk turns packing into a loop.

### Two properties the data model depends on

- Chunk ordinals are contiguous from zero within a document, assigned from the
  output array's length at `chunking.ts:143` and `chunking.ts:158`. `chunks`
  carries `unique (document_id, ordinal)`
  (`supabase/schemas/31_chunks.sql:15`) and citation rendering depends on
  ordinal order.
- Chunking is deterministic. `chunkText` reads no clock, no network and no
  database, so the same text produces the same chunks. Ingest hashes the
  extracted text and returns early when the hash matches
  `documents.content_hash` (`ingest.ts:231`), so a re-import of an unchanged
  document leaves the existing chunks and their ids alone.

### Not built

An earlier version of this section described these four rules as implemented.
None of them is in the code. Anything reasoning about chunk size from this
document should treat them as absent.

- **A minimum chunk size with a merge.** A fragment below some floor would be
  merged into the previous chunk. A 12-token chunk embeds to noise and pollutes
  the semantic arm, and today one can come out of a short document or off the
  end of a long one.
- **A hard ceiling above the target.** A separate maximum, higher than 800,
  would give a boundary rule room to overshoot rather than cut mid paragraph.
  The 800-token target is the only bound in the code.
- **A markdown heading rule.** Splitting at the highest available heading level
  before falling back to paragraphs would keep a section together and keep its
  title attached to its body.
- **Real tokenization.** The character estimate is close enough on English prose
  and wrong on code, tables and non-English text, all of which the corpus
  contains. Every size in the table above is off by whatever that error is for a
  given document.

## The known risk

An HNSW index scan walks a graph and stops after it has collected `ef_search`
candidates. When the query also filters on a subset of spaces, Postgres applies
that filter to the rows the graph walk returned. If the caller can see 1 percent
of the corpus, roughly 99 percent of what the walk collected is discarded, and
the result set comes back short or empty even though thousands of matching rows
exist further out in the graph.

This is the failure mode that turns the permission model from a strength into a
retrieval bug. It gets worse as the corpus grows, because the graph gets deeper
while `ef_search` stays fixed, and it gets worse as the filter gets more
selective, which is exactly the direction a real enterprise tenant moves in.

The mitigation is pgvector's iterative index scan. Setting
`hnsw.iterative_scan` lets the scan continue past its first batch until enough
rows survive the filter:

- `off` is the pgvector default and the failure case above.
- `strict_order` returns rows in exact distance order, at higher cost.
- `relaxed_order` allows slight reordering within the returned set and is
  cheaper.

`hnsw.max_scan_tuples` bounds the work so a query against a filter matching
nothing cannot walk the entire index.

### Measured once, and partly under test

pgTAP measured this on 2026-09-09 with a thousand chunks in a space the caller
cannot see, every one ranking nearer the query than the five that are theirs,
and query text matching nothing so the lexical arm could not rescue the result:

| Configuration                    | Rows the caller gets, of 5 | Rows leaked |
| -------------------------------- | -------------------------- | ----------- |
| index scan, `iterative` off      | 0                          | 0           |
| index scan, `iterative` on       | 5                          | 0           |
| sequential scan, `iterative` off | 5                          | 0           |

Two things that table settles.

**It was never a leak.** Rows from the other space were invisible in every
configuration. A post-filter discards rows after the scan, so the worst it can do
is drop rows the caller was entitled to. The permission model held throughout.

**It was a total recall failure, not a partial one.** The caller's own document
existed, matched semantically, and the answer came back empty. It fails on the
paraphrase, which is the case vector search exists for, while the lexical arm
keeps the keyword case working and hides it.

The third row is why this needed measuring rather than reasoning about. At
test-corpus size the planner picks a sequential scan, which filters perfectly, so
any version of this test written without forcing the index passes forever and
proves nothing.

**Only one of those three rows is still asserted.**
`supabase/tests/20_search.test.sql` forces the index scan with
`enable_seqscan = off` and checks that no row from the invisible space comes back
(`20_search.test.sql:214`), that `public.search` carries
`hnsw.iterative_scan=relaxed_order` in its `proconfig`
(`20_search.test.sql:240`), and that the function is security invoker
(`20_search.test.sql:252`). The assertion that the caller still gets all five of
their own chunks was taken out. A pgTAP file is one transaction that rolls back,
so those thousand rows are queried while uncommitted, which is a question an
approximate index does not answer: it failed about one run in three inside the
full gate while passing every time in isolation. The reasoning is written out at
`supabase/tests/20_search.test.sql:222`. The recall half of the table above is
therefore a development observation, and the measurement below is what would put
it back under test.

`public.search` therefore ships with the setting on the function itself:

```sql
alter function public.search(extensions.vector, text, uuid[], integer)
  set hnsw.iterative_scan = relaxed_order;
```

On the function rather than the role or the database, so web, mobile and the MCP
server all inherit it from the one implementation they already share.
`relaxed_order` rather than `strict_order` because `search` re-ranks with
reciprocal rank fusion afterwards, so paying for exact scan order buys nothing.

One gotcha worth writing down: until a vector operation has run in the session,
`hnsw.iterative_scan` is an unrecognised placeholder and the `alter function` is
refused with "permission denied to set parameter". The migration performs a
trivial cast above it.

What remains to be measured is the cost, not the correctness. The table
below is where that measurement goes.

## Digital Brain measurement

Every value here is `not measured` as of 2026-09-09. Filter selectivity is the
fraction of chunks in the corpus that the querying user can see, which is the
`space_filter` and RLS predicate combined.

| Corpus size | Filter selectivity | recall@10    | p50 latency  | p95 latency  | `hnsw.iterative_scan` |
| ----------- | ------------------ | ------------ | ------------ | ------------ | --------------------- |
| 10k chunks  | 1 percent          | not measured | not measured | not measured | `off`                 |
| 10k chunks  | 1 percent          | not measured | not measured | not measured | `relaxed_order`       |
| 100k chunks | 1 percent          | not measured | not measured | not measured | `off`                 |
| 100k chunks | 1 percent          | not measured | not measured | not measured | `relaxed_order`       |
| 1M chunks   | 1 percent          | not measured | not measured | not measured | `off`                 |
| 1M chunks   | 1 percent          | not measured | not measured | not measured | `relaxed_order`       |

No latency claim goes on a keynote slide until these cells have numbers in them.
That includes a claim made in passing, in a rehearsal, or in a sentence that
starts with "roughly".

## The method

Written out so whoever runs the measurement does not have to invent a protocol,
and so a second run three weeks later is comparable with the first.

### Corpus

Synthetic chunks generated to the three sizes, embedded with the pinned
embedding model from `docs/limits.md`. Spaces are allocated so that exactly 1
percent of chunks fall inside the querying user's `visible_space_ids()`, spread
across several spaces rather than concentrated in one, because a single
contiguous space is an easier case than a scattered one and would flatter the
result.

The generation script and the fixed random seed are committed, so the corpus is
reproducible rather than described.

### Ground truth

For each query, the exact top 10 is computed by an exhaustive scan: the same
cosine expression over the same filtered row set with `enable_indexscan = off`
and `enable_bitmapscan = off`, forcing a sequential scan. This is slow by
design and it is the definition of correct. It runs once per query per corpus
size and the result is cached to disk.

The filter used for ground truth is the same predicate the indexed query uses.
Comparing an index scan under a permission filter against an exhaustive scan
without one measures the filter rather than the index.

### recall@10

For each query, the intersection of the indexed top 10 with the exhaustive top
10, divided by 10. The reported figure is the mean across the query set, and the
run also records the tenth percentile, because a mean of 0.94 hiding a tail of
queries at 0.3 is the case that produces a visibly wrong answer on stage.

recall@10 is measured on the semantic arm alone. The lexical arm has no
approximate index and no recall question to answer, and fusing the two before
measuring would let a strong lexical result hide a degraded vector scan.

### Query set

200 queries per corpus size, each embedded once and reused across every cell in
the row so the same vectors run against every `iterative_scan` setting. The
queries are generated in three groups of equal size:

- Questions whose answer sits inside the visible 1 percent.
- Questions whose answer sits outside it, which measure that the filter holds.
- Exact-match questions containing an identifier, which exercise the lexical arm.

### Warm and cold

Both are reported, separately, and never averaged together.

**Cold** is the first execution after a `discard all` and a restart of the
database container, with no prewarming. It is the number a user sees when their
tenant has been idle.

**Warm** is measured after 20 discarded warmup queries against the same index,
with the index resident in shared buffers. It is the number the demo will show.

Latency is measured server side from `explain (analyze, buffers)` execution
time rather than from the client, so network time and connection setup stay out
of the figure. Each query runs five times at each setting and the median of the
five is the sample; p50 and p95 are then computed across the 200 samples.

### What gets recorded

Every run records the date, the pgvector version, the Postgres version, the
Supabase compute size, `ef_search`, `hnsw.max_scan_tuples`, and the corpus seed,
alongside the numbers. A cell without those is not reproducible and does not go
in the table.
