# Supaphone

Everything in `supabase/corpus/` is fiction. Supaphone does not exist, the Fold
S1 does not exist, and none of the people named here are real. The documents
were written for Digital Brain so the demo has something with structure in it. This file
is the reference the rest of the corpus is consistent with. Read it before
adding a document, and change it first if a fact needs to move.

The name is deliberately obvious. Nobody watching should wonder for a second
whether this is a real customer's data.

## What the company makes

Supaphone makes the Fold S1, a four-panel folding phone. Three hinges, four
panels, opening from phone to tablet to a desk-sized surface. Seven people. The
device is pre-production, heading for carrier certification and a pilot line in
Shenzhen.

Three names that appear constantly and mean specific things:

- **Meniscus** is the outer display layer, the part a user touches when the
  phone is folded shut.
- **Bellows** is the hinge assembly, all three hinges together.
- **Ori** is the shell and window manager, the software that decides what shows
  on how many panels.

Org slug `supaphone`. Email domain `example.com`, because these are demo
accounts and nothing else should look plausible enough to type into a real form.

## The people

| Person | Email | Role |
| --- | --- | --- |
| Jane Okonkwo | jane@example.com | CEO, co-founder |
| Sam Lindqvist | sam@example.com | Hardware, hinge and display |
| Ben Achilov | ben@example.com | Firmware and the Ori shell |
| Maya Restrepo | maya@example.com | Head of marketing |
| Priya Raghunathan | priya@example.com | Product marketing |
| John Mbeki | john@example.com | Finance lead |
| Dana Provenzano | dana@example.com | Supply chain and manufacturing ops |

Every account has the password `supabasedemo`. They are demo accounts in a demo
company and the password is in the README.

## The spaces

| Space | Kind | Members |
| --- | --- | --- |
| Company | org | all seven, enrolled by the signup trigger |
| Marketing | team | Jane, Maya, Priya, Ben |
| Engineering | team | Jane, Sam, Ben, John |
| Finance | team | Jane, John, Dana |
| Personal | personal | one per person, seeded for Jane, Sam and John |

Jane is the only person in every shared space, which is the whole reason she is
the account the demo signs in as. She is not privileged: there is no role in
this product that reads across a space boundary. She sees everything because she
is a member of everything, and the moment you remove her from Finance she stops
seeing Finance.

The two walls that matter:

- **Sam is not in Finance.** Anything about cost, margin or the launch price is
  invisible to him.
- **John is not in Marketing.** Anything about the launch date, the embargo or
  the carrier deal is invisible to him.

Ben is in Marketing and Engineering but not Finance. Dana is in Finance but not
Engineering. Every question in `docs/corpus.md` names which of these people can
answer it and which cannot.

## The timeline

Two tranches, and the split is the demo.

**Tranche 1 runs 2026-08-10 to 2026-09-08.** Thirty days, loaded fully
processed: documents, chunks, embeddings, entities, mentions, dream runs,
digests, links, plus backdated conversations and usage.

**Tranche 2 is 2026-09-09.** One day, loaded as documents with queued ingest
jobs and nothing else. This is the input to tonight's dream, and running that
dream on stage is the point.

## What is planted in it

Four properties, planted on purpose. A document that contradicts one of these is
a bug in the corpus.

**1. One thing under three names.** The outer layer decision is called the
outer layer decision in Notion, `ENG-212` in Linear, and the crease thing in
Slack. Entity extraction has something real to canonicalize.

**2. A decision that reversed.** On 12 August the team picked UTG-3 ultra-thin
glass for Meniscus. On 27 August they reversed it to Meniscus-C polymer after
the hinge cycle test failed at 180,000 cycles on unit B7. Both decisions are
written down. Asking what Meniscus is made of has to come back with the polymer,
and the glass has to be findable as the thing that was superseded.

**3. A fact only Finance holds.** The Fold S1 unit cost landed at $1,140, which
is what set the $1,899 launch price. That number appears only in Finance
documents. Jane and John can answer a question about margin. Sam gets a shorter
answer with no error and no dialog about it.

