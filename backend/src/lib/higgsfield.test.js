import { describe, it, expect, vi, beforeEach } from 'vitest';
import HiggsFieldClient from './higgsfield.js';

describe('HiggsFieldClient', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with valid credentials', () => {
      client = new HiggsFieldClient('test-key', 'test-workspace');
      expect(client.enabled).toBe(true);
      expect(client.apiKey).toBe('test-key');
      expect(client.workspaceId).toBe('test-workspace');
    });

    it('should disable without credentials', () => {
      client = new HiggsFieldClient(null, null);
      expect(client.enabled).toBe(false);
    });
  });

  describe('generateVideo', () => {
    beforeEach(() => {
      client = new HiggsFieldClient('test-key', 'test-workspace');
    });

    it('should throw error when disabled', async () => {
      const disabledClient = new HiggsFieldClient(null, null);
      await expect(disabledClient.generateVideo('test prompt')).rejects.toThrow(
        'Higgsfield not configured'
      );
    });

    it('should reject empty prompts', async () => {
      await expect(client.generateVideo('')).rejects.toThrow();
    });

    it('should use default options', async () => {
      // Mock the API request
      client._apiRequest = vi.fn().mockResolvedValue({
        job_id: 'job-123',
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      const result = await client.generateVideo('test prompt');

      expect(result.job_id).toBe('job-123');
      expect(result.status).toBe('pending');
      expect(client._apiRequest).toHaveBeenCalled();

      const callArgs = client._apiRequest.mock.calls[0];
      expect(callArgs[1].body.prompt).toBe('test prompt');
      expect(callArgs[1].body.duration).toBeDefined();
      expect(callArgs[1].body.model).toBeDefined();
    });
  });

  describe('getJobStatus', () => {
    beforeEach(() => {
      client = new HiggsFieldClient('test-key', 'test-workspace');
      client._apiRequest = vi.fn();
    });

    it('should fetch job status', async () => {
      client._apiRequest.mockResolvedValue({
        status: 'completed',
        output_url: 'https://example.com/video.mp4',
        progress: 100,
      });

      const result = await client.getJobStatus('job-123');

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://example.com/video.mp4');
      expect(result.progress).toBe(100);
    });

    it('should throw when disabled', async () => {
      const disabledClient = new HiggsFieldClient(null, null);
      await expect(disabledClient.getJobStatus('job-123')).rejects.toThrow();
    });
  });

  describe('listVideoModels', () => {
    beforeEach(() => {
      client = new HiggsFieldClient('test-key', 'test-workspace');
      client._apiRequest = vi.fn();
    });

    it('should return empty array when disabled', async () => {
      const disabledClient = new HiggsFieldClient(null, null);
      const models = await disabledClient.listVideoModels();
      expect(models).toEqual([]);
    });

    it('should fetch available models', async () => {
      const mockModels = [
        { id: 'model-1', name: 'Muses 2' },
        { id: 'model-2', name: 'Kling' },
      ];

      client._apiRequest.mockResolvedValue({ models: mockModels });

      const result = await client.listVideoModels();

      expect(result).toEqual(mockModels);
    });
  });

  describe('isHealthy', () => {
    it('should return false when disabled', async () => {
      const disabledClient = new HiggsFieldClient(null, null);
      const healthy = await disabledClient.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should check API health', async () => {
      client = new HiggsFieldClient('test-key', 'test-workspace');
      client._apiRequest = vi.fn().mockResolvedValue({ status: 'ok' });

      const healthy = await client.isHealthy();

      expect(healthy).toBe(true);
      expect(client._apiRequest).toHaveBeenCalledWith('/v1/health', { method: 'GET' });
    });

    it('should return false on error', async () => {
      client = new HiggsFieldClient('test-key', 'test-workspace');
      client._apiRequest = vi.fn().mockRejectedValue(new Error('API error'));

      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });
  });
});
