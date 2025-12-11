// src/services/course.service.ts
import { Hono } from 'hono';
import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from '../utils/raindrop.gen';
import { CourseRepository } from '../repositories/course.repository';
import { 
  CreateCourseInput, 
  UpdateCourseInput,
  AccessibilityMode,
  CourseStatus 
} from '../models/course.model';
import { 
  ConflictError,
  NotFoundError, 
  ValidationError
} from '../utils/errors';

// Create Hono app instance
const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/courses
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

    // Create course using repository
    const courseRepo = new CourseRepository(c.env.mem);
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
    console.error('Failed to create course:', error);
    return c.json({
      error: 'Failed to create course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:id
 * Get course by ID
 */
app.get('/api/courses/:id', async (c) => {
  try {
    const courseId = c.req.param('id');
    const courseRepo = new CourseRepository(c.env.mem);
    const course = await courseRepo.getById(courseId);

    return c.json({
      success: true,
      data: course,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    console.error('Failed to get course:', error);
    return c.json({
      error: 'Failed to get course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses
 * List courses with optional filters
 * Query params: teacherId, status, public, limit
 */
app.get('/api/courses', async (c) => {
  try {
    const teacherId = c.req.query('teacherId');
    const status = c.req.query('status') as CourseStatus | undefined;
    const isPublic = c.req.query('public') === 'true';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const courseRepo = new CourseRepository(c.env.mem);
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
    console.error('Failed to list courses:', error);
    return c.json({
      error: 'Failed to list courses',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/courses/:id
 * Update course
 */
app.patch('/api/courses/:id', async (c) => {
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

    const courseRepo = new CourseRepository(c.env.mem);
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
    console.error('Failed to update course:', error);
    return c.json({
      error: 'Failed to update course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/courses/:id
 * Delete course
 */
app.delete('/api/courses/:id', async (c) => {
  try {
    const courseId = c.req.param('id');

    const courseRepo = new CourseRepository(c.env.mem);
    await courseRepo.delete(courseId);

    return c.json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    console.error('Failed to delete course:', error);
    return c.json({
      error: 'Failed to delete course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/courses/:id/publish
 * Publish course
 */
app.post('/api/courses/:id/publish', async (c) => {
  try {
    const courseId = c.req.param('id');

    const courseRepo = new CourseRepository(c.env.mem);
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
    console.error('Failed to publish course:', error);
    return c.json({
      error: 'Failed to publish course',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:id/agent
 * Get agent for a course
 */
app.get('/api/courses/:id/agent', async (c) => {
  try {
    const courseId = c.req.param('id');
    const courseRepo = new CourseRepository(c.env.mem);
    const course = await courseRepo.getById(courseId);

    if (!course.agentId) {
      return c.json({
        success: true,
        agentId: null,
        voiceId: null,
        message: 'No agent exists for this course',
      });
    }

    return c.json({
      success: true,
      agentId: course.agentId,
      voiceId: course.voiceId,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    console.error('Failed to get course agent:', error);
    return c.json({
      error: 'Failed to get course agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Health check endpoint
 */
app.get('/health', async (c) => {
  return c.json({
    success: true,
    service: 'course-service',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Entry point
 */
app.post('/api/courses/:courseId/agent', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const { voiceId, teacherId, recreate } = await c.req.json();

    if (!teacherId) {
      return c.json({ error: 'teacherId is required' }, 400);
    }

    // Check for required API keys
    if (!c.env.ELEVENLABS_API_KEY) {
      return c.json({
        error: 'ElevenLabs API key not configured',
        message: 'Set ELEVENLABS_API_KEY in environment variables',
      }, 500);
    }

    if (!c.env.ANTHROPIC_API_KEY) {
      return c.json({
        error: 'Anthropic API key not configured',
        message: 'Set ANTHROPIC_API_KEY in environment variables',
      }, 500);
    }

    console.log(`🎙️  Creating agent for course ${courseId}`);

    // Import workflow
    const {
      executeAgentCreationWorkflow,
      recreateAgentWorkflow,
    } = await import('../services/workflow.service');

    // Execute workflow (recreate if requested)
    const result = recreate
      ? await recreateAgentWorkflow(
          courseId, 
          teacherId, 
          voiceId, 
          c.env
        )
      : await executeAgentCreationWorkflow(
          courseId, 
          teacherId, 
          voiceId, 
          c.env
        );

    return c.json({
      success: true,
      message: result.message,
      agentId: result.agentId,
      elevenLabsAgentId: result.elevenLabsAgentId,
      status: result.status,
      warnings: result.warnings,
      generatedSlides: result.generatedSlides,
    }, result.status === 'created' ? 201 : 200);
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
    console.error('❌ Agent creation failed:', error);
    return c.json({
      error: 'Failed to create agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Export as Raindrop Service
 */
export default class CourseService extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
}