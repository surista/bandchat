/**
 * Skeleton loading component for placeholder UI while content loads
 *
 * Usage:
 * <Skeleton className="h-4 w-32" />  // Text line
 * <Skeleton className="h-10 w-full" /> // Input field
 * <Skeleton className="h-12 w-12 rounded-full" /> // Avatar
 * <Skeleton.Message />  // Full message skeleton
 * <Skeleton.Card />     // Card skeleton
 */

function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-[var(--color-bg-tertiary)] rounded ${className}`}
      aria-hidden="true"
    />
  );
}

// Pre-built skeleton for message items
Skeleton.Message = function SkeletonMessage() {
  return (
    <div className="flex gap-3 py-2 px-2" aria-hidden="true">
      <Skeleton className="w-9 h-9 rounded flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
};

// Pre-built skeleton for channel/sidebar items
Skeleton.Channel = function SkeletonChannel() {
  return (
    <div className="flex items-center gap-2 px-4 py-2" aria-hidden="true">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-4 flex-1" />
    </div>
  );
};

// Pre-built skeleton for cards (songs, setlists, etc.)
Skeleton.Card = function SkeletonCard() {
  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]" aria-hidden="true">
      <div className="flex items-start gap-4">
        <Skeleton className="w-12 h-12 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2 mt-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Pre-built skeleton for table rows
Skeleton.TableRow = function SkeletonTableRow({ cols = 4 }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
};

// Pre-built skeleton for list view items (calendar events, etc.)
Skeleton.ListItem = function SkeletonListItem() {
  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]" aria-hidden="true">
      <div className="flex items-start gap-4">
        <Skeleton className="w-2 h-16 rounded" />
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-6 w-16 rounded" />
          </div>
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    </div>
  );
};

export default Skeleton;
