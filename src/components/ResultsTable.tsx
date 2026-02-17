import { Download, Image as ImageIcon, Video, FileX, RefreshCw, Loader2, AlertTriangle, Info, FileSpreadsheet } from 'lucide-react';
import { ExtractedFile } from '../lib/supabase';
import { formatFileSize } from '../lib/utils';
import { useState } from 'react';
import * as XLSX from 'xlsx';

interface ResultsTableProps {
  files: ExtractedFile[];
  onClear: () => void;
  onRetryFailed?: () => void;
  classificationProgress?: {
    total: number;
    completed: number;
    failed: number;
    isProcessing: boolean;
  };
}

function ClassificationBadge({ classification, type }: { classification: string; type: 'image' | 'video' }) {
  const colorMap = {
    image: {
      landscape: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      portrait: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      square: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    },
    video: {
      'a-roll': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'b-roll': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      'animation': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      'screen-recording': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
      'montage': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      'other': 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300',
    },
  };

  const colorClass = colorMap[type][classification as keyof typeof colorMap[typeof type]] ||
    'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {classification}
    </span>
  );
}

function DescriptionCell({ description, diagnostics }: { description: string; diagnostics?: ExtractedFile['diagnostics'] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const shouldTruncate = description.length > 100;
  const displayText = shouldTruncate && !isExpanded
    ? `${description.substring(0, 100)}...`
    : description;

  const showWarning = diagnostics && !diagnostics.usedVisualContent;

  return (
    <div className="space-y-1">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        {displayText}
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-2 text-primary-600 dark:text-primary-400 hover:underline text-xs"
          >
            {isExpanded ? 'Show Less' : 'Show More'}
          </button>
        )}
      </div>
      {showWarning && (
        <div className="flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>Based on filename only (content download failed)</span>
        </div>
      )}
      {diagnostics && (
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <Info className="w-3 h-3" />
          {showDiagnostics ? 'Hide' : 'Show'} diagnostics
        </button>
      )}
      {showDiagnostics && diagnostics && (
        <div className="mt-2 p-2 bg-neutral-50 dark:bg-neutral-800/50 rounded text-xs space-y-1">
          <div><span className="font-medium">Download:</span> {diagnostics.downloadSuccess ? '✓ Success' : '✗ Failed'}</div>
          {diagnostics.contentType && <div><span className="font-medium">Content-Type:</span> {diagnostics.contentType}</div>}
          {diagnostics.fileSize && <div><span className="font-medium">File Size:</span> {(diagnostics.fileSize / 1024).toFixed(1)} KB</div>}
          <div><span className="font-medium">Visual Analysis:</span> {diagnostics.usedVisualContent ? 'Yes' : 'No'}</div>
          <div><span className="font-medium">Model:</span> {diagnostics.modelUsed}</div>
        </div>
      )}
    </div>
  );
}

