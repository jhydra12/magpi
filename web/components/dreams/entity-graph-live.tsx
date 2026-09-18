'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Refreshes the server-rendered entity graph while Dream workers are active. */
export function EntityGraphLive({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return children;
}
