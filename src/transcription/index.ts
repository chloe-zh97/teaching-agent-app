// src/transcription/index.ts
import { Hono } from 'hono';
import { TranscriptionRepository } from '../repositories/transcription.repository';
import { 
  CreateTranscriptionInput,
  TranscriptionStatus,
} from '../models/transcription.model';
import { NotFoundError, ValidationError } from '../utils/errors';
import { Env } from '../utils/raindrop.gen';
import { Service } from '@liquidmetal-ai/raindrop-framework';

const app = new Hono<{ Bindings: Env }>();

// POST   /api/transcribe                                  → Main transcription endpoint
// POST   /api/transcriptions                              → Create record
// GET    /api/transcriptions/:id                          → Get by ID
// GET    /api/users/:userId/transcriptions                → List user's transcriptions
// GET    /api/users/:userId/transcriptions/summaries      → Get summaries
// GET    /api/users/:userId/transcriptions/purpose/:purpose → Filter by purpose
// GET    /api/users/:userId/transcriptions/count          → Count transcriptions
// PATCH  /api/transcriptions/:id                          → Update
// POST   /api/transcriptions/:id/complete                 → Mark as completed
// POST   /api/transcriptions/:id/fail                     → Mark as failed
// DELETE /api/transcriptions/:id                          → Delete

/**
 * POST /api/transcribe
 * Transcribe audio to text (matches your frontend endpoint)
 * 
 * Note: This endpoint expects multipart/form-data with an audio file
 * For Raindrop/Cloudflare Workers, you'll need to handle file uploads
 */
