import { Skeleton } from '@/components/ui/skeleton';

export default function ConnectionsLoading() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>

      <div className="divide-y divide-border">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-start justify-between gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </>
  );
}