export function ResultsTable({ files, onClear, onRetryFailed, classificationProgress }: ResultsTableProps) {
  const handleExportToExcel = () => {
    const worksheetData = files.map(file => ({
      'Preview URL': file.thumbnailLink || '',
      'Filename': file.name,
      'Type': file.mimeType.startsWith('image/') ? 'Image' : 'Video',
      'Classification': file.classification || 'Not classified',
      'Description': file.description || 'No description',
      'Size': formatFileSize(file.size),
      'Download Link': file.downloadUrl
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);

    const columnWidths = [
      { wch: 60 },
      { wch: 40 },
      { wch: 10 },
      { wch: 20 },
      { wch: 60 },
      { wch: 12 },
      { wch: 60 }
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asset Classification');

    XLSX.writeFile(workbook, `asset-classification-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (files.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-8 p-8 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
        <FileX className="w-12 h-12 text-neutral-400 dark:text-neutral-500 mx-auto mb-3" />
        <p className="text-neutral-600 dark:text-neutral-400 font-medium">
          No images or videos found
        </p>
        <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
          The provided link does not contain any media files
        </p>
        <button
          onClick={onClear}
          className="mt-4 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
        >
          Try Another Link
        </button>
      </div>
    );
  }

  const images = files.filter(f => f.mimeType.startsWith('image/'));
  const videos = files.filter(f => f.mimeType.startsWith('video/'));

  return (
    <div className="w-full max-w-[1600px] mx-auto mt-8 space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Extracted Files
          </h3>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {files.length} file{files.length !== 1 ? 's' : ''} found
              {images.length > 0 && ` • ${images.length} image${images.length !== 1 ? 's' : ''}`}
              {videos.length > 0 && ` • ${videos.length} video${videos.length !== 1 ? 's' : ''}`}
            </p>
            {classificationProgress && classificationProgress.isProcessing && (
              <div className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Classifying {classificationProgress.completed} of {classificationProgress.total}</span>
              </div>
            )}
            {classificationProgress && !classificationProgress.isProcessing && classificationProgress.completed > 0 && (
              <span className="text-sm text-success-600 dark:text-success-400">
                ✓ {classificationProgress.completed} classified
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {classificationProgress && classificationProgress.failed > 0 && !classificationProgress.isProcessing && onRetryFailed && (
            <button
              onClick={onRetryFailed}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry {classificationProgress.failed} Failed
            </button>
          )}
          <button
            onClick={handleExportToExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-success-600 dark:text-success-400 hover:text-success-700 dark:hover:text-success-300 transition-colors border border-success-600 dark:border-success-400 rounded-lg hover:bg-success-50 dark:hover:bg-success-950"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export to Excel
          </button>
          <button
            onClick={onClear}
            className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            Clear Results
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Preview
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  File Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Classification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Download Link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {files.map((file, index) => (
                <tr
                  key={file.id}
                  className={`transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
                    index % 2 === 0 ? '' : 'bg-neutral-25 dark:bg-neutral-900/50'
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden flex items-center justify-center">
                      {file.thumbnailLink ? (
                        <img
                          src={file.thumbnailLink}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : file.mimeType.startsWith('image/') ? (
                        <ImageIcon className="w-6 h-6 text-neutral-400" />
                      ) : (
                        <Video className="w-6 h-6 text-neutral-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate max-w-xs">
                      {file.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                      {file.mimeType.startsWith('image/') ? (
                        <>
                          <ImageIcon className="w-3 h-3" />
                          Image
                        </>
                      ) : (
                        <>
                          <Video className="w-3 h-3" />
                          Video
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {file.classificationStatus === 'classifying' && (
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-20 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                        <Loader2 className="w-3 h-3 text-neutral-400 animate-spin" />
                      </div>
                    )}
                    {file.classificationStatus === 'completed' && file.classification && (
                      <ClassificationBadge
                        classification={file.classification}
                        type={file.mimeType.startsWith('image/') ? 'image' : 'video'}
                      />
                    )}
                    {file.classificationStatus === 'failed' && (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-error-600 dark:text-error-400" />
                        <span className="text-xs text-error-600 dark:text-error-400">Failed</span>
                      </div>
                    )}
                    {(!file.classificationStatus || file.classificationStatus === 'pending') && (
                      <span className="text-xs text-neutral-400">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4 max-w-md">
                    {file.classificationStatus === 'classifying' && (
                      <div className="space-y-2">
                        <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse w-full" />
                        <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse w-3/4" />
                      </div>
                    )}
                    {file.classificationStatus === 'completed' && file.description && (
                      <DescriptionCell description={file.description} diagnostics={file.diagnostics} />
                    )}
                    {file.classificationStatus === 'failed' && (
                      <div className="space-y-1">
                        <div className="flex items-start gap-1 text-xs text-error-600 dark:text-error-400">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span className="font-medium">Classification failed</span>
                        </div>
                        {file.error && (
                          <p className="text-xs text-neutral-600 dark:text-neutral-400 pl-4">
                            {file.error}
                          </p>
                        )}
                        {file.diagnostics && (
                          <div className="mt-2 p-2 bg-neutral-50 dark:bg-neutral-800/50 rounded text-xs space-y-1">
                            <div><span className="font-medium">Download:</span> {file.diagnostics.downloadSuccess ? '✓ Success' : '✗ Failed'}</div>
                            {file.diagnostics.contentType && <div><span className="font-medium">Content-Type:</span> {file.diagnostics.contentType}</div>}
                            {file.diagnostics.fileSize && <div><span className="font-medium">File Size:</span> {(file.diagnostics.fileSize / 1024).toFixed(1)} KB</div>}
                            <div><span className="font-medium">Visual Analysis:</span> {file.diagnostics.usedVisualContent ? 'Yes' : 'No'}</div>
                            <div><span className="font-medium">Model:</span> {file.diagnostics.modelUsed}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {(!file.classificationStatus || file.classificationStatus === 'pending') && (
                      <span className="text-xs text-neutral-400">Waiting...</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">
                    {formatFileSize(file.size)}
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline truncate block max-w-xs"
                      title={file.downloadUrl}
                    >
                      {file.downloadUrl}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
