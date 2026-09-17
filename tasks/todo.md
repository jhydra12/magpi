# Session queue, 2026-09-17 evening: Magpi on BYO-MCP

- [x] Hosted project: OAuth server on, dynamic registration on, consent path /oauth/consent
- [x] Function: compose with the block's `pipeline` and read MCP_SERVER_NAME / _DESCRIPTION
      from env, with Magpi's defaults. Keep the five tools, rate limit, model runner, notes.
- [x] Consent page: use the library block's `useOAuthConsent` hook; keep Magpi's UI on the tokens
- [x] Prove it: discovery chain, dynamic client registration, authorize URL, against hosted
- [x] Gate, PR, merge, rebase the three demo branches

## Review

PR #5 merged and deployed. The hosted MCP server answers on the block's pipeline
composition, the OAuth chain on the hosted project works end to end (discovery,
dynamic registration, authorize redirect to /oauth/consent), and the consent page
runs on the library's hook. docs/demo.md is the run sheet, with step 9 written,
and the same text is the first toggle under Theme 1 in Notion. README cut to
what Magpi is, how to run it, the demo accounts, deploying, tests. The three demo
branches are rebased on this main.
