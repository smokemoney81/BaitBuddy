import React, { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { useVideoGeneration } from '../../hooks/useVideoGeneration';

export function VideoGenerator({ prompt, onVideoReady }) {
  const { generateVideo, checkStatus, isLoading, error } = useVideoGeneration();
  const [job, setJob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [pollInterval, setPollInterval] = useState(null);

  // Start video generation when prompt changes
  useEffect(() => {
    if (prompt && !job) {
      handleGenerateVideo();
    }
  }, [prompt]);

  // Poll job status every 3 seconds
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      const status = await checkStatus(job.job_id);
      if (status) {
        setJob(status);
        setStatusMessage(getStatusMessage(status.status, status.progress));

        if (status.status === 'completed' && status.url) {
          setVideoUrl(status.url);
          onVideoReady?.(status.url);
          clearInterval(interval);
        } else if (status.status === 'failed') {
          setStatusMessage(`Video generation failed: ${status.error || 'Unknown error'}`);
          clearInterval(interval);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [job, checkStatus, onVideoReady]);

  async function handleGenerateVideo() {
    if (!prompt) return;

    const newJob = await generateVideo(prompt, {
      duration: 8,
      style: 'tutorial',
      language: 'de',
    });

    if (newJob) {
      setJob(newJob);
      setStatusMessage('Starting video generation...');
    }
  }

  function getStatusMessage(status, progress) {
    switch (status) {
      case 'pending':
        return 'Queued...';
      case 'processing':
        return `Generating... ${progress ? Math.round(progress) + '%' : ''}`;
      case 'completed':
        return 'Video ready!';
      case 'failed':
        return 'Generation failed';
      default:
        return 'Processing...';
    }
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 text-sm font-medium">Error</p>
        <p className="text-red-700 text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-gray-600 text-sm">Ready to generate video</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {videoUrl && (
        <div className="rounded-lg overflow-hidden bg-black">
          <video
            src={videoUrl}
            controls
            className="w-full"
            playsInline
          />
        </div>
      )}

      {!videoUrl && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2">
            <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-blue-800 text-sm font-medium">{statusMessage}</span>
          </div>
          {job.status === 'processing' && job.progress && (
            <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {job.status === 'failed' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm font-medium">Generation Failed</p>
          <button
            onClick={handleGenerateVideo}
            className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

export default VideoGenerator;
