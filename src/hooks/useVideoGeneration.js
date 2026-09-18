import { useState, useCallback } from 'react';
import { useApi } from './useApi';

/**
 * Hook for generating videos via Higgsfield
 * Usage:
 *   const { generateVideo, checkStatus, isLoading, error } = useVideoGeneration();
 *   const job = await generateVideo("Ein angelnd auf Forellen am Fluss");
 */
export function useVideoGeneration() {
  const { ai } = useApi();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState(new Map());

  const generateVideo = useCallback(
    async (prompt, options = {}) => {
      if (!prompt || prompt.trim().length === 0) {
        setError('Prompt is required');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await ai.post('/video/generate', {
          prompt: prompt.trim(),
          duration: options.duration || 8,
          style: options.style || 'cinematic',
          model: options.model,
          language: options.language || 'de',
        });

        const job = {
          job_id: response.job_id,
          status: response.status,
          prompt: response.prompt,
          created_at: response.created_at,
          checked_at: new Date(),
        };

        setJobs((prev) => new Map(prev).set(job.job_id, job));
        return job;
      } catch (err) {
        const message = err?.response?.data?.message || err.message || 'Video generation failed';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [ai]
  );

  const checkStatus = useCallback(
    async (jobId) => {
      if (!jobId) {
        setError('Job ID is required');
        return null;
      }

      try {
        const response = await ai.get(`/video/jobs/${jobId}`);

        const updatedJob = {
          job_id: jobId,
          status: response.status,
          url: response.url,
          progress: response.progress,
          error: response.error,
          checked_at: new Date(),
        };

        setJobs((prev) => new Map(prev).set(jobId, updatedJob));
        return updatedJob;
      } catch (err) {
        const message = err?.response?.data?.message || err.message || 'Failed to check status';
        setError(message);
        return null;
      }
    },
    [ai]
  );

  const listModels = useCallback(async () => {
    try {
      const response = await ai.get('/video/models');
      return response.models || [];
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Failed to list models';
      setError(message);
      return [];
    }
  }, [ai]);

  return {
    generateVideo,
    checkStatus,
    listModels,
    isLoading,
    error,
    jobs,
    clearError: () => setError(null),
  };
}
