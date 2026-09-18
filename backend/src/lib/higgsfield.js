/**
 * Higgsfield AI Video & Content Generation API Client
 * https://higgsfield.io
 */

import fetch from 'node-fetch';
import logger from './logger.js';

const BASE_URL = 'https://api.higgsfield.io';

class HiggsFieldClient {
  constructor(apiKey, workspaceId) {
    if (!apiKey || !workspaceId) {
      logger.warn('Higgsfield: API Key or Workspace ID not configured. Video generation disabled.');
      this.enabled = false;
      return;
    }
    this.apiKey = apiKey;
    this.workspaceId = workspaceId;
    this.enabled = true;
  }

  /**
   * Generate a video from a prompt
   * @param {string} prompt - Text prompt describing the video
   * @param {object} options - Generation options
   * @returns {Promise<{job_id: string, status: string}>}
   */
  async generateVideo(prompt, options = {}) {
    if (!this.enabled) {
      throw new Error('Higgsfield not configured. Set HIGGSFIELD_API_KEY and HIGGSFIELD_WORKSPACE_ID.');
    }

    const {
      model = process.env.HIGGSFIELD_VIDEO_MODEL || 'muses-2-v1.0',
      duration = 8,
      style = 'cinematic',
      language = 'de',
      ...restOptions
    } = options;

    try {
      const response = await this._apiRequest('/v1/video/generate', {
        method: 'POST',
        body: {
          workspace_id: this.workspaceId,
          model,
          prompt,
          duration,
          style,
          language,
          ...restOptions,
        },
      });

      logger.debug(`Higgsfield: Video generation job created: ${response.job_id}`);
      return {
        job_id: response.job_id,
        status: response.status || 'pending',
        created_at: response.created_at,
      };
    } catch (error) {
      logger.error(`Higgsfield video generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check job status and get video URL when complete
   * @param {string} jobId - Job ID from generateVideo
   * @returns {Promise<{status: string, url?: string, progress?: number}>}
   */
  async getJobStatus(jobId) {
    if (!this.enabled) {
      throw new Error('Higgsfield not configured');
    }

    try {
      const response = await this._apiRequest(`/v1/video/jobs/${jobId}`, {
        method: 'GET',
      });

      return {
        status: response.status,
        url: response.output_url,
        progress: response.progress,
        error: response.error,
      };
    } catch (error) {
      logger.error(`Higgsfield: Failed to get job status ${jobId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * List available video models
   * @returns {Promise<Array>}
   */
  async listVideoModels() {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this._apiRequest('/v1/models/video', {
        method: 'GET',
      });

      return response.models || [];
    } catch (error) {
      logger.error(`Higgsfield: Failed to list models: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate speech from text (TTS)
   * @param {string} text - Text to convert to speech
   * @param {object} options - TTS options
   * @returns {Promise<{url: string}>}
   */
  async generateSpeech(text, options = {}) {
    if (!this.enabled) {
      throw new Error('Higgsfield not configured');
    }

    const {
      voice = 'Daniel',
      language = 'de',
      speed = 1.0,
      ...restOptions
    } = options;

    try {
      const response = await this._apiRequest('/v1/audio/tts', {
        method: 'POST',
        body: {
          workspace_id: this.workspaceId,
          text,
          voice,
          language,
          speed,
          ...restOptions,
        },
      });

      return {
        url: response.audio_url,
        duration: response.duration,
      };
    } catch (error) {
      logger.error(`Higgsfield TTS failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Internal API request helper
   * @private
   */
  async _apiRequest(endpoint, { method = 'GET', body = null }) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'BaitBuddy/1.0',
    };

    const options = {
      method,
      headers,
      timeout: 30000,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(`Higgsfield API error (${endpoint}): ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if Higgsfield is configured and accessible
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    if (!this.enabled) return false;

    try {
      await this._apiRequest('/v1/health', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }
}

export function getHiggsFieldClient() {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const workspaceId = process.env.HIGGSFIELD_WORKSPACE_ID;
  return new HiggsFieldClient(apiKey, workspaceId);
}

export default HiggsFieldClient;
