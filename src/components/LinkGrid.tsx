import { Link } from '../lib/supabase';
import { LinkCard } from './LinkCard';
import { EmptyState } from './EmptyState';
import { LoadingSpinner } from './LoadingSpinner';

interface LinkGridProps {
  links: Link[];
  isLoading: boolean;
  onLinkDeleted: () => void;
}

export function LinkGrid({ links, isLoading, onLinkDeleted }: LinkGridProps) {
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (links.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {links.map((link) => (
        <LinkCard key={link.id} link={link} onDelete={onLinkDeleted} />
      ))}
    </div>
  );
}