**4. A fact only Marketing holds.** The launch is 2026-11-04, embargo lifting at
10:00, with two carriers signed. The exact date, the embargo hour, the retail
dates and the commercial terms appear only in Marketing documents.

What is not walled: that the phone ships in November, and that there are two
carriers to certify with. Everyone at a company that size knows the month, and
carrier certification is engineering's own work. Sam can find out that the
Fold S1 ships in November and still not find out when.

## Where the documents come from

Five sources, and each one has to read like an export from that tool rather than
like a memo. A citation to a Slack thread that looks identical to a citation to
a Notion page teaches the audience nothing.

- **Slack** is threaded messages with handles and timestamps, in
  `#general`, `#hardware`, `#display`, `#firmware`, `#design`,
  `#supply-chain`, `#gtm`, `#finance`, `#incidents`, `#random`.
- **Linear** is issue bodies with a status line, labels, an assignee and a
  comment thread. Prefixes: `ENG`, `HW`, `ORI`, `OPS`, `GTM`.
- **Notion** is nested pages with headings, tables and decision records.
- **Google Drive** is longer prose: memos, board updates, test reports.
- **Direct upload** is what a person dragged in: a PDF report, a spreadsheet
  export written out as a table, a scanned supplier quote.

## Detail the corpus settled on

Written down after the fact, because documents already depend on these and a new
one that disagrees would be the inconsistency this file exists to prevent.

- **Suppliers are places, not companies.** UTG-3 came from the Kyoto vendor,
  Meniscus-C from the Suwon vendor. Carriers are A and B and never named.
- **The cycle spec is 200,000**, for a two year life. Test units are B5, B6, B7
  and B9 on glass, B11 and B12 on polymer.
- **Four panels**, numbered from hinge 1. Hinge 2 is the middle one. Fold states
  are phone, tablet and desk. A pane is a whole panel.
- **The crease is measured** on a 60 degree gloss meter against a 2.5 GU gate,
  with a three-observer panel behind it.
- **Certification** is FCC Part 15B, SAR limit 1.6 W/kg, accredited lab booked
  for the week of 21 September.
- **Finance only.** Unit cost $1,140, launch price $1,899, about 40 percent
  gross margin. Panels are 41 percent of the bill of materials, Bellows 14
  percent. Polymer tooling $214k against $267k for glass.
- **Marketing only.** Embargo lifts at 10:00 on 2026-11-04, retail 4 and 7
  November, two carriers signed on commercial terms. Carriers are A and B in
  Marketing, and Alder and Birch where a codename is needed.

## The commercial detail

The device is pre-production, so nothing has sold. Every number about demand is a
forecast, a commitment or a research result, and no document reports units sold.
A document that describes actual sell-through is a bug in the corpus.

### Colourways

Six finishes went into review on 24 August. Four ship, two were cut.

| Finish | Shade | Status | Why |
| --- | --- | --- | --- |
| Ink | near black | ships | lead finish, the one in every render |
| Chalk | warm off-white | ships | shows the crease least of the four |
| Moss | deep green | ships | best panel result in Korea and Japan |
| Ember | burnt copper | ships | narrow appeal, high intent where it lands |
| Tide | pale blue | cut | tint shifted yellow under the Meniscus-C coating |
| Rust | oxide red | cut | needed a second anodising pass and there was no tooling slot |

Both cuts trace to the polymer reversal on 27 August. Tide is a coating problem
and Rust is a schedule problem, and neither was a taste decision. Anyone asking
why there are four colours should be able to find that.

The Suwon hard coat and anti-fingerprint stack covers the whole outer face and
the rear cover, not only the active display area, so it sits over the colour
layer everywhere. That is why a display material change was able to kill a frame
colour. Its cast is b* +1.9 against +0.2 for the Kyoto glass stack, which is
nothing on a near black, a warm white, a deep green or a copper, and is the
whole shade on a pale blue. Tide measured delta E 2000 of 4.6 against its master
swatch, 3.1 of it in b*, against a 1.5 gate. The cast is inherent to the
anti-fingerprint chemistry and is not a process fault.

