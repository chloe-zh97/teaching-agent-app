/**
 * Agent Workflow Service
 * Orchestrates the multi-step process of creating and managing ElevenLabs agents
 *
 * This is the CORE workflow that ties everything together:
 * Course → Slides → Knowledge Base → Prompt → ElevenLabs Agent → Database Storage
 */

import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import { CourseRepository } from '../repositories/course.repository';
import { SlideRepository } from '../repositories/slide.repository';
import { AgentRepository } from '../repositories/agent.repository';
import { Slide } from '../models/slide.model';
import { Env } from '../utils/raindrop.gen';
import {
  createConversationalAgent,
  updateConversationalAgent,
  deleteConversationalAgent,
  initializeElevenLabsClient,
} from '../services/elevenlabs.service';
import {
  buildKnowledgeBase,
  buildAgentSystemPrompt,
  generateAgentName,
  generateFirstMessage,
  validateKnowledgeBase,
  getRecommendedVoiceId,
  generateAgentDescription,
} from '../services/prompt.templates';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';

/**
 * Result type for agent creation workflow
 */
export interface AgentCreationResult {
  agentId: string;
  elevenLabsAgentId: string;
  status: 'created' | 'exists';
  message: string;
  warnings?: string[];
}

/**
 * Fetch slides by course ID from external course service
 */
