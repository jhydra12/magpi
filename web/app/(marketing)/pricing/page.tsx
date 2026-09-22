import { ShellRow } from '@/components/app/shell-row';
import { PricingTable } from '@/components/billing/pricing-table';

export const metadata = {
  title: 'Pricing | Digital Brain',
  description: 'Free for one personal space. Team is per person, per month.',
};

export default function PricingPage() {
  return (
    <ShellRow className="flex flex-col gap-12 py-20">
      <section className="max-w-[var(--measure-prose)]">
        <h1 className="font-heading text-4xl leading-[1.1] font-medium tracking-tight text-foreground">
          Pay for the team, not the documents.
        </h1>
        <p className="mt-5 text-base text-muted-foreground">
          Every plan reads the same way and answers with the same citations. What changes is how
          many people you can bring, and whether Digital Brain goes and fetches your sources for
          you.
        </p>
      </section>

      <PricingTable />
    </ShellRow>
  );
}
