import Link from 'next/link';

import { ShellRow } from '@/components/app/shell-row';
import { SourceMark } from '@/components/brand/source-mark';
import { FoldedMagpie } from '@/components/brand/magpie-mark';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Magpi',
  description: 'Ask your team documents a question and get a cited answer.',
};

const SOURCES = [
  { slug: 'notion', label: 'Notion' },
  { slug: 'linear', label: 'Linear' },
  { slug: 'slack', label: 'Slack' },
  { slug: 'google_drive', label: 'Google Drive' },
  { slug: 'upload', label: 'Direct upload' },
] as const;

export default function LandingPage() {
  return (
    <ShellRow className="flex flex-col gap-20 py-16 md:py-24">
      {/* Bird beside the headline on desktop, below it on mobile. */}
      <section className="flex flex-col-reverse items-center gap-12 md:flex-row md:items-center md:gap-16">
        <div className="max-w-[var(--measure-prose)] md:flex-1">
          <h1 className="font-heading text-4xl leading-[1.1] font-medium tracking-tight text-balance text-foreground md:text-5xl">
            Your team deserves better answers.
          </h1>
          <p className="mt-5 text-base text-muted-foreground">
            Connect Notion, Linear, Slack and Google Drive. Search gives you raw pages. A digital
            brain gives you answers and context.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/sign-up">Create an account</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="https://github.com/supabase/select-2026-demo">Read the source</Link>
            </Button>
          </div>
        </div>

        <FoldedMagpie className="w-full max-w-[420px] shrink-0 md:max-w-[520px]" />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-medium text-foreground">
          Pull data and context from everywhere you already work
        </h2>
        <ul className="flex flex-wrap gap-2">
          {SOURCES.map((source) => (
            <li
              key={source.slug}
              className="flex items-center gap-2 rounded-[var(--radius-panel)] border border-border px-3 py-1.5 text-sm text-muted-foreground"
            >
              <SourceMark source={source.slug} />
              {source.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-10 md:grid-cols-3">
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            Control who sees your data
          </h3>
          <p className="mt-2 text-sm text-tertiary-foreground">
            Create spaces with personal, team, or public scopes. Store your documents and
            connections within spaces.
          </p>
        </div>
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            Answer your most pressing questions
          </h3>
          <p className="mt-2 text-sm text-tertiary-foreground">
            Get answers with full context and citations for how they were reasoned.
          </p>
        </div>
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            Find connections across your work
          </h3>
          <p className="mt-2 text-sm text-tertiary-foreground">
            Every night your digital brain reads the day&rsquo;s work and links it to everything it
            already knows. Ask in the morning and the connections are already there.
          </p>
        </div>
      </section>
    </ShellRow>
  );
}
