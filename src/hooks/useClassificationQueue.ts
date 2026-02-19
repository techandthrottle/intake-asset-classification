import { useState, useCallback, useRef } from 'react';
import { discoverGoogleDriveFiles, classifySingleAsset, GoogleDriveFile, ClassificationResult } from '../lib/classifyAssets';

// Define the interfaces here or import them from a shared file if not already
export interface ClassificationQueueItem extends GoogleDriveFile { // Extends GoogleDriveFile for metadata
    processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
    classification?: string;
    description?: string;
    error?: string;
    diagnostics?: ClassificationResult['diagnostics'];
}

export interface ClassificationProgress {
  total: number;
  completed: number;
  failed: number;
  isProcessing: boolean;
}

export function useClassificationQueue(
  firebaseProjectId: string,
  firebaseRegion: string,
  concurrentLimit: number = 5 // Concurrency limit for individual file classification
) {
  const [queueItems, setQueueItems] = useState<ClassificationQueueItem[]>([]);
  const [progress, setProgress] = useState<ClassificationProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    isProcessing: false,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateQueueItemStatus = useCallback((
    fileId: string,
    updates: Partial<ClassificationQueueItem>
  ) => {
    setQueueItems(prevItems =>
      prevItems.map(item =>
        item.id === fileId ? { ...item, ...updates } : item
      )
    );
  }, []);

  // New function to process files individually
  const processSingleFile = useCallback(async (file: GoogleDriveFile) => {
    updateQueueItemStatus(file.id, { processingStatus: 'processing' });

    try {
      const result = await classifySingleAsset(file, firebaseProjectId, firebaseRegion);

      if (result.success) {
        updateQueueItemStatus(file.id, {
          classification: result.classification,
          description: result.description,
          processingStatus: 'completed',
          diagnostics: result.diagnostics,
          error: undefined,
        });
        setProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
      } else {
        updateQueueItemStatus(file.id, {
          processingStatus: 'failed',
          diagnostics: result.diagnostics,
          error: result.error,
        });
        setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
    } catch (error) {
      console.error(`[Frontend Hook] Error processing file ${file.name}:`, error);
      updateQueueItemStatus(file.id, {
        processingStatus: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
    }
  }, [firebaseProjectId, firebaseRegion, updateQueueItemStatus]);


  const startClassification = useCallback(async (googleDriveUrl: string) => {
    abortControllerRef.current = new AbortController();

    setProgress({
      total: 0,
      completed: 0,
      failed: 0,
      isProcessing: true,
    });
    setQueueItems([]); // Clear previous results

    try {
      // Step 1: Discover files using the new backend discovery function
      const discoveryResponse = await discoverGoogleDriveFiles(
        googleDriveUrl,
        firebaseProjectId,
        firebaseRegion
      );

      if (!discoveryResponse.success) {
        throw new Error(discoveryResponse.error || discoveryResponse.message || 'Failed to discover files.');
      }

      const discoveredFiles = discoveryResponse.files;
      const initialQueueItems: ClassificationQueueItem[] = discoveredFiles.map(file => ({
          ...file,
          processingStatus: 'pending',
      }));

      setQueueItems(initialQueueItems);
      setProgress(prev => ({
          ...prev,
          total: discoveredFiles.length,
      }));

      console.log(`[Frontend Hook] Discovered ${discoveredFiles.length} files. Starting classification queue.`);

      // Step 2: Process files in batches (the queue logic)
      let currentConcurrency = 0;
      let fileIndex = 0;

      const processNext = async () => {
          if (abortControllerRef.current?.signal.aborted) return;
          if (fileIndex >= initialQueueItems.length) return;

          const fileToProcess = initialQueueItems[fileIndex];
          fileIndex++;

          currentConcurrency++;
          await processSingleFile(fileToProcess);
          currentConcurrency--;

          if (fileIndex < initialQueueItems.length) {
              processNext(); // Schedule the next one if available
          } else if (currentConcurrency === 0) {
              // All processing complete
              setProgress(prev => ({ ...prev, isProcessing: false }));
              console.log("[Frontend Hook] All files in queue processed.");
          }
      };

      // Start initial batch
      for (let i = 0; i < concurrentLimit && i < initialQueueItems.length; i++) {
          processNext();
      }

    } catch (error) {
      console.error("[Frontend Hook] Error during file discovery or initial queue setup:", error);
      setQueueItems([{
          id: 'N/A',
          name: googleDriveUrl,
          mimeType: 'text/plain', // Placeholder
          size: '0',
          processingStatus: 'failed',
          success: false,
          error: error instanceof Error ? error.message : String(error),
      }]);
      setProgress(prev => ({
          ...prev,
          total: 0,
          completed: 0,
          failed: 1,
          isProcessing: false,
      }));
    } finally {
      // isProcessing is set to false by the processNext logic once all done
    }
  }, [firebaseProjectId, firebaseRegion, concurrentLimit, processSingleFile, updateQueueItemStatus]);


  const retryFailed = useCallback(async () => {
    const failedItems = queueItems.filter(item => item.processingStatus === 'failed');
    if (failedItems.length === 0) return;

    abortControllerRef.current = new AbortController();

    setProgress(prev => ({
        ...prev,
        failed: 0, // Reset failed count for retries
        isProcessing: true,
    }));

    // Re-add failed items to queue as pending
    setQueueItems(prevItems => prevItems.map(item => 
        item.processingStatus === 'failed' ? { ...item, processingStatus: 'pending', error: undefined, classification: undefined, description: undefined, diagnostics: undefined } : item
    ));

    console.log(`[Frontend Hook] Retrying ${failedItems.length} failed items.`);

    let currentConcurrency = 0;
    let fileIndex = 0;
    const itemsToRetry = failedItems.map(item => ({ ...item, processingStatus: 'pending' as const }));

    const processNextRetry = async () => {
        if (abortControllerRef.current?.signal.aborted) return;
        if (fileIndex >= itemsToRetry.length) return;

        const fileToProcess = itemsToRetry[fileIndex];
        fileIndex++;

        currentConcurrency++;
        await processSingleFile(fileToProcess);
        currentConcurrency--;

        if (fileIndex < itemsToRetry.length) {
            processNextRetry();
        } else if (currentConcurrency === 0) {
            setProgress(prev => ({ ...prev, isProcessing: false }));
            console.log("[Frontend Hook] All retried files processed.");
        }
    };

    for (let i = 0; i < concurrentLimit && i < itemsToRetry.length; i++) {
        processNextRetry();
    }

  }, [queueItems, firebaseProjectId, firebaseRegion, concurrentLimit, processSingleFile, updateQueueItemStatus]);


  const stopClassification = useCallback(() => {
    abortControllerRef.current?.abort();
    setProgress(prev => ({
      ...prev,
      isProcessing: false,
    }));
    console.log("[Frontend Hook] Processing stopped by user.");
  }, []);

  const clearQueue = useCallback(() => {
    abortControllerRef.current?.abort();
    setQueueItems([]);
    setProgress({
      total: 0,
      completed: 0,
      failed: 0,
      isProcessing: false,
    });
    console.log("[Frontend Hook] Queue cleared.");
  }, []);

  return {
    queueItems,
    progress,
    startClassification,
    retryFailed, // retryFailed is now returned again
    stopClassification,
    clearQueue,
  };
}
