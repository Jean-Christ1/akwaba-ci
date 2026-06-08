import { Children, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Rail horizontal à snap sur mobile/tablette, grille classique sur desktop.
 * Permet de garder la première vue dense sans rallonger le scroll vertical.
 */
export function HorizontalRail({
  children,
  className,
  desktopCols = 4,
  itemClassName,
}: {
  children: ReactNode;
  className?: string;
  desktopCols?: 2 | 3 | 4;
  itemClassName?: string;
}) {
  const items = Children.toArray(children);
  const gridCols =
    desktopCols === 2
      ? "lg:grid-cols-2"
      : desktopCols === 3
      ? "lg:grid-cols-3"
      : "lg:grid-cols-4";

  return (
    <div
      className={cn(
        // mobile/tablet : scroll horizontal avec snap
        "scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6",
        // desktop : grille
        "lg:mx-0 lg:grid lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0 lg:snap-none",
        gridCols,
        className,
      )}
    >
      {items.map((child, i) => (
        <div
          key={i}
          className={cn(
            "w-[78%] min-w-[260px] max-w-[320px] flex-shrink-0 snap-start sm:w-[46%] lg:w-auto lg:min-w-0 lg:max-w-none",
            itemClassName,
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
