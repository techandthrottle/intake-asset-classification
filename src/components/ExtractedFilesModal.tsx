import { X, Download, Image as ImageIcon, Video } from 'lucide-react';
import { ExtractedFile } from '../lib/supabase';
import { formatFileSize } from '../lib/utils';

interface ExtractedFilesModalProps {
  files: ExtractedFile[];
  isOpen: boolean;
  onClose: () => void;
}

export function ExtractedFilesModal({ files, isOpen, onClose }: ExtractedFilesModalProps) {
  if (!isOpen) return null;

  const images = files.filter(f => f.mimeType.startsWith('image/'));
  const videos = files.filter(f => f.mimeType.startsWith('video/'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-neutral-900 rounded-lg shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
              Extracted Files
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {files.length} file{files.length !== 1 ? 's' : ''} found
              {images.length > 0 && ` • ${images.length} image${images.length !== 1 ? 's' : ''}`}
              {videos.length > 0 && ` • ${videos.length} video${videos.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {images.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Images ({images.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {images.map((file) => (
                  <div
                    key={file.id}
                    className="group relative aspect-square bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
                  >
                    {file.thumbnailLink ? (
                      <img
                        src={file.thumbnailLink}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-neutral-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <a
                        href={file.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-white dark:bg-neutral-900 rounded-lg hover:bg-primary-500 hover:text-white transition-colors"
                        title={file.name}
                      >
                        <Download className="w-5 h-5" />
                      </a>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                      <p className="text-xs text-white truncate">{file.name}</p>
                      <p className="text-xs text-white/70">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {videos.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4 flex items-center gap-2">
                <Video className="w-5 h-5" />
                Videos ({videos.length})
              </h3>
              <div className="space-y-3">
                {videos.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex-shrink-0 w-12 h-12 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center">
                        {file.thumbnailLink ? (
                          <img
                            src={file.thumbnailLink}
                            alt={file.name}
                            className="w-full h-full object-cover rounded"
                          />
                        ) : (
                          <Video className="w-6 h-6 text-neutral-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 ml-3 p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length === 0 && (
            <div className="text-center py-12">
              <p className="text-neutral-600 dark:text-neutral-400">
                No images or videos found
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