### The first-quarter forecast

The 180,000 splits like this, and every table in the corpus agrees with it.

| Tier | Market | Units |
| --- | --- | --- |
| 1 | United States | 42,000 |
| 1 | Korea | 41,000 |
| 1 | Japan | 31,000 |
| 1 | Germany | 20,500 |
| 1 | United Kingdom | 14,000 |
| 2 | France | 9,500 |
| 2 | Canada | 9,000 |
| 2 | Australia | 8,000 |
| 2 | Netherlands | 5,000 |

Tier 1 is 148,500 and tier 2 is 31,500. Korea and Japan are 72,000, which is
40.0 percent. By finish: Ink 68,245, Chalk 48,125, Moss 40,195, Ember 23,435.

Carrier sell-in is Alder 46,000 across Korea, the United States, Germany and
Canada, and Birch 25,000 across Japan, the United Kingdom, Australia and France.
The Netherlands has no carrier, which is an open gap several documents raise and
none of them closes.

### Markets

Eleven markets in three tiers. Tier 1 is launch day, tier 2 is six weeks later,
tier 3 is 2027 and has no committed date.

- **Tier 1.** Korea, Japan, United States, Germany, United Kingdom.
- **Tier 2.** France, Netherlands, Canada, Australia.
- **Tier 3.** Singapore, United Arab Emirates.

The first-quarter forecast is 180,000 units across tier 1 and tier 2. Korea and
Japan together are about 40 percent of it, which is why the panel work weights
those two.

### Segments

The panel ran 1,800 respondents across the five tier 1 markets in the week of
17 August. Six segments, and the corpus refers to them by these names.

| Segment | Who | Share of intent |
| --- | --- | --- |
| Commuter | 25 to 34, urban, high screen hours | 24% |
| Desk | 35 to 54, wants the tablet state for documents | 21% |
| Creator | 18 to 29, wants the desk state for editing | 18% |
| Traveller | 30 to 44, dual SIM, frequent flights | 15% |
| Field | 30 to 49, buys on durability | 13% |
| First-in-line | 22 to 40, buys because it is new | 9% |

### Packaging, accessories and carriers

- **Packaging** is a moulded fibre tray with no plastic. Colourway names have to
  be locked before the packaging art goes to print.
- **Accessories** are a folio case in each of the four shipping finishes and a
  desk stand that is Chalk only.
- **Carriers** are A and B everywhere except Marketing, where they are Alder and
  Birch. Sell-in commitments are counted in units and belong to Marketing.

### Which space holds which number

The two walls still hold, and the commercial documents make them easier to break
by accident than the engineering ones did.

- **Unit counts** are forecasts, commitments and panel results. They live in
  Marketing and Company and may be named anywhere.
- **Money** is Finance. Any document that multiplies units by a price, or names
  the unit cost, the launch price, margin or tooling spend, is a Finance
  document.
- **The launch date, the embargo hour and the retail dates** are Marketing, as
  before. Tier timing outside Marketing says "launch" or "November" and never a
  day. The word embargo appears nowhere but Marketing.

## Rules for adding a document

- Every fact must agree with this file. If it cannot, change this file first.
- Authorship follows membership. An author, owner, assignee or commenter must be
  a member of the space the document lands in. A Finance document written by Sam
  is a bug, and so is a Slack thread in an Engineering channel with Dana posting
  in it.
- Being mentioned is not the same as taking part. An Engineering page can say
  "Dana reordered the tooling" even though Dana is not in Engineering, because
  people talk about colleagues on other teams constantly. She just cannot be the
  one writing it.
- Dates fall inside a tranche. Nothing is dated after 2026-09-09.
- No document explains the permission model. The corpus is the company's work,
  not a tutorial about Digital Brain.
