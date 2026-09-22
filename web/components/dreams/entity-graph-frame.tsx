import type { ReactNode, RefObject } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';

import { Button } from '@/components/ui/button';

const STAGE_GRID = {
  backgroundImage:
    'radial-gradient(circle, color-mix(in oklab, var(--foreground) 16%, transparent) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
} as const;

/** Bordered map surface: grid, hover label, and zoom controls around the canvas. */
export function EntityGraphFrame({
  containerRef,
  fitted,
  empty,
  active,
  overlay,
  onZoomIn,
  onZoomOut,
  onFit,
  children,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  fitted: boolean;
  empty: boolean;
  active: boolean;
  overlay: { key: string; title: string; detail: string } | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative min-h-[24rem] overflow-hidden rounded-xl border border-border bg-background transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none lg:h-full lg:min-h-0 ${fitted || empty ? 'opacity-100' : 'opacity-0'}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={STAGE_GRID} />
      <div ref={containerRef} className="entity-graph-stage absolute inset-0 touch-manipulation">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {active ? 'Waiting for the first entities…' : 'No entities yet'}
          </div>
        ) : (
          children
        )}
      </div>
      {empty ? null : (
        <>
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[min(24rem,70%)]">
            {overlay ? (
              <div
                key={overlay.key}
                className="animate-in rounded-md border border-border bg-popover/95 px-2.5 py-1.5 text-sm shadow-sm duration-150 fade-in motion-reduce:animate-none"
              >
                <p className="font-medium text-foreground" translate="no">
                  {overlay.title}
                </p>
                {overlay.detail ? (
                  <p className="truncate text-xs text-muted-foreground">{overlay.detail}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Drag to pan. Scroll to zoom.</p>
            )}
          </div>
          <div className="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-lg border border-border bg-popover/95">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
              className="size-8 rounded-none"
              onClick={onZoomIn}
            >
              <Plus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
              className="size-8 rounded-none border-t border-border"
              onClick={onZoomOut}
            >
              <Minus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Fit graph"
              className="size-8 rounded-none border-t border-border"
              onClick={onFit}
            >
              <Scan aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
