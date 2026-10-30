export default function AppLoadingSkeleton() {
  return (
    <div
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 p-6"
      role="status"
      aria-live="polite"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600 dark:border-amber-900 dark:border-t-amber-400" />
      <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
        Loading Kumbisaly Heritage Workspace...
      </p>
    </div>
  );
}
