import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="w-full border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 uppercase tracking-wider">
              Product
            </h3>
            <Link
              to="/dashboard"
              className="block text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
            >
              Dashboard
            </Link>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 uppercase tracking-wider">
              About
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Asset classification system for URL management
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 uppercase tracking-wider">
              Version
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              v1.0.0
            </p>
          </div>
        </div>

        <div className="pt-8 border-t border-neutral-200 dark:border-neutral-800 text-center text-sm text-neutral-500 dark:text-neutral-400">
          © 2026 Asset Classification. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
