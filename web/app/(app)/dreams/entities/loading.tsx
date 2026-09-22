import { Skeleton } from '@/components/ui/skeleton';

export default function DreamsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-[30rem] max-w-full" />
      </div>

      <div className="divide-y divide-border">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-start justify-between gap-4 py-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
