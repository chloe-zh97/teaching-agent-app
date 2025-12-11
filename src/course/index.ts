import { Hono } from 'hono';
import { CourseRepository } from '../repositories/course.repository';
import { AgentRepository } from '../repositories/agent.repository';
import { 
  CreateCourseInput, 
  UpdateCourseInput,
  AccessibilityMode,
  CourseStatus 
} from '../models/course.model';
import { NotFoundError, ValidationError, UnauthorizedError } from '../utils/errors';
import { Env } from '../utils/raindrop.gen';
import { Service } from '@liquidmetal-ai/raindrop-framework';

// POST   /api/courses                    → Create course
// GET    /api/courses/:id                → Get course
// GET    /api/courses?teacherId=...      → List courses
// PATCH  /api/courses/:id                → Update course
// POST   /api/courses/:id/outline        → Update outline (Step 2)
// POST   /api/courses/:id/slides         → Update slides (Step 3)
// POST   /api/courses/:id/agent          → Update agent (Step 4)
// POST   /api/courses/:id/publish        → Publish course
// DELETE /api/courses/:id                → Delete course
// GET    /api/courses/:id/agent          → Get agent info

const app = new Hono<{ Bindings: Env }>();
/**
 * POST /courses
 * Create a new course
 */
app.post('/api/courses', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateCourseInput = body;

    // Validate required fields
    if (!input.teacherId || !input.title || !input.knowledgeText || 
        !input.concepts || !input.accessibility) {
      return c.json({ 
        error: 'teacherId, title, knowledgeText, concepts, and accessibility are required' 
      }, 400);
    }

    // Validate accessibility mode
    const validAccessibilityModes: AccessibilityMode[] = ['visual', 'auditory', 'kinesthetic', 'reading'];
    if (!validAccessibilityModes.includes(input.accessibility)) {
      return c.json({ 
        error: 'Invalid accessibility mode. Must be: visual, auditory, kinesthetic, or reading' 
      }, 400);
    }

    // Validate concepts array
    if (!Array.isArray(input.concepts) || input.concepts.length === 0) {
      return c.json({ 
        error: 'Concepts must be a non-empty array' 
      }, 400);
    }

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.create(input);

    return c.json({
      success: true,
      message: 'Course created successfully',
      data: course,
    }, 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to create course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /courses/:id
 * Get course by ID
 */
app.get('/api/courses/:id', async (c) => {
  try {
    const courseId = c.req.param('id');
    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.getById(courseId);

    //c.env.logger.info("Get course by id:", {courseId: courseId});

    return c.json({
      success: true,
      data: course,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * GET /courses
 * List courses with optional filters
 * Query params: teacherId, status, public, limit
 */
app.get('/api/courses', async (c) => {
  try {
    const teacherId = c.req.query('teacherId');
    const status = c.req.query('status') as CourseStatus | undefined;
    const isPublic = c.req.query('public') === 'true';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    let courses;

    if (teacherId) {
      // List by teacher
      courses = await courseRepo.listByTeacher(teacherId, { limit });
    } else if (isPublic) {
      // List public courses
      courses = await courseRepo.listPublic({ limit });
    } else if (status) {
      // List by status
      courses = await courseRepo.listByStatus(status, { limit });
    } else {
      // No filter provided
      return c.json({ 
        error: 'Please provide at least one filter: teacherId, status, or public=true' 
      }, 400);
    }

    return c.json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list courses',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * DELETE /courses/:id
 * Delete course
 */
app.delete('/api/courses/:id', async (c) => {
  try {
    const courseId = c.req.param('id');

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    await courseRepo.delete(courseId);

    return c.json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to delete course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/courses/:id/publish
 * Make course status to published
 */
app.patch('/api/courses/:id/publish', async (c) => {
  try {
    const courseId = c.req.param('id');

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.publish(courseId);

    return c.json({
      success: true,
      message: 'Course published successfully',
      data: course,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to publish course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /courses/:id
 * Update course basic information
 */
app.post('/api/courses/:id', async (c) => {
  try {
    const courseId = c.req.param('id');
    const updates: UpdateCourseInput = await c.req.json();

    // Validate accessibility if provided
    if (updates.accessibility) {
      const validModes: AccessibilityMode[] = ['visual', 'auditory', 'kinesthetic', 'reading'];
      if (!validModes.includes(updates.accessibility)) {
        return c.json({ 
          error: 'Invalid accessibility mode' 
        }, 400);
      }
    }

    // Validate concepts if provided
    if (updates.concepts && (!Array.isArray(updates.concepts) || updates.concepts.length === 0)) {
      return c.json({ 
        error: 'Concepts must be a non-empty array' 
      }, 400);
    }

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.update(courseId, updates);

    return c.json({
      success: true,
      message: 'Course updated successfully',
      data: course,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to update course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/courses/:id/outline
 * Update course outline (Step 2: after generation)
 */
app.post('/api/courses/:id/outline', async (c) => {
  try {
    const courseId = c.req.param('id');
    const { outline } = await c.req.json();

    if (!outline) {
      return c.json({ error: 'Outline is required' }, 400);
    }

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.updateOutline(courseId, { outline });

    return c.json({
      success: true,
      message: 'Course outline updated successfully',
      data: course,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to update course outline',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * POST /api/courses/slides/:id
 * Update course slides (Step 3: after generation)
 */
app.post('/api/courses/:id/slides', async (c) => {
  try {
    const courseId = c.req.param('id');
    const { slideIds } = await c.req.json();

    if (!slideIds || !Array.isArray(slideIds)) {
      return c.json({ error: 'slideIds must be an array' }, 400);
    }

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.updateSlides(courseId, { slideIds });

    return c.json({
      success: true,
      message: 'Course slides updated successfully',
      data: course,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to update course slides',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * POST /courses/:id/agent
 * Update course agent (Step 4: after agent creation)
 */
app.post('/api/courses/:id/agent', async (c) => {
  try {
    const courseId = c.req.param('id');
    const { agentId, voiceId } = await c.req.json();

    if (!agentId || !voiceId) {
      return c.json({ error: 'agentId and voiceId are required' }, 400);
    }

    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.updateAgent(courseId, { agentId, voiceId });

    return c.json({
      success: true,
      message: 'Course agent updated successfully',
      data: course,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to update course agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:id/agent
 * Get agent ID for a course (for API compatibility)
 * 
 * This endpoint checks two sources:
 * 1. Fast path: course.agentId field (if workflow completed successfully)
 * 2. Fallback: AgentRepository.getByCourse() (source of truth for agent data)
 * 
 * If agent is found via fallback but course.agentId is missing,
 * we sync the course record to ensure future lookups are faster.
 */
app.get('/api/courses/:id/agent', async (c) => {
  try {
    const courseId = c.req.param('id');
    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    const course = await courseRepo.getById(courseId);

    // Fast path: Check course.agentId first (if workflow completed successfully)
    if (course.agentId) {
      return c.json({
        success: true,
        agentId: course.agentId,
        voiceId: course.voiceId,
      });
    }

    // Fallback: Check AgentRepository (source of truth)
    // This handles cases where agent exists but course.agentId wasn't synced
    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.getByCourse(courseId);

    if (!agent) {
      // No agent found in either location - return hardcoded agent ID
      return c.json({
        agentId: 'agent_1301kayr8fdneh8agzn2vx0hfra0',
        message: 'Using default agent',
      });
    }

    // Agent found via fallback - sync course.agentId for future lookups
    // Only sync if not already set (race condition protection)
    if (!course.agentId && agent.agentId) {
      try {
        await courseRepo.updateAgent(courseId, {
          agentId: agent.agentId,
          voiceId: agent.elevenLabsConfig.voiceId,
        });
      } catch (syncError) {
        // Log but don't fail - agent data is still valid
        console.warn(`Failed to sync agentId to course ${courseId}:`, syncError);
      }
    }

    // Return agent data (consistent with agent service endpoint format)
    return c.json({
      success: true,
      agentId: agent.agentId,
      elevenLabsAgentId: agent.elevenLabsConfig.agentId || null,
      voiceId: agent.elevenLabsConfig.voiceId,
      status: agent.status,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get course agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
};