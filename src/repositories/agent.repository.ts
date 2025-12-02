// src/repositories/agent.repository.ts
import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import {
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  UpdateAgentStatusInput,
  AgentStatus,
  AgentStats,
  AgentPersonality,
  ElevenLabsConfig,
} from '../models/agent.model';
import { Timestamp } from '../models/common.model';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

export class AgentRepository {
  private kv: KvCache;
  private readonly AGENT_PREFIX = 'agent:';
  private readonly COURSE_AGENT_PREFIX = 'course_agent:';
  private readonly TEACHER_AGENTS_PREFIX = 'teacher_agents:';
  private readonly ELEVENLABS_AGENT_PREFIX = 'elevenlabs_agent:'; // Map ElevenLabs ID to our ID

  constructor(kv: KvCache) {
    this.kv = kv;
  }

  /**
   * Generate a unique agent ID
   */
  private generateId(): string {
    return `agent_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate default system prompt from course
   */
  private async generateSystemPrompt(courseId: string): Promise<string> {
    const courseKey = `course:${courseId}`;
    const courseData = await this.kv.get(courseKey);
    
    if (!courseData) {
      throw new NotFoundError(`Course ${courseId} not found`);
    }
    
    const course = JSON.parse(courseData);
    
    return `You are an AI teaching assistant for "${course.title}".

Your role:
- Answer questions about course material clearly and accurately
- Provide explanations tailored to ${course.accessibility} learners
- Give practical examples and analogies
- Guide students to understanding, don't just give answers
- Be encouraging and patient

Course concepts: ${course.concepts?.join(', ') || 'General course topics'}

Teaching approach:
- Break complex ideas into simple parts
- Use the ${course.accessibility} learning style
- Ask guiding questions to check understanding
- Provide positive reinforcement

Remember: Help students learn, don't just tell them answers.`;
  }

  /**
   * Generate course context from course data
   */
  private async generateCourseContext(courseId: string): Promise<string> {
    const courseKey = `course:${courseId}`;
    const courseData = await this.kv.get(courseKey);
    
    if (!courseData) {
      throw new NotFoundError(`Course ${courseId} not found`);
    }
    
    const course = JSON.parse(courseData);
    
    let context = `# ${course.title}\n\n`;
    
    if (course.description) {
      context += `${course.description}\n\n`;
    }
    
    context += `## Key Concepts\n${course.concepts?.join('\n- ') || ''}\n\n`;
    
    if (course.keywords && course.keywords.length > 0) {
      context += `## Keywords\n${course.keywords.join(', ')}\n\n`;
    }
    
    if (course.knowledgeText) {
      context += `## Knowledge Base\n${course.knowledgeText}\n\n`;
    }
    
    if (course.outline && course.outline.nodes) {
      context += `## Course Structure\n`;
      course.outline.nodes.forEach((node: any) => {
        const indent = '  '.repeat((node.level || 1) - 1);
        context += `${indent}- ${node.title}\n`;
        if (node.description) {
          context += `${indent}  ${node.description}\n`;
        }
      });
    }
    
    return context;
  }

  /**
   * Get slide IDs for a course
   */
  private async getSlideIds(courseId: string): Promise<string[]> {
    const courseKey = `course:${courseId}`;
    const courseData = await this.kv.get(courseKey);
    
    if (!courseData) {
      return [];
    }
    
    const course = JSON.parse(courseData);
    return course.slides || [];
  }

  /**
   * Generate default personality
   */
  private generateDefaultPersonality(courseName: string): AgentPersonality {
    return {
      name: `${courseName} Assistant`,
      description: `Your helpful AI teaching assistant for ${courseName}`,
      tone: 'friendly',
      expertise: ['teaching', 'course content', 'student support'],
      teachingStyle: 'Interactive and encouraging',
      greetingMessage: `Hi! I'm your teaching assistant for ${courseName}. I'm here to help you understand the material. What would you like to learn about?`,
    };
  }

