import Link from 'next/link';
import type { ReactNode } from 'react';
import { MagpieMark } from '@/components/brand/magpie-mark';

/** One centered panel, used as the frame for every auth screen. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-10 p-6">
      <Link
        href="/"
        className="flex items-center gap-2.5 font-heading text-lg tracking-tight text-foreground"
      >
        <MagpieMark size={26} />
        Magpi
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="font-heading text-xl leading-tight font-medium tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-tertiary-foreground">{description}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="text-sm text-tertiary-foreground">{footer}</div> : null}
    </div>
  );
}
