import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "full" | "mark";
  tone?: "default" | "light";
}

export function Logo({ className, variant = "full", tone = "default" }: LogoProps) {
  const color = tone === "light" ? "text-background" : "text-foreground";
  return (
    <div className={cn("flex items-center gap-2.5", color, className)}>
      <span className="relative flex h-8 w-8 items-center justify-center">
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
          <circle cx="16" cy="16" r="15" fill="hsl(var(--primary))" />
          <path
            d="M10 22 L16 9 L22 22 M12.5 18 H19.5"
            stroke="hsl(var(--accent))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
      {variant === "full" && (
        <span className="font-display text-xl font-semibold tracking-tight leading-none">
          Akwaba
        </span>
      )}
    </div>
  );
}
