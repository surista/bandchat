/**
 * Upgrade prompt shown when a user tries to access a Pro-only feature.
 * Displays feature name and directs users to the mobile app to upgrade.
 */
export default function UpgradePrompt({ feature, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
        {feature || 'Pro Feature'}
      </h3>
      <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
        {description || 'This feature is available on the Pro plan.'}
      </p>
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 max-w-xs">
        <p className="text-sm text-[var(--color-text-muted)]">
          Upgrade in the <strong className="text-[var(--color-text-primary)]">BandChat mobile app</strong> to unlock all Pro features.
        </p>
      </div>
    </div>
  );
}
