import { Hono } from 'hono';
import { SlideRepository } from '../repositories/slide.repository';
import { CourseRepository } from '../repositories/course.repository';
import { 
  CreateSlideInput, 
  UpdateSlideInput,
  ReorderSlidesInput,
  SlideLayout,
} from '../models/slide.model';
import { AccessibilityMode } from '../models/course.model';
import { NotFoundError, ValidationError } from '../utils/errors';
import { Env } from '../utils/raindrop.gen';
import { Service } from '@liquidmetal-ai/raindrop-framework';

const app = new Hono<{ Bindings: Env }>();

// POST   /api/slides                             → Create slide
// POST   /api/slides/batch                       → Batch create
// GET    /api/slides/:id                         → Get slide
// GET    /api/courses/:courseId/slides           → List course slides
// GET    /api/courses/:courseId/slides/:order    → Get slide by position
// GET    /api/outline-nodes/:nodeId/slides       → List by outline node
// PATCH  /api/slides/:id                         → Update slide
// POST   /api/courses/:courseId/slides/reorder   → Reorder slides
// POST   /api/slides/:id/duplicate               → Duplicate slide
// DELETE /api/slides/:id                         → Delete slide
// GET    /api/courses/:courseId/slides/count     → Count slides

/**
 * POST /api/slides
 * Create a new slide
 */
app.post('/api/slides', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateSlideInput = body;

    // Validate required fields
    if (!input.courseId || !input.title || !input.content || !input.accessibilityMode) {
      return c.json({ 
        error: 'courseId, title, content, and accessibilityMode are required' 
      }, 400);
    }

    // Validate order
    if (input.order === undefined || input.order < 0) {
      return c.json({ 
        error: 'order must be a non-negative number' 
      }, 400);
    }

    // Validate accessibility mode
    const validAccessibilityModes: AccessibilityMode[] = ['visual', 'auditory', 'kinesthetic', 'reading'];
    if (!validAccessibilityModes.includes(input.accessibilityMode)) {
      return c.json({ 
        error: 'Invalid accessibility mode' 
      }, 400);
    }

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const slide = await slideRepo.create(input);
    c.env.logger.debug("slide id:", {slideId: slide.slideId});

    return c.json({
      success: true,
      message: 'Slide created successfully',
      data: slide,
    }, 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to create slide',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * POST /api/slides/batch
 * Batch create slides
 */
app.post('/api/slides/batch', async (c) => {
  try {
    const { slides } = await c.req.json();

    if (!slides || !Array.isArray(slides)) {
      return c.json({ 
        error: 'slides must be an array' 
      }, 400);
    }

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const createdSlides = await slideRepo.batchCreate(slides);

    return c.json({
      success: true,
      message: `${createdSlides.length} slides created successfully`,
      data: createdSlides,
    }, 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to batch create slides',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /slides/:id
 * Get slide by ID
 */
app.get('/api/slides/:id', async (c) => {
  try {
    const slideId = c.req.param('id');
    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const slide = await slideRepo.getById(slideId);

    return c.json({
      success: true,
      data: slide,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get slide',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:courseId/slides
 * List all slides for a course (ordered)
 */
app.get('/api/courses/:courseId/slides', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const slides = await slideRepo.listByCourse(courseId, { limit });

    return c.json({
      success: true,
      count: slides.length,
      data: slides,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list slides',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /courses/:courseId/slides/:order
 * Get slide by course and order position
 */
app.get('/api/courses/:courseId/slides/:order', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const order = parseInt(c.req.param('order'));

    if (isNaN(order) || order < 0) {
      return c.json({ error: 'Invalid order parameter' }, 400);
    }

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const slide = await slideRepo.getByCourseAndOrder(courseId, order);

    return c.json({
      success: true,
      data: slide,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get slide',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/outline-nodes/:nodeId/slides
 * List slides by outline node
 */
app.get('/api/outline-nodes/:nodeId/slides', async (c) => {
  try {
    const nodeId = c.req.param('nodeId');

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const slides = await slideRepo.listByOutlineNode(nodeId);

    return c.json({
      success: true,
      count: slides.length,
      data: slides,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list slides by outline node',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /slides/:id
 * Update slide
 */
app.patch('/api/slides/:id', async (c) => {
  try {
    const slideId = c.req.param('id');
    const updates: UpdateSlideInput = await c.req.json();

    // Validate layout if provided
    if (updates.layout) {
      const validLayouts: SlideLayout[] = ['title', 'content', 'two-column', 'full-image', 'diagram', 'custom'];
      if (!validLayouts.includes(updates.layout)) {
        return c.json({ 
          error: 'Invalid layout' 
        }, 400);
      }
    }

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const slide = await slideRepo.update(slideId, updates);

    return c.json({
      success: true,
      message: 'Slide updated successfully',
      data: slide,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to update slide',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/courses/:courseId/slides/reorder
 * Reorder slides in a course
 */
app.post('/api/courses/:courseId/slides/reorder', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const input: ReorderSlidesInput = await c.req.json();

    if (!input.slideOrders || !Array.isArray(input.slideOrders)) {
      return c.json({ 
        error: 'slideOrders must be an array' 
      }, 400);
    }

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const slides = await slideRepo.reorder(courseId, input);

    return c.json({
      success: true,
      message: 'Slides reordered successfully',
      data: slides,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to reorder slides',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/slides/:id/duplicate
 * Duplicate a slide
 */
app.post('/api/slides/:id/duplicate', async (c) => {
  try {
    const slideId = c.req.param('id');
    const { newOrder } = await c.req.json();

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const duplicatedSlide = await slideRepo.duplicate(
      slideId, 
      newOrder !== undefined ? parseInt(newOrder) : undefined
    );

    return c.json({
      success: true,
      message: 'Slide duplicated successfully',
      data: duplicatedSlide,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to duplicate slide',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/slides/:id
 * Delete slide
 */
app.delete('/api/slides/:id', async (c) => {
  try {
    const slideId = c.req.param('id');

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    await slideRepo.delete(slideId);

    return c.json({
      success: true,
      message: 'Slide deleted successfully',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to delete slide',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/courses/:courseId/of/slides/count
 * Get total slide count for a course
 */
app.get('/api/courses/:courseId/of/slides/count', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    // c.env.logger.debug("course Id: ", {courseId: courseId});

    const slideRepo = new SlideRepository(c.env.KV_CACHE);
    const count = await slideRepo.countByCourse(courseId);

    return c.json({
      success: true,
      courseId,
      count,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to count slides',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
};