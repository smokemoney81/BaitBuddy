/**
 * Video Generation Routes
 * POST /api/video/generate - Generate video from prompt
 * GET /api/video/jobs/:jobId - Check job status
 * GET /api/video/models - List available models
 */

import { Router } from 'express';
import { getHiggsFieldClient } from '../lib/higgsfield.js';
import { validateAuth } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();

/**
 * POST /api/video/generate
 * Generate a video from a text prompt
 *
 * Body:
 *   - prompt (string, required): Description of the video to generate
 *   - model (string, optional): Video model (default: configured model)
 *   - duration (number, optional): Video length in seconds (default: 8)
 *   - style (string, optional): Video style (cinematic, tutorial, etc.)
 *   - language (string, optional): Language code (default: de)
 */
router.post('/generate', validateAuth, async (req, res) => {
  try {
    const { prompt, model, duration, style, language } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (prompt.length > 5000) {
      return res.status(400).json({ error: 'Prompt is too long (max 5000 characters)' });
    }

    const client = getHiggsFieldClient();
    if (!client.enabled) {
      return res.status(501).json({
        error: 'Video generation not configured',
        message: 'Higgsfield credentials are missing',
      });
    }

    const jobId = req.user.id;
    const options = {};

    if (model) options.model = model;
    if (duration !== undefined) options.duration = Math.max(1, Math.min(60, duration));
    if (style) options.style = style;
    if (language) options.language = language;

    const result = await client.generateVideo(prompt, options);

    res.json({
      job_id: result.job_id,
      status: result.status,
      prompt,
      created_at: result.created_at,
    });
  } catch (error) {
    logger.error(`Video generation error: ${error.message}`);
    res.status(500).json({
      error: 'Video generation failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/video/jobs/:jobId
 * Check the status of a video generation job
 */
router.get('/jobs/:jobId', validateAuth, async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId || jobId.trim().length === 0) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const client = getHiggsFieldClient();
    if (!client.enabled) {
      return res.status(501).json({ error: 'Video generation not configured' });
    }

    const status = await client.getJobStatus(jobId);

    res.json({
      job_id: jobId,
      ...status,
    });
  } catch (error) {
    logger.error(`Failed to get job status: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error.message,
    });
  }
});

/**
 * GET /api/video/models
 * List available video generation models
 */
router.get('/models', validateAuth, async (req, res) => {
  try {
    const client = getHiggsFieldClient();

    if (!client.enabled) {
      return res.json({ models: [] });
    }

    const models = await client.listVideoModels();

    res.json({ models });
  } catch (error) {
    logger.error(`Failed to list video models: ${error.message}`);
    res.status(500).json({
      error: 'Failed to list models',
      message: error.message,
    });
  }
});

/**
 * GET /api/video/health
 * Check if Higgsfield is healthy
 */
router.get('/health', async (req, res) => {
  try {
    const client = getHiggsFieldClient();
    const healthy = await client.isHealthy();

    res.json({
      enabled: client.enabled,
      healthy,
      status: healthy ? 'ok' : 'unavailable',
    });
  } catch (error) {
    res.json({
      enabled: false,
      healthy: false,
      status: 'error',
      error: error.message,
    });
  }
});

export default router;
