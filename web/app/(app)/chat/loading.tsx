import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      <div className="flex w-full max-w-[var(--measure-prose)] flex-col items-center gap-8">
        <Skeleton className="h-8 w-8 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-8 w-64 rounded-[var(--radius-panel)] motion-reduce:animate-none" />
        <Skeleton className="h-[88px] w-full rounded-[var(--radius-panel)] motion-reduce:animate-none" />
      </div>
    </div>
  );
}
