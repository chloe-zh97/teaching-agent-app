import { Hono } from 'hono';
import { SessionRepository } from '../repositories/session.repository';
import { CourseRepository } from '../repositories/course.repository';
import { SlideRepository } from '../repositories/slide.repository';
import { 
  CreateSessionInput,
  UpdateSessionProgressInput,
  UpdateSessionStatusInput,
  SessionStatus,
} from '../models/session.model';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { Env } from '../utils/raindrop.gen';
import { Service } from '@liquidmetal-ai/raindrop-framework';


// POST   /api/sessions                                        → Create session
// POST   /api/sessions/resume-or-create                       → Resume or create
// GET    /api/sessions/:id                                    → Get session
// GET    /api/students/:studentId/sessions/active/:courseId  → Get active
// GET    /api/students/:studentId/sessions                   → List by student
// GET    /api/students/:studentId/sessions/summaries         → Get summaries
// GET    /api/courses/:courseId/sessions                     → List by course
// GET    /api/courses/:courseId/sessions/stats               → Course stats
// PATCH  /api/sessions/:id/progress                          → Update progress
// PATCH  /api/sessions/:id/status                            → Update status
// PATCH  /api/sessions/:id/notes                             → Update notes
// DELETE /api/sessions/:id


const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/sessions
 * Create a new learning session
 */
app.post('/api/sessions', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateSessionInput = body;

    // Validate required fields
    if (!input.courseId || !input.studentId) {
      return c.json({ 
        error: 'courseId and studentId are required' 
      }, 400);
    }

    // Get course to verify it exists and get total slides
    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.getById(input.courseId);

    // Get total slides
    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const totalSlides = await slideRepo.countByCourse(input.courseId);

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const session = await sessionRepo.create(input, totalSlides);

    // Increment course session count
    await courseRepo.incrementSessionCount(input.courseId);

    return c.json({
      success: true,
      message: 'Session created successfully',
      data: session,
    }, 201);
  } catch (error) {
    if (error instanceof ConflictError) {
      return c.json({ error: error.message }, 409);
    }
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to create session',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/sessions/resume-or-create
 * Resume existing active session or create new one
 */
app.post('/api/sessions/resume-or-create', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateSessionInput = body;

    if (!input.courseId || !input.studentId) {
      return c.json({ 
        error: 'courseId and studentId are required' 
      }, 400);
    }

    // Get course
    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.getById(input.courseId);

    // Get total slides
    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const totalSlides = await slideRepo.countByCourse(input.courseId);

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const result = await sessionRepo.resumeOrCreate(input, totalSlides);

    // Increment session count only for new sessions
    if (result.isNew) {
      await courseRepo.incrementSessionCount(input.courseId);
    }

    return c.json({
      success: true,
      message: result.isNew ? 'New session created' : 'Resumed existing session',
      isNew: result.isNew,
      data: result.session,
    }, result.isNew ? 201 : 200);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to resume or create session',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * GET /api/sessions/:id
 * Get session by ID
 */
app.get('/api/sessions/:id', async (c) => {
  try {
    const sessionId = c.req.param('id');
    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const session = await sessionRepo.getById(sessionId);

    return c.json({
      success: true,
      data: session,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get session',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/students/:studentId/sessions/active/:courseId
 * Get active session for student and course
 */
app.get('/api/students/:studentId/sessions/active/:courseId', async (c) => {
  try {
    const studentId = c.req.param('studentId');
    const courseId = c.req.param('courseId');

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const session = await sessionRepo.getActiveSession(studentId, courseId);

    if (!session) {
      return c.json({
        success: true,
        data: null,
        message: 'No active session found',
      });
    }

    return c.json({
      success: true,
      data: session,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get active session',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/students/:studentId/sessions
 * List all sessions for a student
 */
app.get('/api/students/:studentId/sessions', async (c) => {
  try {
    const studentId = c.req.param('studentId');
    const status = c.req.query('status') as SessionStatus | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const sessions = await sessionRepo.listByStudent(studentId, { status, limit });

    return c.json({
      success: true,
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list student sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/students/:studentId/sessions/summaries
 * Get session summaries for student
 */
app.get('/api/students/:studentId/sessions/summaries', async (c) => {
  try {
    const studentId = c.req.param('studentId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const summaries = await sessionRepo.getStudentSummaries(studentId, limit);

    return c.json({
      success: true,
      count: summaries.length,
      data: summaries,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get session summaries',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:courseId/sessions
 * List all sessions for a course
 */
app.get('/api/courses/:courseId/sessions', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const status = c.req.query('status') as SessionStatus | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const sessions = await sessionRepo.listByCourse(courseId, { status, limit });

    return c.json({
      success: true,
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list course sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:courseId/sessions/stats
 * Get session statistics for a course
 */
app.get('/api/courses/:courseId/sessions/stats', async (c) => {
  try {
    const courseId = c.req.param('courseId');

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const stats = await sessionRepo.getCourseStats(courseId);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get course stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/sessions/:id/progress
 * Update session progress (navigate slides, complete slides)
 */
app.patch('/api/sessions/:id/progress', async (c) => {
  try {
    const sessionId = c.req.param('id');
    const input: UpdateSessionProgressInput = await c.req.json();

    // Validate required fields
    if (input.currentSlideOrder === undefined || !input.currentSlideId || !input.action) {
      return c.json({ 
        error: 'currentSlideOrder, currentSlideId, and action are required' 
      }, 400);
    }

    // Validate action
    const validActions = ['visit', 'complete', 'back', 'forward'];
    if (!validActions.includes(input.action)) {
      return c.json({ 
        error: 'Invalid action. Must be: visit, complete, back, or forward' 
      }, 400);
    }

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const session = await sessionRepo.updateProgress(sessionId, input);

    return c.json({
      success: true,
      message: 'Progress updated successfully',
      data: session,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to update progress',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/sessions/:id/status
 * Update session status (pause, resume, complete)
 */
app.patch('/api/sessions/:id/status', async (c) => {
  try {
    const sessionId = c.req.param('id');
    const input: UpdateSessionStatusInput = await c.req.json();

    if (!input.status) {
      return c.json({ error: 'status is required' }, 400);
    }

    // Validate status
    const validStatuses: SessionStatus[] = ['active', 'paused', 'completed'];
    if (!validStatuses.includes(input.status)) {
      return c.json({ 
        error: 'Invalid status. Must be: active, paused, or completed' 
      }, 400);
    }

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const session = await sessionRepo.updateStatus(sessionId, input);

    return c.json({
      success: true,
      message: 'Status updated successfully',
      data: session,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to update status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/sessions/:id/notes
 * Update session notes
 */
app.patch('/api/sessions/:id/notes', async (c) => {
  try {
    const sessionId = c.req.param('id');
    const { notes } = await c.req.json();

    if (notes === undefined) {
      return c.json({ error: 'notes field is required' }, 400);
    }

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    const session = await sessionRepo.updateNotes(sessionId, notes);

    return c.json({
      success: true,
      message: 'Notes updated successfully',
      data: session,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to update notes',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/sessions/:id
 * Delete session
 */
app.delete('/api/sessions/:id', async (c) => {
  try {
    const sessionId = c.req.param('id');

    const sessionRepo = new SessionRepository(c.env.KV_CACHE);
    await sessionRepo.delete(sessionId);

    return c.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to delete session',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});





export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
};