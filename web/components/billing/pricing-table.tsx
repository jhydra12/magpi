import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { PLANS, type Plan } from '@/lib/billing/plans';

/** One bordered panel divided into plan columns, rather than three separate cards. */
export function PricingTable() {
  return (
    <div className="grid overflow-hidden rounded-[var(--radius-panel)] border border-border md:grid-cols-3 md:divide-x md:divide-border">
      {PLANS.map((plan) => (
        <PlanColumn key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function PlanColumn({ plan }: { plan: Plan }) {
  return (
    <div className="flex flex-col gap-5 border-b border-border p-6 last:border-b-0 md:border-b-0">
      <div>
        <h2 className="font-heading text-lg font-medium text-foreground">{plan.name}</h2>
        <p className="mt-3 font-heading text-3xl leading-none font-medium text-foreground">
          {plan.price}
        </p>
        {plan.cadence ? (
          <p className="mt-1.5 text-xs text-tertiary-foreground">{plan.cadence}</p>
        ) : null}
        <p className="mt-4 text-sm text-tertiary-foreground">{plan.summary}</p>
      </div>

      <ul className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>

      <PlanCallToAction plan={plan} />
    </div>
  );
}

function PlanCallToAction({ plan }: { plan: Plan }) {
  switch (plan.signup) {
    case 'current':
      return (
        <Button variant="outline" asChild>
          <Link href="/sign-up">Start free</Link>
        </Button>
      );
    case 'checkout':
      return (
        <Button asChild>
          <Link href="/sign-up">Start on Team</Link>
        </Button>
      );
    case 'contact':
      return (
        <Button variant="outline" asChild>
          <a href="mailto:sales@digitalbrain.example">Talk to us</a>
        </Button>
      );
    default: {
      const exhaustive: never = plan.signup;
      return exhaustive;
    }
  }
}
