import { Hono } from 'hono';
import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from '../utils/raindrop.gen';
import { CourseRepository } from '../repositories/course.repository';
import { SlideRepository } from '../repositories/slide.repository';
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
import { generateOutline, generateSlides } from '../services/claude-integration.service';
import { executeAgentCreationWorkflow, recreateAgentWorkflow } from '../services/workflow.service';


const app = new Hono<{ Bindings: Env }>();

// ============================================================================
// STEP 1: Create Course with Initial Data
// ============================================================================

/**
 * POST /api/courses
 * Create a new course with knowledge content (Step 1)
 * This creates the course but does NOT generate outline yet
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
      message: 'Course created successfully. Ready to generate outline.',
      data: course,
      nextStep: 'generate-outline',
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

// ============================================================================
// STEP 2: Generate Outline
// ============================================================================

/**
 * POST /api/courses/:courseId/generate-outline
 * Generate course outline using Claude AI (Step 2)
 * Can be called multiple times to regenerate
 */
app.post('/api/courses/:courseId/generate-outline', async (c) => {
  try {
    const courseId = c.req.param('courseId');

    // Check API key
    if (!c.env.ANTHROPIC_API_KEY) {
      return c.json({
        error: 'Anthropic API key not configured',
        message: 'Set ANTHROPIC_API_KEY in environment variables',
      }, 500);
    }

    console.log(`📋 Generating outline for course ${courseId}`);

    // Get course
    const courseRepo = new CourseRepository(c.env.mem);
    const course = await courseRepo.getById(courseId);

    // Validate course has required data
    if (!course.knowledgeText || course.knowledgeText.trim().length === 0) {
      return c.json({
        error: 'Course has no knowledge text',
        message: 'Please add knowledge text before generating outline',
      }, 400);
    }

    // Generate outline using Claude AI
    console.log('   🧠 Calling Claude AI to generate outline...');
    const outline = await generateOutline(
      c.env,
      course.knowledgeText,
      course.concepts || [],
      course.accessibility || 'visual',
      course.keywords
    );

    console.log(`   ✅ Generated outline with ${outline.nodes.length} nodes`);

    // Save outline to course
    await courseRepo.updateOutline(courseId, { outline });
    console.log('   💾 Outline saved to course');

    // Get updated course
    const updatedCourse = await courseRepo.getById(courseId);

    return c.json({
      success: true,
      message: 'Outline generated successfully',
      data: {
        courseId: updatedCourse.courseId,
        outline: updatedCourse.outline,
        nodes: outline.nodes,
        mermaidCode: outline.mermaidCode,
      },
      nextStep: 'generate-slides',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    console.error('Failed to generate outline:', error);
    return c.json({
      error: 'Failed to generate outline',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/courses/:courseId/outline
 * Update course outline after user modifications (Step 2 - optional)
 */
app.patch('/api/courses/:courseId/outline', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const { outline } = await c.req.json();

    if (!outline) {
      return c.json({ error: 'Outline is required' }, 400);
    }

    const courseRepo = new CourseRepository(c.env.mem);
    const course = await courseRepo.updateOutline(courseId, { outline });

    return c.json({
      success: true,
      message: 'Outline updated successfully',
      data: {
        courseId: course.courseId,
        outline: course.outline,
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    console.error('Failed to update outline:', error);
    return c.json({
      error: 'Failed to update outline',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// ============================================================================
// STEP 3: Generate Slides
// ============================================================================

/**
 * POST /api/courses/:courseId/generate-slides
 * Generate slides from outline using Claude AI (Step 3)
 * Can be called multiple times to regenerate
 */
app.post('/api/courses/:courseId/generate-slides', async (c) => {
  try {
    const courseId = c.req.param('courseId');

    // Check API key
    if (!c.env.ANTHROPIC_API_KEY) {
      return c.json({
        error: 'Anthropic API key not configured',
        message: 'Set ANTHROPIC_API_KEY in environment variables',
      }, 500);
    }

    console.log(`📝 Generating slides for course ${courseId}`);

    // Get course
    const courseRepo = new CourseRepository(c.env.mem);
    const course = await courseRepo.getById(courseId);

    // Validate course has outline
    if (!course.outline || !course.outline.nodes || course.outline.nodes.length === 0) {
      return c.json({
        error: 'Course has no outline',
        message: 'Please generate outline before generating slides',
      }, 400);
    }

    // Generate slides using Claude AI
    console.log('   📄 Calling Claude AI to generate slides...');
    const generatedSlides = await generateSlides(
      c.env,
      course.outline.nodes,
      course.accessibility || 'visual',
      course.knowledgeText
    );

    console.log(`   ✅ Generated ${generatedSlides.length} slides`);

    // Delete existing slides if any
    const slideRepo = new SlideRepository(c.env.mem);
    const existingSlides = await slideRepo.listByCourse(courseId);
    for (const slide of existingSlides) {
      await slideRepo.delete(slide.slideId);
    }

    // Save slides to database
    console.log('   💾 Saving slides to database...');
    const savedSlides = [];
    for (const slideData of generatedSlides) {
      const savedSlide = await slideRepo.create({
        ...slideData,
        courseId: courseId,
      });
      savedSlides.push(savedSlide);
    }

    console.log(`   ✅ Saved ${savedSlides.length} slides`);

    // Update course with slide IDs
    const slideIds = savedSlides.map(s => s.slideId);
    await courseRepo.updateSlides(courseId, { slideIds });

    return c.json({
      success: true,
      message: 'Slides generated successfully',
      data: {
        courseId,
        slides: savedSlides,
        totalSlides: savedSlides.length,
      },
      nextStep: 'create-agent',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    console.error('Failed to generate slides:', error);
    return c.json({
      error: 'Failed to generate slides',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// ============================================================================
// STEP 4: Create Agent (Final Step)
// ============================================================================

/**
 * POST /api/courses/:courseId/create-agent
 * Create ElevenLabs agent based on course, outline, and slides (Step 4)
 */
app.post('/api/courses/:courseId/create-agent', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const body = await c.req.json();
    const { voiceId, teacherId, recreate } = body;

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

    console.log(`🎙️  Creating agent for course ${courseId}`);

    // Execute workflow (recreate if requested)
    const result = recreate
      ? await recreateAgentWorkflow(courseId, teacherId, voiceId, c.env)
      : await executeAgentCreationWorkflow(courseId, teacherId, voiceId, c.env);

    return c.json({
      success: true,
      message: result.message,
      data: {
        agentId: result.agentId,
        elevenLabsAgentId: result.elevenLabsAgentId,
        status: result.status,
        warnings: result.warnings,
        generatedSlides: result.generatedSlides,
      },
      completed: true,
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

// ============================================================================
// Additional CRUD Endpoints
// ============================================================================

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
      courses = await courseRepo.listByTeacher(teacherId, { limit });
    } else if (isPublic) {
      courses = await courseRepo.listPublic({ limit });
    } else if (status) {
      courses = await courseRepo.listByStatus(status, { limit });
    } else {
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
 * Update course basic information
 */
app.patch('/api/courses/:id', async (c) => {
  try {
    const courseId = c.req.param('id');
    const updates: UpdateCourseInput = await c.req.json();

    if (updates.accessibility) {
      const validModes: AccessibilityMode[] = ['visual', 'auditory', 'kinesthetic', 'reading'];
      if (!validModes.includes(updates.accessibility)) {
        return c.json({ error: 'Invalid accessibility mode' }, 400);
      }
    }

    if (updates.concepts && (!Array.isArray(updates.concepts) || updates.concepts.length === 0)) {
      return c.json({ error: 'Concepts must be a non-empty array' }, 400);
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
 * GET /api/courses/:courseId/slides
 * Get all slides for a course
 */
app.get('/api/courses/:courseId/slides', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const slideRepo = new SlideRepository(c.env.mem);
    const slides = await slideRepo.listByCourse(courseId);

    return c.json({
      success: true,
      count: slides.length,
      data: slides,
    });
  } catch (error) {
    console.error('Failed to get slides:', error);
    return c.json({
      error: 'Failed to get slides',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', async (c) => {
  return c.json({
    success: true,
    service: 'course-api',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Export as Raindrop Service
 */
export default class CourseService extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
}