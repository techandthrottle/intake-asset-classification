import { Download, Image as ImageIcon, Video, FileX, Loader2, AlertTriangle, Info, FileSpreadsheet, XCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatFileSize } from '../lib/utils';
import { useState, useMemo } from 'react'; // Import useMemo
import * as XLSX from 'xlsx';

// Define the interfaces here or import them from a shared types file
interface ClassificationResult {
  success: boolean;
  id: string;
  name?: string;
  mimeType?: string;
  classification?: string;
  description?: string;
  error?: string;
  diagnostics?: {
    modelUsed?: string;
    processingMethod?: 'image_direct' | 'video_frames' | 'gcs_registration';
    framesExtracted?: number;
    gcsUri?: string;
  };
}

interface ClassificationQueueItem extends ClassificationResult {
    processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
    size?: string; // Add size here to be available for display and export
}

interface ClassificationProgress {
  total: number;
  completed: number;
  failed: number;
  isProcessing: boolean;
}

interface ResultsTableProps {
  queueItems: ClassificationQueueItem[];
  onClear: () => void;
  onRetryFailed: () => void;
  classificationProgress?: ClassificationProgress;
}

function ClassificationBadge({ classification, type }: { classification: string; type: 'image' | 'video' }) {
  const colorMap = {
    image: {
      landscape: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      portrait: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      square: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      'a-roll': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'screenshot': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      'logo': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      'photo': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
      'graphic': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
      'diagram': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
      'text': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      'other': 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300',
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

function DescriptionCell({ description, diagnostics, error }: { description?: string; diagnostics?: ClassificationResult['diagnostics']; error?: string }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const shouldTruncate = description && description.length > 100;
  const displayText = shouldTruncate && !showDiagnostics
    ? `${description?.substring(0, 100)}...`
    : description;

  const hasDiagnostics = diagnostics && (diagnostics.modelUsed || diagnostics.processingMethod || diagnostics.framesExtracted || diagnostics.gcsUri);

  return (
    <div className="space-y-1">
      {description && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {displayText}
          {shouldTruncate && (
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="ml-2 text-primary-600 dark:text-primary-400 hover:underline text-xs"
            >
              {showDiagnostics ? 'Show Less' : 'Show More'}
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-1 text-xs text-error-600 dark:text-error-400">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>Error: {error}</span>
        </div>
      )}
      {hasDiagnostics && (
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <Info className="w-3 h-3" />
          {showDiagnostics ? 'Hide' : 'Show'} diagnostics
        </button>
      )}
      {showDiagnostics && hasDiagnostics && (
        <div className="mt-2 p-2 bg-neutral-50 dark:bg-neutral-800/50 rounded text-xs space-y-1">
          {diagnostics?.processingMethod && <div><span className="font-medium">Method:</span> {diagnostics.processingMethod}</div>}
          {diagnostics?.modelUsed && <div><span className="font-medium">Model:</span> {diagnostics.modelUsed}</div>}
          {typeof diagnostics?.framesExtracted === 'number' && <div><span className="font-medium">Frames:</span> {diagnostics.framesExtracted}</div>}
          {diagnostics?.gcsUri && <div><span className="font-medium">GCS URI:</span> {diagnostics.gcsUri}</div>}
        </div>
      )}
    </div>
  );
}

export function ResultsTable({ queueItems, onClear, onRetryFailed, classificationProgress }: ResultsTableProps) {
  const [selectedClassificationFilter, setSelectedClassificationFilter] = useState<string>('all');

  const handleExportToExcel = () => {
    const worksheetData = queueItems.map(item => ({
      'File ID': item.id,
      'Filename': item.name || 'N/A',
      'Type': item.mimeType || 'N/A',
      'File Size': item.size ? formatFileSize(parseInt(item.size)) : 'N/A',
      'Classification': item.classification || 'Not classified',
      'Description': item.description || 'No description',
      'Generated Download Link': item.diagnostics?.gcsUri || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);

    const columnWidths = [
      { wch: 30 }, // File ID
      { wch: 40 }, // Filename
      { wch: 15 }, // Type
      { wch: 15 }, // File Size
      { wch: 20 }, // Classification
      { wch: 60 }, // Description
      { wch: 40 }, // Generated Download Link
    ];
    worksheet['!cols'] = columnWidths;


    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asset Classification');

    XLSX.writeFile(workbook, `asset-classification-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const uniqueClassifications = useMemo(() => {
    const classifications = new Set<string>();
    queueItems.forEach(item => {
      if (item.classification) {
        classifications.add(item.classification);
      }
    });
    return ['all', ...Array.from(classifications).sort()];
  }, [queueItems]);

  const filteredQueueItems = useMemo(() => {
    if (selectedClassificationFilter === 'all') {
      return queueItems;
    }
    return queueItems.filter(item => item.classification === selectedClassificationFilter);
  }, [queueItems, selectedClassificationFilter]);


  if (queueItems.length === 0 && !classificationProgress?.isProcessing) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-8 p-8 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
        <FileX className="w-12 h-12 text-neutral-400 dark:text-neutral-500 mx-auto mb-3" />
        <p className="text-neutral-600 dark:text-neutral-400 font-medium">
          No files processed yet.
        </p>
        <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
          Enter a Google Drive link above to start classification.
        </p>
      </div>
    );
  }

  const images = queueItems.filter(f => f.mimeType?.startsWith('image/'));
  const videos = queueItems.filter(f => f.mimeType?.startsWith('video/'));
  const totalProcessed = queueItems.length;

  return (
    <div className="w-full max-w-[1600px] mx-auto mt-8 space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Classification Results
          </h3>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {totalProcessed} file{totalProcessed !== 1 ? 's' : ''} processed
              {images.length > 0 && ` • ${images.length} image${images.length !== 1 ? 's' : ''}`}
              {videos.length > 0 && ` • ${videos.length} video${videos.length !== 1 ? 's' : ''}`}
            </p>
            {classificationProgress && classificationProgress.isProcessing && (
              <div className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </div>
            )}
            {classificationProgress && !classificationProgress.isProcessing && classificationProgress.completed > 0 && (
              <span className="text-sm text-success-600 dark:text-success-400">
                ✓ {classificationProgress.completed} classified
              </span>
            )}
            {classificationProgress && !classificationProgress.isProcessing && classificationProgress.failed > 0 && (
              <span className="text-sm text-error-600 dark:text-error-400">
                ✗ {classificationProgress.failed} failed
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

      {/* Classification Filter Dropdown */}
      <div className="flex items-center gap-2 mb-4">
        <label htmlFor="classification-filter" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Filter by Classification:
        </label>
        <select
          id="classification-filter"
          value={selectedClassificationFilter}
          onChange={(e) => setSelectedClassificationFilter(e.target.value)}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {uniqueClassifications.map(classification => (
            <option key={classification} value={classification}>
              {classification === 'all' ? 'All Classifications' : classification}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  File Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Classification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Download Link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {filteredQueueItems.map((item, index) => ( // Use filteredQueueItems here
                <tr
                  key={item.id}
                  className={`transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
                    index % 2 === 0 ? '' : 'bg-neutral-25 dark:bg-neutral-900/50'
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate max-w-xs">
                      {item.name || 'N/A'}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">ID: {item.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.mimeType && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                        {item.mimeType.startsWith('image/') ? (
                          <>
                            <ImageIcon className="w-3 h-3" />
                            Image
                          </>
                        ) : item.mimeType.startsWith('video/') ? (
                          <>
                            <Video className="w-3 h-3" />
                            Video
                          </>
                        ) : (
                          <FileX className="w-3 h-3" />
                        )}
                        {item.mimeType}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">
                    {item.size ? formatFileSize(parseInt(item.size)) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.processingStatus === 'processing' && (
                        <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                            <span className="text-sm text-primary-600 dark:text-primary-400">Processing</span>
                        </div>
                    )}
                    {item.processingStatus === 'completed' && (
                        <div className="flex items-center gap-1 text-success-600 dark:text-success-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm">Completed</span>
                        </div>
                    )}
                    {item.processingStatus === 'failed' && (
                        <div className="flex items-center gap-1 text-error-600 dark:text-error-400">
                            <XCircle className="w-4 h-4" />
                            <span className="text-sm">Failed</span>
                        </div>
                    )}
                    {item.processingStatus === 'pending' && (
                        <span className="text-sm text-neutral-400">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.classification && (
                      <ClassificationBadge
                        classification={item.classification}
                        type={item.mimeType?.startsWith('image/') ? 'image' : 'video'}
                      />
                    )}
                    {!item.classification && item.processingStatus === 'completed' && (
                      <span className="text-xs text-neutral-500">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 max-w-md">
                    <DescriptionCell description={item.description} diagnostics={item.diagnostics} error={item.error} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">
                    {item.diagnostics?.gcsUri ? (
                      <a href={item.diagnostics.gcsUri} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline truncate block max-w-xs"
                        title={item.diagnostics.gcsUri}>
                        GCS Link
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-500">N/A</span>
                    )}
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
