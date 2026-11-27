export default function GymLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 p-6">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-orange-200 bg-white/80 px-8 py-6 shadow-lg backdrop-blur-md dark:border-orange-800 dark:bg-gray-900/80">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600" />
        <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
          Loading Gym &amp; Fitness Workspace...
        </p>
      </div>
    </div>
  );
}
