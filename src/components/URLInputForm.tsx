import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Link2 } from 'lucide-react';
import { isValidUrl } from '../lib/validations';
import { isGoogleDriveUrl } from '../lib/utils';
import { ResultsTable } from './ResultsTable';
import { useClassificationQueue } from '../hooks/useClassificationQueue';

export function URLInputForm() {
  const [url, setUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [error, setError] = useState('');
  const [showResults, setShowResults] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const firebaseRegion = import.meta.env.VITE_FIREBASE_REGION;

  const {
    files: classifiedFiles,
    progress,
    startClassification,
    retryFailed,
    clearQueue,
  } = useClassificationQueue(firebaseProjectId, firebaseRegion);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setValidationStatus('idle');
    setError('');

    if (value.trim()) {
      setIsValidating(true);
      setTimeout(() => {
        const isValid = isValidUrl(value.trim());
        setValidationStatus(isValid ? 'valid' : 'invalid');
        setIsValidating(false);
      }, 300);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    if (!isValidUrl(url.trim())) {
      setError('Please enter a valid URL');
      return;
    }

    const trimmedUrl = url.trim();
    const isGoogleDrive = isGoogleDriveUrl(trimmedUrl);

    if (!isGoogleDrive) {
      setError('Please enter a Google Drive URL (folder or file link)');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setShowResults(false);

    try {
      const apiUrl = `https://${firebaseRegion}-${firebaseProjectId}.cloudfunctions.net/processGoogleDrive`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to extract files');
      }

      const extractedFiles = result.files || [];

      if (extractedFiles.length > 0) {
        startClassification(extractedFiles);
      }

      setShowResults(true);
      setUrl('');
      setValidationStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process URL');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearResults = () => {
    setShowResults(false);
    clearQueue();
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">
        <div className="space-y-2">
          <label htmlFor="url" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Website URL
          </label>
          <div className="relative">
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 pr-12 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={isSubmitting}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isValidating && <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />}
              {!isValidating && validationStatus === 'valid' && (
                <CheckCircle2 className="w-5 h-5 text-success-500" />
              )}
              {!isValidating && validationStatus === 'invalid' && (
                <XCircle className="w-5 h-5 text-error-500" />
              )}
            </div>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Enter a valid URL starting with http:// or https://
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-sm text-error-600 dark:text-error-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || validationStatus !== 'valid'}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg font-medium shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-500"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Extracting Files...
            </>
          ) : (
            <>
              <Link2 className="w-5 h-5" />
              Extract Files
            </>
          )}
        </button>
      </form>

      {showResults && (
        <ResultsTable
          files={classifiedFiles}
          onClear={handleClearResults}
          onRetryFailed={retryFailed}
          classificationProgress={progress}
        />
      )}
    </>
  );
}
