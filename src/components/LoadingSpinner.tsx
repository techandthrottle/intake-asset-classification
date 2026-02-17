export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="inline-block animate-spin rounded-full border-2 border-neutral-200 dark:border-neutral-800 border-t-primary-500 w-12 h-12"></div>
    </div>
  );
}
