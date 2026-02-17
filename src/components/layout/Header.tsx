import { Link, useLocation } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';

export function Header() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-neutral-900 dark:text-neutral-50 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
          <Link2 className="w-6 h-6" />
          <span>Asset Classification</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/dashboard"
            className={`text-sm font-medium transition-colors ${
              location.pathname === '/dashboard'
                ? 'text-neutral-900 dark:text-neutral-50'
                : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50'
            }`}
          >
            Dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
