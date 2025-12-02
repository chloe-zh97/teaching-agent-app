import { Hono } from 'hono';
import { InteractionRepository } from '../repositories/interaction.repository';
import { SessionRepository } from '../repositories/session.repository';
import { 
  CreateInteractionInput,
  UpdateInteractionInput,
  InteractionType,
} from '../models/interaction.model';
import { NotFoundError, ValidationError } from '../utils/errors';
import { Env } from '../utils/raindrop.gen';
import { Service } from '@liquidmetal-ai/raindrop-framework';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/interactions
 * Create a new interaction
 */
app.post('/api/interactions', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateInteractionInput = body;

    // Validate required fields
    if (!input.sessionId || !input.slideId || !input.type || !input.data) {
      return c.json({ 
        error: 'sessionId, slideId, type, and data are required' 
      }, 400);
    }

    // Validate interaction type
    const validTypes: InteractionType[] = ['question', 'highlight', 'navigation', 'annotation', 'agent-chat'];
    if (!validTypes.includes(input.type)) {
      return c.json({ 
        error: 'Invalid interaction type. Must be: question, highlight, navigation, annotation, or agent-chat' 
      }, 400);
    }

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const interaction = await interactionRepo.create(input);

    // Update session interaction count
    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    if (input.type === 'question') {
      await sessionRepo.incrementQuestionCount(input.sessionId);
    } else {
      await sessionRepo.incrementInteractionCount(input.sessionId);
    }

    return c.json({
      success: true,
      message: 'Interaction created successfully',
      data: interaction,
    }, 201);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to create interaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/interactions/:id
 * Get interaction by ID
 */
app.get('/api/interactions/:id', async (c) => {
  try {
    const interactionId = c.req.param('id');
    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const interaction = await interactionRepo.getById(interactionId);

    return c.json({
      success: true,
      data: interaction,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get interaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/sessions/:sessionId/interactions
 * List all interactions for a session
 */
app.get('/api/sessions/:sessionId/interactions', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const type = c.req.query('type') as InteractionType | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const interactions = await interactionRepo.listBySession(sessionId, { type, limit });

    return c.json({
      success: true,
      count: interactions.length,
      data: interactions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list session interactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/sessions/:sessionId/interactions/summaries
 * Get interaction summaries for a session
 */
app.get('/api/sessions/:sessionId/interactions/summaries', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const summaries = await interactionRepo.getSessionSummaries(sessionId);

    return c.json({
      success: true,
      count: summaries.length,
      data: summaries,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get interaction summaries',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/sessions/:sessionId/interactions/stats
 * Get interaction statistics for a session
 */
app.get('/api/sessions/:sessionId/interactions/stats', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const stats = await interactionRepo.getSessionStats(sessionId);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get interaction stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/slides/:slideId/interactions
 * List all interactions for a slide
 */
app.get('/api/slides/:slideId/interactions', async (c) => {
  try {
    const slideId = c.req.param('slideId');
    const type = c.req.query('type') as InteractionType | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const interactions = await interactionRepo.listBySlide(slideId, { type, limit });

    return c.json({
      success: true,
      count: interactions.length,
      data: interactions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list slide interactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/students/:studentId/questions
 * List all questions asked by a student
 */
app.get('/api/students/:studentId/questions', async (c) => {
  try {
    const studentId = c.req.param('studentId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const questions = await interactionRepo.listStudentQuestions(studentId, { limit });

    return c.json({
      success: true,
      count: questions.length,
      data: questions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list student questions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * GET /api/courses/:courseId/interactions/stats
 * Get interaction statistics for a course
 */
app.get('/api/courses/:courseId/interactions/stats', async (c) => {
  try {
    const courseId = c.req.param('courseId');

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const stats = await interactionRepo.getCourseStats(courseId);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get course interaction stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:courseId/questions/recent
 * Get recent questions for a course (teacher view)
 */
app.get('/api/courses/:courseId/questions/recent', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 20;

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const questions = await interactionRepo.getRecentCourseQuestions(courseId, limit);

    return c.json({
      success: true,
      count: questions.length,
      data: questions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get recent questions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/interactions/:id
 * Update interaction (feedback)
 */
app.patch('/api/interactions/:id', async (c) => {
  try {
    const interactionId = c.req.param('id');
    const updates: UpdateInteractionInput = await c.req.json();

    // Validate rating if provided
    if (updates.rating !== undefined && (updates.rating < 1 || updates.rating > 5)) {
      return c.json({ 
        error: 'Rating must be between 1 and 5' 
      }, 400);
    }

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    const interaction = await interactionRepo.update(interactionId, updates);

    return c.json({
      success: true,
      message: 'Interaction updated successfully',
      data: interaction,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to update interaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/interactions/:id
 * Delete interaction
 */
app.delete('/api/interactions/:id', async (c) => {
  try {
    const interactionId = c.req.param('id');

    const interactionRepo = new InteractionRepository(c.env.KV_CACHE);
    await interactionRepo.delete(interactionId);

    return c.json({
      success: true,
      message: 'Interaction deleted successfully',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to delete interaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
};