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
import {
  generateOutline,
  generateSlides
} from '../services/course-generation.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import { Course } from '../models/course.model';

/**
 * Result type for agent creation workflow
 */
export interface AgentCreationResult {
  agentId: string;
  elevenLabsAgentId: string;
  status: 'created' | 'exists';
  message: string;
  warnings?: string[];
  generatedSlides?: boolean;
}

/**
 * Fetch course from Course API
 */
async function fetchCourseFromAPI(courseId: string, c: Env): Promise<Course> {
  const response = await fetch(`${c.COURSE_SERVICE_URL}/api/courses/${courseId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new NotFoundError(`Course ${courseId} not found!`);
    }
    throw new Error(`Failed to fetch course: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.data; // Assuming response format: { success: true, data: Course }
}

/**
 * Fetch slides from Course API
 */
async function fetchSlidesFromAPI(courseId: string, c: Env): Promise<Slide[]> {
  const response = await fetch(`${c.COURSE_SERVICE_URL}/api/courses/${courseId}/slides`);

  if (!response.ok) {
    throw new Error(`Failed to fetch slides: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.data || []; // Assuming response format: { success: true, data: Slide[] }
}

/**
 * Create slides via Course API
 */
async function createSlidesViaAPI(
  courseId: string,
  slides: Slide[],
  c: Env
): Promise<Slide[]> {
  const createdSlides: Slide[] = [];

  for (const slideData of slides) {
    const response = await fetch(`${c.COURSE_SERVICE_URL}/api/slides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...slideData,
        courseId: courseId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create slide: ${response.statusText}`);
    }

    const result = await response.json() as any;
    createdSlides.push(result.data);
  }

  return createdSlides;
}

/**
 * Update course outline via Course API
 */
async function updateCourseOutlineViaAPI(
  courseId: string,
  outline: any,
  c: Env
): Promise<void> {
  const response = await fetch(`${c.COURSE_SERVICE_URL}/api/courses/${courseId}/outline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ outline }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update course outline: ${response.statusText}`);
  }
}

/**
 * Update course agent info via Course API
 */
async function updateCourseAgentViaAPI(
  courseId: string,
  agentId: string,
  voiceId: string,
  c: Env
): Promise<void> {
  const response = await fetch(`${c.COURSE_SERVICE_URL}/api/courses/${courseId}/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentId,
      voiceId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update course with agent info: ${response.statusText}`);
  }
}

/**
 * Execute agent creation workflow for a course
 *
 * This is the MAIN workflow that creates a complete ElevenLabs agent:
 *
 * Steps:
 * 1. ✅ Validate course exists and has slides (via Course API)
 * 2. ✅ Check if agent already exists (avoid duplicates)
 * 3. ✅ Fetch all slides for the course (AUTO-GENERATE if missing via Course API)
 * 4. ✅ Build knowledge base from slides and course content
 * 5. ✅ Validate knowledge base quality
 * 6. ✅ Generate system prompt with teaching strategies
 * 7. ✅ Create ElevenLabs agent via API
 * 8. ✅ Store agent metadata in KV database
 * 9. ✅ Update course record with agent ID (via Course API)
 * 10. ✅ Return result with warnings (if any)
 *
 * @param courseId - Course ID to create agent for
 * @param teacherId - Teacher who owns the course
 * @param voiceId - Optional ElevenLabs voice ID (uses recommendation if not provided)
 * @param c - Environment with KV cache and API keys
 * @returns Agent creation result
 */
export async function executeAgentCreationWorkflow(
  courseId: string,
  teacherId: string,
  voiceId: string | undefined,
  c: Env
): Promise<AgentCreationResult> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 AGENT CREATION WORKFLOW STARTED`);
  console.log(`   Course ID: ${courseId}`);
  console.log(`   Teacher ID: ${teacherId}`);
  console.log(`   Voice ID: ${voiceId || 'auto-select'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Initialize ElevenLabs client
  initializeElevenLabsClient(c.ELEVENLABS_API_KEY);
  const agentRepo = new AgentRepository(c.KV_CACHE);
  let slidesWereGenerated = false;

  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Validate course exists (via Course API)
    // ────────────────────────────────────────────────────────────
    console.log('📚 [1/10] Validating course...');
    const course = await fetchCourseFromAPI(courseId, c);
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

    // ────────────────────────────────────────────────────────────
    // STEP 3: Fetch or generate slides (via Course API)
    // ────────────────────────────────────────────────────────────
    console.log('📄 [3/10] Fetching slides...');
    let slides = await fetchSlidesFromAPI(courseId, c);

    if (!slides || slides.length === 0) {
      console.log('   ⚠️  No slides found - auto-generating from course content...');

      // Check if course has necessary content for generation
      if (!course.knowledgeText || course.knowledgeText.trim().length === 0) {
        throw new ValidationError(
          `Cannot create agent: Course ${courseId} has no slides and no knowledge text to generate from. Please add course content first.`
        );
      }

      console.log('   🧠 [3a/10] Generating course outline...');
      const outline = course.outline
        ? course.outline
        : await generateOutline(
          c,
          course.knowledgeText,
          course.concepts || [],
          course.accessibility || 'visual',
          course.keywords,
        );
      console.log(`   ✓ Generated outline with ${outline.nodes.length} nodes`);
      await updateCourseOutlineViaAPI(courseId, outline, c);
      console.log('   ✓ Outline saved to course');

      console.log('   📝 [3b/10] Generating slides from outline...');
      const generatedSlides = await generateSlides(
          c,
          outline.nodes,
          course.accessibility || 'visual',
          course.knowledgeText,
        );
      console.log(`   ✓ Generated ${generatedSlides.length} slides`);

      console.log('   💾 [3c/10] Saving generated slides...');
      slides = await createSlidesViaAPI(courseId, generatedSlides, c);
      console.log(`   ✅ Saved ${slides.length} slides to database`);
      slidesWereGenerated = true;
    } else {
      console.log(`   ✓ Found ${slides.length} existing slides`);
    }

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

    // ────────────────────────────────────────────────────────────
    // STEP 10: Update course with agent ID (via Course API)
    // ────────────────────────────────────────────────────────────
    console.log('📝 [10/10] Updating course record...');
    await updateCourseAgentViaAPI(courseId, agentId, selectedVoiceId, c);
    console.log(`   ✓ Course updated with agent ID`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AGENT CREATION WORKFLOW COMPLETED');
    console.log(`   Internal Agent ID: ${agentId}`);
    console.log(`   ElevenLabs Agent ID: ${elevenLabsAgent.agentId}`);
    console.log(`   Course: ${course.title}`);
    console.log(`   Slides: ${slides.length}${slidesWereGenerated ? ' (auto-generated)' : ''}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
      agentId,
      elevenLabsAgentId: elevenLabsAgent.agentId,
      status: 'created',
      message: slidesWereGenerated
        ? 'Agent created successfully with auto-generated slides'
        : 'Agent created successfully',
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      generatedSlides: slidesWereGenerated,
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
 * @param c - Environment with KV cache and API keys
 */
export async function refreshAgentKnowledgeWorkflow(
  courseId: string,
  c: Env
): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔄 AGENT KNOWLEDGE REFRESH WORKFLOW STARTED`);
  console.log(`   Course ID: ${courseId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  initializeElevenLabsClient(c.ELEVENLABS_API_KEY);

  const agentRepo = new AgentRepository(c.KV_CACHE);

  try {
    // Get course (via Course API)
    console.log('📚 [1/5] Fetching course...');
    const course = await fetchCourseFromAPI(courseId, c);
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

    // Get updated slides (via Course API)
    console.log('📄 [3/5] Fetching updated slides...');
    const slides = await fetchSlidesFromAPI(courseId, c);
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
 * 3. Update the course to remove agent reference (via Course API)
 *
 * @param agentId - Internal agent ID
 * @param c - Environment with KV cache and API keys
 */
export async function deleteAgentWorkflow(
  agentId: string,
  c: Env
): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🗑️  AGENT DELETION WORKFLOW STARTED`);
  console.log(`   Agent ID: ${agentId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  initializeElevenLabsClient(c.ELEVENLABS_API_KEY);

  const agentRepo = new AgentRepository(c.KV_CACHE);

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

    // Update course to remove agent reference (via Course API)
    try {
      const course = await fetchCourseFromAPI(agent.courseId, c);
      if (course && course.agentId === agentId) {
        await updateCourseAgentViaAPI(agent.courseId, '', course.voiceId || '', c);
        console.log(`   ✅ Removed agent reference from course`);
      }
    } catch (error) {
      console.log(`   ⚠️  Could not update course (may have been deleted)`);
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
 * @param c - Environment with KV cache and API keys
 */
export async function recreateAgentWorkflow(
  courseId: string,
  teacherId: string,
  voiceId: string | undefined,
  c: Env
): Promise<AgentCreationResult> {
  console.log('🔄 Recreating agent for course:', courseId);

  const agentRepo = new AgentRepository(c.KV_CACHE);

  try {
    // Find and delete old agent
    const existingAgent = await agentRepo.getByCourse(courseId);

    if (existingAgent) {
      console.log(`   Deleting old agent: ${existingAgent.agentId}`);
      await deleteAgentWorkflow(existingAgent.agentId, c);
    }

    // Create new agent
    console.log('   Creating new agent...');
    return await executeAgentCreationWorkflow(
      courseId,
      teacherId,
      voiceId,
      c
    );
  } catch (error) {
    console.error('❌ Recreate workflow failed:', error);
    throw error;
  }
}
