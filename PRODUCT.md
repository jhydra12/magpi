# Digital Brain

A team knowledge base with a chat interface.

## What it does

You sign up, connect Notion, Linear, Slack and Google Drive, or upload files directly. Digital Brain chunks the content, embeds it, and stores it in Postgres. Then you ask questions in a conversation and get answers with citations back to the source.

Overnight, Digital Brain dreams. A scheduled job re-reads what came in that day, extracts entities, links documents that are about the same thing, and writes a digest back into the space. Dreaming is the reason the product feels like a brain instead of a search box.

## Who it is for

**The individual.** One person on a free plan with a personal space, a Notion connection and a folder of PDFs. They want to stop searching four tools to answer one question.

**The team.** Ten to fifty people who share a Slack workspace and a Linear project. They want the answer to "why did we decide that" to survive the person who decided it leaving.

**The organization.** Hundreds or thousands of people with a real permission boundary. They want to know that the leadership space stays in the leadership space, and they want proof, not a promise.

All three run the same code. The only difference is the row count.

## The mental model

Every document lives in exactly one **space**. There are three kinds:

- **Personal.** Created automatically for every user. One member, always. This is "only I can see it".
- **Team.** A named group with an explicit member list.
- **Org.** One per organization, every member included. This is "everyone can see it".

When you connect a source or upload a file, you pick the space. That is the whole model. No nesting, no inheritance, no per-document sharing.

Digital Brain owns its permission boundary rather than mirroring the boundaries of the tools it reads from. Mirrored permissions always propagate late, and late is the same as wrong when someone leaves the company.

## The primary jobs

1. **Ask a question, get a cited answer.** The conversation is the product. Not a search box with results, a conversation that remembers the last three turns.
2. **Connect a source and watch it arrive.** Ingest is visible. Progress streams. Failures say what failed and why, at which stage.
3. **Put a document somewhere on purpose.** Choosing the space is the permission decision, made once, at the moment of upload.
4. **Read what the brain worked out overnight.** A digest, an entity, a link between a Linear issue and a Slack thread. Every one of them cited.
5. **Know whether the brain is working.** An admin sees ingest health, what people ask, what nobody ever reads, and usage against plan.

## What it is not

- Not a file manager. Documents are read, cited and searched, never organized into folders.
- Not an ACL mirror. It does not reproduce Notion's or Slack's permission graph.
- Not an agent platform. It answers questions about your content. It does not take actions in your tools.
- Not a wiki. Nobody writes into Digital Brain by hand except the dream job.

## Tone

Plain and precise. The product is handling a company's private knowledge, so it never sounds clever about it. When something fails, it says what failed. When a permission boundary hides a result, the answer is simply shorter, with no error and no dialog about it.

The one place personality shows is dreaming, and even there the word is defined in a sentence the first time a user sees it and then used without apology.

## Success looks like

A person clones the repo, runs `supabase start` and `pnpm dev`, uploads a file, and gets a cited answer inside five minutes.
