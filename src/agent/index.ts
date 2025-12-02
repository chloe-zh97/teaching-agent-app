import { Hono } from 'hono';
import { AgentRepository } from '../repositories/agent.repository';
import { CourseRepository } from '../repositories/course.repository';
import { 
  CreateAgentInput,
  UpdateAgentInput,
  UpdateAgentStatusInput,
  AgentStatus,
} from '../models/agent.model';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { Env } from '../utils/raindrop.gen';
import { Service } from '@liquidmetal-ai/raindrop-framework';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/agents
 * Create a new ElevenLabs agent for a course
 */
app.post('/api/agents', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateAgentInput = body;

    // Validate required fields
    if (!input.courseId || !input.teacherId) {
      return c.json({ 
        error: 'courseId and teacherId are required' 
      }, 400);
    }

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.create(input);

    return c.json({
      success: true,
      message: 'Agent created successfully. Call ElevenLabs API to complete setup.',
      data: agent,
      nextSteps: {
        description: 'Create ElevenLabs conversational agent',
        endpoint: 'POST https://api.elevenlabs.io/v1/convai/agents',
        systemPrompt: agent.systemPrompt,
        voiceId: agent.elevenLabsConfig.voiceId,
      },
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
      error: 'Failed to create agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/courses/:courseId/agent
 * Create agent for a course (alternative endpoint matching your frontend)
 */
app.post('/api/courses/:courseId/agent', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const { voiceId, teacherId } = await c.req.json();

    if (!teacherId) {
      return c.json({ error: 'teacherId is required' }, 400);
    }

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.create({
      courseId,
      teacherId,
      voiceId,
    });

    // Update course with agent info (as per your flow)
    const courseRepo = new CourseRepository(c.env.KV_CACHE);
    await courseRepo.updateAgent(courseId, {
      agentId: agent.agentId,
      voiceId: agent.elevenLabsConfig.voiceId,
    });

    return c.json({
      success: true,
      message: 'Agent configuration created',
      agentId: agent.agentId,
      voiceId: agent.elevenLabsConfig.voiceId,
      status: agent.status,
      note: 'Complete ElevenLabs agent creation, then update status',
    }, 201);
  } catch (error) {
    if (error instanceof ConflictError) {
      return c.json({ error: error.message }, 409);
    }
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to create agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/agents/:id
 * Get agent by ID
 */
app.get('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id');
    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.getById(agentId);

    return c.json({
      success: true,
      data: agent,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * GET /api/courses/:courseId/agent
 * Get agent for a course (matches your frontend endpoint)
 */
app.get('/api/courses/:courseId/agent', async (c) => {
  try {
    const courseId = c.req.param('courseId');
    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.getByCourse(courseId);

    if (!agent) {
      return c.json({
        success: true,
        agentId: null,
        message: 'No agent created for this course yet',
      });
    }

    return c.json({
      success: true,
      agentId: agent.agentId,
      elevenLabsAgentId: agent.elevenLabsConfig.agentId || null,
      voiceId: agent.elevenLabsConfig.voiceId,
      status: agent.status,
      data: agent,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get course agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/agents/elevenlabs/:elevenLabsAgentId
 * Get agent by ElevenLabs agent ID
 */
app.get('/api/agents/elevenlabs/:elevenLabsAgentId', async (c) => {
  try {
    const elevenLabsAgentId = c.req.param('elevenLabsAgentId');
    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.getByElevenLabsId(elevenLabsAgentId);

    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    return c.json({
      success: true,
      data: agent,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/teachers/:teacherId/agents
 * List all agents for a teacher
 */
app.get('/api/teachers/:teacherId/agents', async (c) => {
  try {
    const teacherId = c.req.param('teacherId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agents = await agentRepo.listByTeacher(teacherId, { limit });

    return c.json({
      success: true,
      count: agents.length,
      data: agents,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list teacher agents',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /agents/:id
 * Update agent configuration
 */
app.patch('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id');
    const updates: UpdateAgentInput = await c.req.json();

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.update(agentId, updates);

    return c.json({
      success: true,
      message: 'Agent updated successfully',
      data: agent,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to update agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * PATCH /api/agents/:id/status
 * Update agent status (after ElevenLabs creation)
 */
app.patch('/api/agents/:id/status', async (c) => {
  try {
    const agentId = c.req.param('id');
    const input: UpdateAgentStatusInput = await c.req.json();

    if (!input.status) {
      return c.json({ error: 'status is required' }, 400);
    }

    // Validate status
    const validStatuses: AgentStatus[] = ['creating', 'active', 'inactive', 'error'];
    if (!validStatuses.includes(input.status)) {
      return c.json({ 
        error: 'Invalid status. Must be: creating, active, inactive, or error' 
      }, 400);
    }

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.updateStatus(agentId, input);

    return c.json({
      success: true,
      message: 'Agent status updated successfully',
      data: agent,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to update agent status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/agents/:id/refresh-knowledge
 * Refresh agent knowledge from updated course
 */
app.post('/api/agents/:id/refresh-knowledge', async (c) => {
  try {
    const agentId = c.req.param('id');

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const agent = await agentRepo.refreshKnowledge(agentId);

    return c.json({
      success: true,
      message: 'Agent knowledge refreshed successfully',
      data: agent,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to refresh agent knowledge',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/agents/:id/stats
 * Get agent statistics
 */
app.get('/api/agents/:id/stats', async (c) => {
  try {
    const agentId = c.req.param('id');

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const stats = await agentRepo.getStats(agentId);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get agent stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


/**
 * GET /api/agents/:id/ready
 * Check if agent is ready to use
 */
app.get('/api/agents/:id/ready', async (c) => {
  try {
    const agentId = c.req.param('id');

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    const isReady = await agentRepo.isReady(agentId);

    return c.json({
      success: true,
      agentId,
      isReady,
      message: isReady ? 'Agent is ready' : 'Agent is not ready yet',
    });
  } catch (error) {
    return c.json({
      error: 'Failed to check agent readiness',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/agents/:id
 * Delete agent
 */
app.delete('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id');

    const agentRepo = new AgentRepository(c.env.KV_CACHE);
    await agentRepo.delete(agentId);

    return c.json({
      success: true,
      message: 'Agent deleted successfully',
      note: 'Remember to also delete the ElevenLabs conversational agent',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to delete agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});


export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
};