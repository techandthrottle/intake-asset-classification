import { useState, useCallback, useRef } from 'react';
import { ExtractedFile } from '../lib/supabase';
import { classifyAssetWithRetry } from '../lib/classifyAssets';

interface ClassificationProgress {
  total: number;
  completed: number;
  failed: number;
  isProcessing: boolean;
}

export function useClassificationQueue(
  firebaseProjectId: string,
  firebaseRegion: string,
  concurrentLimit: number = 5
) {
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [progress, setProgress] = useState<ClassificationProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    isProcessing: false,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateFileStatus = useCallback((
    fileId: string,
    updates: Partial<ExtractedFile>
  ) => {
    setFiles(prevFiles =>
      prevFiles.map(file =>
        file.id === fileId ? { ...file, ...updates } : file
      )
    );
  }, []);

  const processFilesInBatches = useCallback(async (
    filesToProcess: ExtractedFile[]
  ) => {
    const queue = [...filesToProcess];
    let completedCount = 0;
    let failedCount = 0;

    while (queue.length > 0 && !abortControllerRef.current?.signal.aborted) {
      const batch = queue.splice(0, concurrentLimit);

      const promises = batch.map(async (file) => {
        updateFileStatus(file.id, { classificationStatus: 'classifying' });

        const result = await classifyAssetWithRetry(
          file,
          firebaseProjectId,
          firebaseRegion
        );

        if (result.success) {
          updateFileStatus(file.id, {
            classification: result.classification,
            description: result.description,
            classificationStatus: 'completed',
            diagnostics: result.diagnostics,
            error: undefined,
          });
          completedCount++;
        } else {
          updateFileStatus(file.id, {
            classificationStatus: 'failed',
            diagnostics: result.diagnostics,
            error: result.error,
          });
          failedCount++;
        }

        setProgress(prev => ({
          ...prev,
          completed: completedCount,
          failed: failedCount,
        }));
      });

      await Promise.allSettled(promises);
    }

    setProgress(prev => ({
      ...prev,
      isProcessing: false,
    }));
  }, [firebaseProjectId, firebaseRegion, concurrentLimit, updateFileStatus]);

  const startClassification = useCallback((filesToClassify: ExtractedFile[]) => {
    abortControllerRef.current = new AbortController();

    const initialFiles = filesToClassify.map(file => ({
      ...file,
      classificationStatus: 'pending' as const,
    }));

    setFiles(initialFiles);
    setProgress({
      total: filesToClassify.length,
      completed: 0,
      failed: 0,
      isProcessing: true,
    });

    processFilesInBatches(initialFiles);
  }, [processFilesInBatches]);

  const retryFailed = useCallback(() => {
    const failedFiles = files.filter(
      file => file.classificationStatus === 'failed'
    );

    if (failedFiles.length === 0) return;

    abortControllerRef.current = new AbortController();

    setProgress(prev => ({
      ...prev,
      failed: 0,
      isProcessing: true,
    }));

    processFilesInBatches(failedFiles);
  }, [files, processFilesInBatches]);

  const stopClassification = useCallback(() => {
    abortControllerRef.current?.abort();
    setProgress(prev => ({
      ...prev,
      isProcessing: false,
    }));
  }, []);

  const clearQueue = useCallback(() => {
    abortControllerRef.current?.abort();
    setFiles([]);
    setProgress({
      total: 0,
      completed: 0,
      failed: 0,
      isProcessing: false,
    });
  }, []);

  return {
    files,
    progress,
    startClassification,
    retryFailed,
    stopClassification,
    clearQueue,
  };
}
