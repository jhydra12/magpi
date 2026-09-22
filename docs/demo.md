# Demo run sheet

The run sheet lives in the README, under "Demo run sheet, Theme 1", and in
the Notion page "Select 2026 Keynote Demo Flow". Keep the two the same.

## Rehearsing without paying for it

`SB_MODEL_REHEARSAL=1` swaps the OpenAI client for a stand-in that builds each
answer out of the text the prompt already carries. One press of "Process"
costs about $1.17 against the real provider, which is why rehearsing it a dozen
times emptied the account before the keynote.

What stays real: the queue, the claim, the Edge and Compute workers, the vector
search, every write, the realtime updates and the progress UI. Only the provider
call is replaced.

The answers are derived, not canned, because the entities pass files a name only
when the notes really say it. Names are the proper nouns the corpus repeats,
digest lines are sentences the documents really contain, and a link rationale is
built from the two titles it was handed. The connections pass reuses the
embedding each chunk was given at ingest, so its neighbours are the ones the real
run would have found.

Set it in `supabase/.env.local` for the local stack, or as a project secret for
the hosted one. With it set, `OPENAI_API_KEY` is never read. Unset it to go back
to the provider, which is what the recorded run should use.

Rehearsed calls still write `model_calls` rows, with the token volume really
processed, so the usage panel shows the run. Nothing there is a billed figure.