  /**
   * Create a new agent
   */
  async create(input: CreateAgentInput): Promise<Agent> {
    // Check if course already has an agent
    const existingAgent = await this.getByCourse(input.courseId);
    if (existingAgent) {
      throw new ConflictError(
        `Course already has an agent: ${existingAgent.agentId}`
      );
    }

    // Get course to validate and extract info
    const courseKey = `course:${input.courseId}`;
    const courseData = await this.kv.get(courseKey);
    
    if (!courseData) {
      throw new NotFoundError(`Course ${input.courseId} not found`);
    }
    
    const course = JSON.parse(courseData);

    const now: Timestamp = new Date().toISOString();
    const agentId = this.generateId();

    // Generate system prompt and context
    const systemPrompt = input.systemPrompt || await this.generateSystemPrompt(input.courseId);
    const courseContext = await this.generateCourseContext(input.courseId);
    const slideReferences = await this.getSlideIds(input.courseId);

    // Create default personality if not provided
    const defaultPersonality = this.generateDefaultPersonality(course.title);
    const personality: AgentPersonality = {
      ...defaultPersonality,
      ...input.personality,
      name: input.name || defaultPersonality.name,
      greetingMessage: input.personality?.greetingMessage || defaultPersonality.greetingMessage,
    };

    // ElevenLabs configuration
    const elevenLabsConfig: ElevenLabsConfig = {
      agentId: '', // Will be set when ElevenLabs agent is created
      voiceId: input.voiceId || 'pNInz6obpgDQGcFmaJgB', // Default ElevenLabs voice
      firstMessage: input.firstMessage || personality.greetingMessage,
      language: input.language || 'en',
      maxDuration: 3600, // 1 hour default
    };

    const agent: Agent = {
      agentId,
      courseId: input.courseId,
      teacherId: input.teacherId,
      elevenLabsConfig,
      name: input.name || personality.name,
      personality,
      systemPrompt,
      courseContext,
      slideReferences,
      canNavigateSlides: true,
      canAnswerQuestions: true,
      canProvideExamples: true,
      canGiveFeedback: true,
      status: 'creating', // Will be updated to 'active' after ElevenLabs creation
      totalConversations: 0,
      totalInteractions: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Store agent data
    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.put(agentKey, JSON.stringify(agent));

    // Create indexes
    await this.kv.put(`${this.COURSE_AGENT_PREFIX}${input.courseId}`, agentId);
    await this.kv.put(`${this.TEACHER_AGENTS_PREFIX}${input.teacherId}:${agentId}`, agentId);

    return agent;
  }

  /**
   * Get agent by ID
   */
  async getById(agentId: string): Promise<Agent> {
    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    const agentData = await this.kv.get(agentKey);

    if (!agentData) {
      throw new NotFoundError(`Agent with ID ${agentId} not found`);
    }

    return JSON.parse(agentData) as Agent;
  }

  /**
   * Get agent by ElevenLabs agent ID
   */
  async getByElevenLabsId(elevenLabsAgentId: string): Promise<Agent | null> {
    const mappingKey = `${this.ELEVENLABS_AGENT_PREFIX}${elevenLabsAgentId}`;
    const agentId = await this.kv.get(mappingKey);

    if (!agentId) {
      return null;
    }

    try {
      return await this.getById(agentId);
    } catch (error) {
      await this.kv.delete(mappingKey);
      return null;
    }
  }

  /**
   * Get agent by course
   */
  async getByCourse(courseId: string): Promise<Agent | null> {
    const courseAgentKey = `${this.COURSE_AGENT_PREFIX}${courseId}`;
    const agentId = await this.kv.get(courseAgentKey);

    if (!agentId) {
      return null;
    }

    try {
      return await this.getById(agentId);
    } catch (error) {
      await this.kv.delete(courseAgentKey);
      return null;
    }
  }

  /**
   * Update agent
   */
  async update(agentId: string, updates: UpdateAgentInput): Promise<Agent> {
    const existingAgent = await this.getById(agentId);

    // Update ElevenLabs config if voice or message changed
    const updatedElevenLabsConfig = { ...existingAgent.elevenLabsConfig };
    if (updates.voiceId) updatedElevenLabsConfig.voiceId = updates.voiceId;
    if (updates.firstMessage) updatedElevenLabsConfig.firstMessage = updates.firstMessage;
    if (updates.language) updatedElevenLabsConfig.language = updates.language;

    const updatedAgent: Agent = {
      ...existingAgent,
      name: updates.name ?? existingAgent.name,
      systemPrompt: updates.systemPrompt ?? existingAgent.systemPrompt,
      courseContext: updates.courseContext ?? existingAgent.courseContext,
      elevenLabsConfig: updatedElevenLabsConfig,
      canNavigateSlides: updates.canNavigateSlides ?? existingAgent.canNavigateSlides,
      canAnswerQuestions: updates.canAnswerQuestions ?? existingAgent.canAnswerQuestions,
      canProvideExamples: updates.canProvideExamples ?? existingAgent.canProvideExamples,
      canGiveFeedback: updates.canGiveFeedback ?? existingAgent.canGiveFeedback,
      personality: updates.personality 
        ? { ...existingAgent.personality, ...updates.personality }
        : existingAgent.personality,
      updatedAt: new Date().toISOString(),
    };

    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.put(agentKey, JSON.stringify(updatedAgent));

    return updatedAgent;
  }

  /**
   * Update agent status (including ElevenLabs agent ID after creation)
   */
  async updateStatus(agentId: string, input: UpdateAgentStatusInput): Promise<Agent> {
    const agent = await this.getById(agentId);

    // Update ElevenLabs agent ID if provided
    if (input.elevenLabsAgentId && input.elevenLabsAgentId !== agent.elevenLabsConfig.agentId) {
      // Remove old mapping if exists
      if (agent.elevenLabsConfig.agentId) {
        await this.kv.delete(`${this.ELEVENLABS_AGENT_PREFIX}${agent.elevenLabsConfig.agentId}`);
      }
      
      // Create new mapping
      agent.elevenLabsConfig.agentId = input.elevenLabsAgentId;
      await this.kv.put(`${this.ELEVENLABS_AGENT_PREFIX}${input.elevenLabsAgentId}`, agentId);
    }

    agent.status = input.status;
    agent.errorMessage = input.errorMessage;
    agent.updatedAt = new Date().toISOString();

    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.put(agentKey, JSON.stringify(agent));

    return agent;
  }

  /**
   * Refresh agent knowledge (re-generate context from course)
   */
  async refreshKnowledge(agentId: string): Promise<Agent> {
    const agent = await this.getById(agentId);

    const courseContext = await this.generateCourseContext(agent.courseId);
    const slideReferences = await this.getSlideIds(agent.courseId);

    agent.courseContext = courseContext;
    agent.slideReferences = slideReferences;
    agent.updatedAt = new Date().toISOString();

    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.put(agentKey, JSON.stringify(agent));

    return agent;
  }

  /**
   * Delete agent
   */
  async delete(agentId: string): Promise<void> {
    const agent = await this.getById(agentId);

    // Delete agent data
    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.delete(agentKey);

    // Delete indexes
    await this.kv.delete(`${this.COURSE_AGENT_PREFIX}${agent.courseId}`);
    await this.kv.delete(`${this.TEACHER_AGENTS_PREFIX}${agent.teacherId}:${agentId}`);
    
    // Delete ElevenLabs mapping if exists
    if (agent.elevenLabsConfig.agentId) {
      await this.kv.delete(`${this.ELEVENLABS_AGENT_PREFIX}${agent.elevenLabsConfig.agentId}`);
    }
  }

  /**
   * List agents by teacher
   */
  async listByTeacher(teacherId: string, options?: { limit?: number }): Promise<Agent[]> {
    const prefix = `${this.TEACHER_AGENTS_PREFIX}${teacherId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const agents: Agent[] = [];
    for (const key of result.keys) {
      try {
        const agentId = key.name.split(':').pop() || '';
        const agent = await this.getById(agentId);
        agents.push(agent);
      } catch (error) {
        console.error(`Error fetching agent from key ${key.name}:`, error);
      }
    }

    return agents.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Increment conversation count
   */
  async incrementConversationCount(agentId: string): Promise<void> {
    const agent = await this.getById(agentId);
    
    agent.totalConversations += 1;
    agent.lastUsedAt = new Date().toISOString();
    agent.updatedAt = new Date().toISOString();

    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.put(agentKey, JSON.stringify(agent));
  }

  /**
   * Increment interaction count
   */
  async incrementInteractionCount(agentId: string): Promise<void> {
    const agent = await this.getById(agentId);
    
    agent.totalInteractions += 1;
    agent.lastUsedAt = new Date().toISOString();
    agent.updatedAt = new Date().toISOString();

    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.put(agentKey, JSON.stringify(agent));
  }

  /**
   * Update agent rating
   */
  async updateRating(agentId: string, newRating: number): Promise<void> {
    const agent = await this.getById(agentId);
    
    if (agent.averageRating === undefined) {
      agent.averageRating = newRating;
    } else {
      const totalRatings = agent.totalInteractions || 1;
      agent.averageRating = 
        (agent.averageRating * (totalRatings - 1) + newRating) / totalRatings;
    }
    
    agent.updatedAt = new Date().toISOString();

    const agentKey = `${this.AGENT_PREFIX}${agentId}`;
    await this.kv.put(agentKey, JSON.stringify(agent));
  }

  /**
   * Get agent statistics
   */
  async getStats(agentId: string): Promise<AgentStats> {
    const agent = await this.getById(agentId);

    return {
      agentId: agent.agentId,
      elevenLabsAgentId: agent.elevenLabsConfig.agentId,
      totalConversations: agent.totalConversations,
      totalInteractions: agent.totalInteractions,
      averageRating: agent.averageRating,
      lastUsedAt: agent.lastUsedAt,
      status: agent.status,
    };
  }

  /**
   * Check if agent is ready to use
   */
  async isReady(agentId: string): Promise<boolean> {
    try {
      const agent = await this.getById(agentId);
      return agent.status === 'active' && !!agent.elevenLabsConfig.agentId;
    } catch (error) {
      return false;
    }
  }
}