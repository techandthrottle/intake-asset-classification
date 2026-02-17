import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  showAction?: boolean;
}

export function EmptyState({ showAction = true }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4 text-neutral-400 dark:text-neutral-500">
        <Link2 className="w-8 h-8" />
      </div>

      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
        No assets yet
      </h3>

      <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mb-6">
        Start building your asset collection by submitting your first URL for classification.
      </p>

      {showAction && (
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
        >
          <Link2 className="w-5 h-5" />
          Submit URL
        </Link>
      )}
    </div>
  );
}