app.post('/api/transcribe', async (c) => {
  try {
    // Get form data
    const formData = await c.req.formData();
    const audioFile = formData.get('audio') as File;
    const userId = formData.get('userId') as string;
    const purpose = formData.get('purpose') as string | null;
    const language = formData.get('language') as string | null;

    if (!audioFile) {
      return c.json({ error: 'No audio file provided' }, 400);
    }

    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }

    console.log(`Transcribing audio: ${audioFile.name} (${audioFile.size} bytes)`);

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    
    // Create transcription record
    const transcription = await transcriptionRepo.create({
      userId,
      originalFilename: audioFile.name,
      fileSize: audioFile.size,
      mimeType: audioFile.type,
      language: language || undefined,
      purpose: purpose || 'general',
    });

    // Get audio buffer
    const audioBuffer = await audioFile.arrayBuffer();
    const startTime = Date.now();

    // TODO: Call ElevenLabs Speech-to-Text API
    // For now, return a placeholder response
    // In production, you would call:
    // const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    //   method: 'POST',
    //   headers: {
    //     'xi-api-key': c.env.ELEVENLABS_API_KEY,
    //   },
    //   body: audioBuffer,
    // });
    
    const mockTranscriptionText = `[Transcription placeholder for ${audioFile.name}]`;
    const processingTime = Date.now() - startTime;

    // Update transcription with result
    const completedTranscription = await transcriptionRepo.complete(
      transcription.transcriptionId,
      mockTranscriptionText,
      {
        processingTime,
        confidence: 0.95,
        language: language || 'en',
      }
    );

    return c.json({
      transcriptionId: completedTranscription.transcriptionId,
      text: completedTranscription.text,
      fileSize: completedTranscription.fileSize,
      mimeType: completedTranscription.mimeType,
      duration: completedTranscription.duration,
      confidence: completedTranscription.confidence,
      language: completedTranscription.language,
      processingTime: completedTranscription.processingTime,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return c.json({
      error: 'Transcription failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/transcriptions
 * Create a transcription record (alternative endpoint)
 */
app.post('/api/transcriptions', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateTranscriptionInput = body;

    if (!input.userId || !input.originalFilename || !input.mimeType) {
      return c.json({ 
        error: 'userId, originalFilename, and mimeType are required' 
      }, 400);
    }

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const transcription = await transcriptionRepo.create(input);

    return c.json({
      success: true,
      message: 'Transcription record created',
      data: transcription,
    }, 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to create transcription',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/transcriptions/:id
 * Get transcription by ID
 */
app.get('/api/transcriptions/:id', async (c) => {
  try {
    const transcriptionId = c.req.param('id');
    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const transcription = await transcriptionRepo.getById(transcriptionId);

    return c.json({
      success: true,
      data: transcription,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get transcription',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/users/:userId/transcriptions
 * List transcriptions for a user
 */
app.get('/api/users/:userId/transcriptions', async (c) => {
  try {
    const userId = c.req.param('userId');
    const status = c.req.query('status') as TranscriptionStatus | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const transcriptions = await transcriptionRepo.listByUser(userId, { status, limit });

    return c.json({
      success: true,
      count: transcriptions.length,
      data: transcriptions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list transcriptions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/users/:userId/transcriptions/summaries
 * Get transcription summaries for a user
 */
app.get('/api/users/:userId/transcriptions/summaries', async (c) => {
  try {
    const userId = c.req.param('userId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const summaries = await transcriptionRepo.getUserSummaries(userId, limit);

    return c.json({
      success: true,
      count: summaries.length,
      data: summaries,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get transcription summaries',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/users/:userId/transcriptions/purpose/:purpose
 * Get transcriptions by purpose
 */
app.get('/api/users/:userId/transcriptions/purpose/:purpose', async (c) => {
  try {
    const userId = c.req.param('userId');
    const purpose = c.req.param('purpose');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 10;

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const transcriptions = await transcriptionRepo.listByPurpose(userId, purpose, limit);

    return c.json({
      success: true,
      count: transcriptions.length,
      data: transcriptions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list transcriptions by purpose',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/users/:userId/transcriptions/count
 * Get transcription count for a user
 */
app.get('/api/users/:userId/transcriptions/count', async (c) => {
  try {
    const userId = c.req.param('userId');

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const count = await transcriptionRepo.countByUser(userId);

    return c.json({
      success: true,
      userId,
      count,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to count transcriptions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/transcriptions/:id
 * Update transcription (complete or fail)
 */
app.patch('/api/transcriptions/:id', async (c) => {
  try {
    const transcriptionId = c.req.param('id');
    const updates = await c.req.json();

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const transcription = await transcriptionRepo.update(transcriptionId, updates);

    return c.json({
      success: true,
      message: 'Transcription updated successfully',
      data: transcription,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to update transcription',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/transcriptions/:id/complete
 * Mark transcription as completed with result
 */
app.post('/api/transcriptions/:id/complete', async (c) => {
  try {
    const transcriptionId = c.req.param('id');
    const { text, confidence, language, duration, processingTime } = await c.req.json();

    if (!text) {
      return c.json({ error: 'text is required' }, 400);
    }

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const transcription = await transcriptionRepo.complete(transcriptionId, text, {
      confidence,
      language,
      duration,
      processingTime,
    });

    return c.json({
      success: true,
      message: 'Transcription completed successfully',
      data: transcription,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to complete transcription',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/transcriptions/:id/fail
 * Mark transcription as failed
 */
app.post('/api/transcriptions/:id/fail', async (c) => {
  try {
    const transcriptionId = c.req.param('id');
    const { errorMessage } = await c.req.json();

    if (!errorMessage) {
      return c.json({ error: 'errorMessage is required' }, 400);
    }

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    const transcription = await transcriptionRepo.fail(transcriptionId, errorMessage);

    return c.json({
      success: true,
      message: 'Transcription marked as failed',
      data: transcription,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to mark transcription as failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/transcriptions/:id
 * Delete transcription (before expiry)
 */
app.delete('/api/transcriptions/:id', async (c) => {
  try {
    const transcriptionId = c.req.param('id');

    const transcriptionRepo = new TranscriptionRepository(c.env.KV_CACHE);
    await transcriptionRepo.delete(transcriptionId);

    return c.json({
      success: true,
      message: 'Transcription deleted successfully',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to delete transcription',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
};