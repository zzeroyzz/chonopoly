/**
 * Loading placeholders shaped like the thing that is coming.
 *
 * The word "Loading…" tells you nothing about what you are waiting for, and
 * it collapses to a single line, so the real content lands and shoves the page
 * around. A placeholder the same shape as the answer holds the space and says
 * what kind of answer it is.
 *
 * The shimmer itself is the `.skeleton` class in globals.css, which already
 * existed for the rate lookup. These are the shapes built on top of it, in one
 * place so ten screens cannot each invent their own grey box.
 */

interface SkeletonProps {
  /** Tailwind sizing for this block — always set a height. */
  className?: string;
}

/** One shimmering block. The unit everything else is built from. */
export function Skeleton({ className = "h-4 w-full" }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/**
 * The announcement that goes with a set of placeholders.
 *
 * The blocks are all aria-hidden, so without this a screen reader hears
 * nothing at all while waiting. One sentence, once, is the whole fix.
 */
export function SkeletonRegion({
  label,
  testId,
  children,
}: {
  /** Plain words for what is loading: "Loading your houses". */
  label: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" data-testid={testId}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A bordered card the same size as a real one, to fill with blocks. */
export function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-(--color-border-default) bg-(--color-surface) px-3.5 py-3">
      {children}
    </div>
  );
}

/**
 * A label bar over an input bar, which is every row in the settings forms.
 *
 * Widths vary a little per row so a column of them does not read as a barcode.
 */
export function SkeletonField({ labelWidth = "w-24" }: { labelWidth?: string }) {
  return (
    <div className="grid gap-1.5">
      <Skeleton className={`h-2.5 ${labelWidth}`} />
      <Skeleton className="h-9 w-full rounded-[var(--radius-md)]" />
    </div>
  );
}

/** Repeats a shape, with the gap the real list uses. */
export function SkeletonList({
  count,
  gap = "gap-2",
  children,
}: {
  count: number;
  gap?: string;
  children: (index: number) => React.ReactNode;
}) {
  return (
    <div className={`grid ${gap}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>{children(i)}</div>
      ))}
    </div>
  );
}
