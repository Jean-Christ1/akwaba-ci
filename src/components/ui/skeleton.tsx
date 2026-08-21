import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

/**
 * Skeleton dense : reproduit la silhouette d'une PlaceCard (image + 2 lignes)
 * pour éviter le layout shift et donner une perception de chargement instantanée.
 */
function PlaceCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("akw-card overflow-hidden", className)}>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function RowSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === 0 ? "w-1/2" : "w-3/4")} />
      ))}
    </div>
  );
}

export { Skeleton, PlaceCardSkeleton, RowSkeleton };
