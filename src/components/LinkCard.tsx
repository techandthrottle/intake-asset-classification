import { useState } from 'react';
import { Copy, Trash2, ExternalLink, Check, FolderOpen, Image, Video, Loader2 } from 'lucide-react';
import { Link } from '../lib/supabase';
import { formatDate, truncateUrl } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { ExtractedFilesModal } from './ExtractedFilesModal';

interface LinkCardProps {
  link: Link;
  onDelete?: () => void;
}

export function LinkCard({ link, onDelete }: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);

  const imageCount = link.google_drive_files?.filter(f => f.mimeType.startsWith('image/')).length || 0;
  const videoCount = link.google_drive_files?.filter(f => f.mimeType.startsWith('video/')).length || 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this link?')) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('links')
        .delete()
        .eq('id', link.id);

      if (error) throw error;
      onDelete?.();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete link');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-md border border-neutral-200 dark:border-neutral-800 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group">
      <div className="flex items-start gap-4">
        {link.favicon && (
          <img
            src={link.favicon}
            alt=""
            className="w-10 h-10 rounded-lg flex-shrink-0 bg-neutral-100 dark:bg-neutral-800"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1 truncate">
            {link.title || 'Untitled'}
          </h3>

          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1 mb-2"
          >
            {truncateUrl(link.url, 60)}
            <ExternalLink className="w-3 h-3" />
          </a>

          {link.description && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 line-clamp-2">
              {link.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
            <span>By {link.submitted_by}</span>
            <span>•</span>
            <span>{formatDate(link.created_at)}</span>
          </div>

          {link.tags && link.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {link.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {link.is_google_drive && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-sm">
                <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-900 dark:text-blue-100">
                  Google Drive Folder
                </span>
              </div>

              {link.processing_status === 'processing' && (
                <div className="flex items-center gap-2 mt-2 text-xs text-blue-700 dark:text-blue-300">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Extracting files...
                </div>
              )}

              {link.processing_status === 'completed' && (imageCount > 0 || videoCount > 0) && (
                <div className="flex items-center gap-3 mt-2 text-xs text-blue-700 dark:text-blue-300">
                  {imageCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Image className="w-3 h-3" />
                      {imageCount} image{imageCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {videoCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Video className="w-3 h-3" />
                      {videoCount} video{videoCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              {link.processing_status === 'failed' && (
                <p className="mt-2 text-xs text-error-600 dark:text-error-400">
                  {link.processing_error || 'Failed to extract files'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        {link.is_google_drive && link.processing_status === 'completed' && (imageCount > 0 || videoCount > 0) && (
          <button
            onClick={() => setShowFilesModal(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            View Files ({imageCount + videoCount})
          </button>
        )}

        <button
          onClick={handleCopy}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-transparent text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy
            </>
          )}
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-transparent text-error-600 dark:text-error-400 rounded-lg hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      <ExtractedFilesModal
        files={link.google_drive_files || []}
        isOpen={showFilesModal}
        onClose={() => setShowFilesModal(false)}
      />
    </div>
  );
}