async function fetchSlidesByCourseId(courseId: string, c: Env): Promise<Slide[]> {
  const courseIdfix = "course_1765157269981-f5zl920nu";

  const response = await fetch(`${c.COURSE_SERVICE_URL}/api/courses/${courseIdfix}/slides`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new NotFoundError(`Slides of ${courseId} not found!`);
    }
    throw new Error(`Failed to fetch course slides: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.data; // Assuming response format: { success: true, data: Course }
}

/**

 * @param courseId - Course ID to create agent for
 * @param teacherId - Teacher who owns the course
 * @param voiceId - Optional ElevenLabs voice ID (uses recommendation if not provided)
 * @param kvCache - Cloudflare KV namespace
 * @param elevenLabsApiKey - ElevenLabs API key from environment
 * @returns Agent creation result
 */
export async function executeAgentCreationWorkflow(
  courseId: string,
  teacherId: string,
  voiceId: string | undefined,
  kvCache: KvCache,
  elevenLabsApiKey: string
): Promise<AgentCreationResult> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 AGENT CREATION WORKFLOW STARTED`);
  console.log(`   Course ID: ${courseId}`);
  console.log(`   Teacher ID: ${teacherId}`);
  console.log(`   Voice ID: ${voiceId || 'auto-select'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Initialize ElevenLabs client
  initializeElevenLabsClient(elevenLabsApiKey);

  const courseRepo = new CourseRepository(kvCache);
  const slideRepo = new SlideRepository(kvCache);
  const agentRepo = new AgentRepository(kvCache);

  try {
    console.log('📚 [1/10] Validating course...');
    const course = await courseRepo.getById(courseId);
    if (!course) {
      throw new NotFoundError(`Course ${courseId} not found`);
    }
    console.log(`   ✓ Course found: "${course.title}"`);

// if agent already exists
    console.log('🔍 [2/10] Checking for existing agent...');
    const existingAgent = await agentRepo.getByCourse(courseId);

    if (existingAgent && existingAgent.elevenLabsConfig.agentId) {
      console.log(`   ⚠️  Agent already exists!`);
      console.log(`   Agent ID: ${existingAgent.agentId}`);
      console.log(`   ElevenLabs ID: ${existingAgent.elevenLabsConfig.agentId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        agentId: existingAgent.agentId,
        elevenLabsAgentId: existingAgent.elevenLabsConfig.agentId,
        status: 'exists',
        message: 'Agent already created for this course',
      };
    }
    console.log('   ✓ No existing agent found');


    console.log('📄 [3/10] Fetching slides...');
    const slides = await slideRepo.listByCourse(courseId);

    if (!slides || slides.length === 0) {
      throw new ValidationError(
        `Cannot create agent: No slides found for course ${courseId}. Please generate slides first using the course workflow.`
      );
    }
    console.log(`   ✓ Found ${slides.length} slides`);


    console.log('📖 [4/10] Building knowledge base...');
    const knowledgeBase = buildKnowledgeBase(course, slides);
    console.log(`   ✓ Knowledge base built (${knowledgeBase.length} characters)`);

    console.log('✔️  [5/10] Validating knowledge base quality...');
    const validation = validateKnowledgeBase(course, slides);

    if (!validation.isValid) {
      throw new ValidationError(
        `Knowledge base validation failed: ${validation.warnings.join(', ')}`
      );
    }

    if (validation.warnings.length > 0) {
      console.log('   ⚠️  Warnings:');
      validation.warnings.forEach((warning) => console.log(`      - ${warning}`));
    } else {
      console.log('   ✓ Knowledge base validated');
    }

    console.log('💭 [6/10] Generating system prompt...');
    const systemPrompt = buildAgentSystemPrompt(course, slides, knowledgeBase);
    console.log(`   ✓ System prompt generated (${systemPrompt.length} characters)`);

    console.log('⚙️  [7/10] Preparing agent configuration...');
    const agentName = generateAgentName(course);
    const firstMessage = generateFirstMessage(course);

    const normalizedVoiceId = 
      !voiceId || voiceId === 'default' || (typeof voiceId === 'string' && voiceId.trim() === '')
        ? undefined
        : voiceId;

    // Use provided voice ID, or fall back to course voice, or auto-select based on accessibility
    const selectedVoiceId =
      normalizedVoiceId || course.voiceId || getRecommendedVoiceId(course.accessibility || 'visual');

    console.log(`   ✓ Agent name: "${agentName}"`);
    console.log(`   ✓ Voice ID: ${selectedVoiceId}`);
    console.log(`   ✓ First message: "${firstMessage.substring(0, 50)}..."`);

    console.log('🎙️  [8/10] Creating ElevenLabs agent...');
    const elevenLabsAgent = await createConversationalAgent({
      name: agentName,
      systemPrompt,
      voiceId: selectedVoiceId,
      firstMessage,
      language: 'en',
    });

    console.log(`   ✅ ElevenLabs agent created!`);
    console.log(`   Agent ID: ${elevenLabsAgent.agentId}`);

    console.log('💾 [9/10] Storing agent metadata...');
    let agentId: string;

    if (existingAgent) {
      // Update existing agent record with ElevenLabs ID
      await agentRepo.updateStatus(existingAgent.agentId, {
        status: 'active',
        elevenLabsAgentId: elevenLabsAgent.agentId,
      });
      agentId = existingAgent.agentId;
      console.log(`   ✓ Updated existing agent record: ${agentId}`);
    } else {
      // Create new agent record
      const agent = await agentRepo.create({
        courseId,
        teacherId,
        voiceId: selectedVoiceId,
        personality: {
          name: agentName,
          description: generateAgentDescription(course),
          tone: 'friendly',
          expertise: course.concepts,
          teachingStyle: `Optimized for ${course.accessibility} learners`,
          greetingMessage: firstMessage,
        },
      });

      // Update with ElevenLabs ID and set to active
      await agentRepo.updateStatus(agent.agentId, {
        status: 'active',
        elevenLabsAgentId: elevenLabsAgent.agentId,
      });

      agentId = agent.agentId;
      console.log(`   ✓ Created new agent record: ${agentId}`);
    }

    console.log('📝 [10/10] Updating course record...');
    await courseRepo.updateAgent(courseId, {
      agentId,
      voiceId: selectedVoiceId,
    });
    console.log(`   ✓ Course updated with agent ID`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AGENT CREATION WORKFLOW COMPLETED');
    console.log(`   Internal Agent ID: ${agentId}`);
    console.log(`   ElevenLabs Agent ID: ${elevenLabsAgent.agentId}`);
    console.log(`   Course: ${course.title}`);
    console.log(`   Slides: ${slides.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
      agentId,
      elevenLabsAgentId: elevenLabsAgent.agentId,
      status: 'created',
      message: 'Agent created successfully',
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ AGENT CREATION WORKFLOW FAILED');
    console.error(`   Course ID: ${courseId}`);
    console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw error;
  }
}

/**
 * Refresh agent knowledge base workflow
 *
 * Use this when:
 * - Course content has been updated
 * - Slides have been added/removed/modified
 * - Teaching strategy needs adjustment
 *
 * This will update the ElevenLabs agent with fresh knowledge base and prompt
 *
 * @param courseId - Course ID
 * @param kvCache - Cloudflare KV namespace
 * @param elevenLabsApiKey - ElevenLabs API key
 */
export async function refreshAgentKnowledgeWorkflow(
  courseId: string,
  kvCache: KvCache,
  elevenLabsApiKey: string
): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔄 AGENT KNOWLEDGE REFRESH WORKFLOW STARTED`);
  console.log(`   Course ID: ${courseId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  initializeElevenLabsClient(elevenLabsApiKey);

  const courseRepo = new CourseRepository(kvCache);
  const slideRepo = new SlideRepository(kvCache);
  const agentRepo = new AgentRepository(kvCache);

  try {
    // Get course
    console.log('📚 [1/5] Fetching course...');
    const course = await courseRepo.getById(courseId);
    if (!course) {
      throw new NotFoundError(`Course ${courseId} not found`);
    }
    console.log(`   ✓ Course: "${course.title}"`);

    // Get agent
    console.log('🤖 [2/5] Fetching agent...');
    const agent = await agentRepo.getByCourse(courseId);
    if (!agent || !agent.elevenLabsConfig.agentId) {
      throw new NotFoundError(
        `No active agent found for course ${courseId}. Create an agent first.`
      );
    }
    console.log(`   ✓ Agent ID: ${agent.agentId}`);
    console.log(`   ✓ ElevenLabs ID: ${agent.elevenLabsConfig.agentId}`);

    // Get updated slides
    console.log('📄 [3/5] Fetching updated slides...');
    const slides = await slideRepo.listByCourse(courseId);
    if (!slides || slides.length === 0) {
      throw new ValidationError(`No slides found for course ${courseId}`);
    }
    console.log(`   ✓ Found ${slides.length} slides`);

    // Rebuild knowledge base and prompt
    console.log('🔨 [4/5] Rebuilding knowledge base and prompt...');
    const knowledgeBase = buildKnowledgeBase(course, slides);
    const systemPrompt = buildAgentSystemPrompt(course, slides, knowledgeBase);
    console.log(`   ✓ Knowledge base: ${knowledgeBase.length} chars`);
    console.log(`   ✓ System prompt: ${systemPrompt.length} chars`);

    // Update ElevenLabs agent
    console.log('☁️  [5/5] Updating ElevenLabs agent...');
    await updateConversationalAgent(agent.elevenLabsConfig.agentId, {
      systemPrompt,
    });
    console.log(`   ✅ ElevenLabs agent updated`);

    // Update agent metadata in database
    await agentRepo.refreshKnowledge(agent.agentId);
    console.log(`   ✅ Database metadata updated`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AGENT KNOWLEDGE REFRESH COMPLETED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ AGENT KNOWLEDGE REFRESH FAILED');
    console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw error;
  }
}

/**
 * Delete agent workflow (complete cleanup)
 *
 * This will:
 * 1. Delete the agent from ElevenLabs
 * 2. Delete the agent record from database
 * 3. Update the course to remove agent reference
 *
 * @param agentId - Internal agent ID
 * @param kvCache - Cloudflare KV namespace
 * @param elevenLabsApiKey - ElevenLabs API key
 */
export async function deleteAgentWorkflow(
  agentId: string,
  kvCache: KvCache,
  elevenLabsApiKey: string
): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🗑️  AGENT DELETION WORKFLOW STARTED`);
  console.log(`   Agent ID: ${agentId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  initializeElevenLabsClient(elevenLabsApiKey);

  const agentRepo = new AgentRepository(kvCache);
  const courseRepo = new CourseRepository(kvCache);

  try {
    // Get agent
    console.log('🔍 [1/3] Fetching agent...');
    const agent = await agentRepo.getById(agentId);
    if (!agent) {
      throw new NotFoundError(`Agent ${agentId} not found`);
    }
    console.log(`   ✓ Agent found for course: ${agent.courseId}`);

    // Delete from ElevenLabs if exists
    if (agent.elevenLabsConfig.agentId) {
      console.log('☁️  [2/3] Deleting from ElevenLabs...');
      await deleteConversationalAgent(agent.elevenLabsConfig.agentId);
      console.log(`   ✅ Deleted from ElevenLabs`);
    } else {
      console.log('   ⚠️  No ElevenLabs agent ID (skipping external deletion)');
    }

    // Delete from database
    console.log('💾 [3/3] Deleting from database...');
    await agentRepo.delete(agentId);
    console.log(`   ✅ Deleted from database`);

    // Update course to remove agent reference
    const course = await courseRepo.getById(agent.courseId);
    if (course && course.agentId === agentId) {
      await courseRepo.updateAgent(agent.courseId, {
        agentId: undefined,
        voiceId: course.voiceId,
      });
      console.log(`   ✅ Removed agent reference from course`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AGENT DELETION WORKFLOW COMPLETED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ AGENT DELETION WORKFLOW FAILED');
    console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw error;
  }
}

/**
 * Recreate agent workflow
 *
 * Use this to completely recreate an agent from scratch
 * Useful when you need to:
 * - Change voice ID
 * - Fix a broken agent
 * - Start fresh after major course changes
 *
 * @param courseId - Course ID
 * @param teacherId - Teacher ID
 * @param voiceId - Optional new voice ID
 * @param kvCache - Cloudflare KV namespace
 * @param elevenLabsApiKey - ElevenLabs API key
 */
export async function recreateAgentWorkflow(
  courseId: string,
  teacherId: string,
  voiceId: string | undefined,
  kvCache: KvCache,
  elevenLabsApiKey: string
): Promise<AgentCreationResult> {
  console.log('🔄 Recreating agent for course:', courseId);

  const agentRepo = new AgentRepository(kvCache);

  try {
    // Find and delete old agent
    const existingAgent = await agentRepo.getByCourse(courseId);

    if (existingAgent) {
      console.log(`   Deleting old agent: ${existingAgent.agentId}`);
      await deleteAgentWorkflow(existingAgent.agentId, kvCache, elevenLabsApiKey);
    }

    // Create new agent
    console.log('   Creating new agent...');
    return await executeAgentCreationWorkflow(courseId, teacherId, voiceId, kvCache, elevenLabsApiKey);
  } catch (error) {
    console.error('❌ Recreate workflow failed:', error);
    throw error;
  }
}
