import { useState, useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Container } from '../components/layout/Container';
import { LinkGrid } from '../components/LinkGrid';
import { supabase, Link } from '../lib/supabase';

export function Dashboard() {
  const [links, setLinks] = useState<Link[]>([]);
  const [filteredLinks, setFilteredLinks] = useState<Link[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('links')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLinks(data || []);
      setFilteredLinks(data || []);
    } catch (err) {
      console.error('Error fetching links:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredLinks(links);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = links.filter(link =>
      link.url.toLowerCase().includes(term) ||
      link.title?.toLowerCase().includes(term) ||
      link.description?.toLowerCase().includes(term) ||
      link.submitted_by.toLowerCase().includes(term) ||
      link.tags?.some(tag => tag.toLowerCase().includes(term))
    );

    setFilteredLinks(filtered);
  }, [searchTerm, links]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLinks();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8">
      <Container>
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-2">
                Asset Dashboard
              </h1>
              <p className="text-neutral-600 dark:text-neutral-300">
                {links.length} classified {links.length === 1 ? 'asset' : 'assets'}
              </p>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 dark:text-neutral-500" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        <LinkGrid
          links={filteredLinks}
          isLoading={isLoading}
          onLinkDeleted={fetchLinks}
        />
      </Container>
    </div>
  );
}
