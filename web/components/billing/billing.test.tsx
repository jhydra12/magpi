import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PlanUsage as PlanUsageData } from '@/lib/analytics/queries';

import { PlanUsage } from '../admin/plan-usage';
import { PlanCard, type BillingState } from './plan-card';
import { PricingTable } from './pricing-table';

function billingState(overrides?: Partial<BillingState>): BillingState {
  return {
    plan: 'free',
    seats: 1,
    hasStripeCustomer: false,
    isStripeConfigured: true,
    ...overrides,
  };
}

function planUsage(overrides?: Partial<PlanUsageData>): PlanUsageData {
  return {
    plan: 'free',
    documents: { used: 88, limit: 200 },
    queries: { used: 140, limit: 500 },
    seats: { used: 1, limit: 1 },
    storageBytes: { used: 1_400_000_000, limit: null },
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    ...overrides,
  };
}

describe('plan card', () => {
  it('offers checkout to an organization that has never paid', () => {
    render(<PlanCard state={billingState()} />);

    const button = screen.getByRole('button', { name: 'Upgrade to Team' });
    expect(button.closest('form')).toHaveAttribute('action', '/api/stripe/checkout');
  });

  it('sends an existing customer to the Stripe portal instead', () => {
    render(<PlanCard state={billingState({ plan: 'team', seats: 7, hasStripeCustomer: true })} />);

    const button = screen.getByRole('button', { name: 'Manage billing in Stripe' });
    expect(button.closest('form')).toHaveAttribute('action', '/api/stripe/portal');
    expect(screen.getByText('7 seats on this plan.')).toBeInTheDocument();
  });

  it('says which credentials are missing rather than offering a button that fails', () => {
    render(<PlanCard state={billingState({ isStripeConfigured: false })} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/SB_STRIPE_SECRET_KEY/)).toBeInTheDocument();
  });

  it('gives Enterprise no self-serve path, because there is not one', () => {
    render(<PlanCard state={billingState({ plan: 'enterprise' })} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Talk to whoever set it up/)).toBeInTheDocument();
  });
});

describe('pricing table', () => {
  it('shows all three plans with a call to action each', () => {
    render(<PricingTable />);

    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start on Team' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Talk to us' })).toHaveAttribute(
      'href',
      'mailto:sales@digitalbrain.example',
    );
  });
});

describe('usage against plan', () => {
  it('meters documents, questions and seats against the plan', () => {
    render(<PlanUsage usage={planUsage()} />);

    expect(screen.getByRole('meter', { name: 'Documents ingested' })).toHaveAttribute(
      'aria-valuemax',
      '200',
    );
    expect(screen.getByRole('meter', { name: 'Questions this month' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Seats used' })).toBeInTheDocument();
  });

  it('shows storage as a running total, since no plan limit meters bytes', () => {
    render(<PlanUsage usage={planUsage()} />);

    expect(screen.getByText('1.4 GB')).toBeInTheDocument();
    expect(screen.queryByRole('meter', { name: 'Storage stored' })).not.toBeInTheDocument();
  });

  it('links to billing rather than growing its own plan controls', () => {
    render(<PlanUsage usage={planUsage()} />);

    expect(screen.getByRole('link', { name: 'Manage billing' })).toHaveAttribute(
      'href',
      '/admin/billing',
    );
  });
});
