// workflow.service.ts
import { AgentRepository } from "../repositories/agent.repository";
import { CourseRepository } from "../repositories/course.repository";
import { SlideRepository } from "../repositories/slide.repository";
import { createConversationalAgent, deleteConversationalAgent, initializeElevenLabsClient, updateConversationalAgent } from "./elevenlabs-integration.service";
import { AgentCreationResult } from "../models/agent.model";
import { NotFoundError, ValidationError } from "../utils/errors";
import { buildAgentSystemPrompt, buildKnowledgeBase, generateAgentDescription, generateAgentName, generateFirstMessage, getRecommendedVoiceId, validateKnowledgeBase } from "../utils/prompt.templates";
import { generateOutline, generateSlides } from "./claude-integration.service";
import { Env } from "../utils/raindrop.gen";


/**
 * Execute agent creation workflow for a course
 *
 * This is the MAIN workflow that creates a complete ElevenLabs agent:
 *
 * Steps:
 * 1. ✅ Validate course exists and has slides
 * 2. ✅ Check if agent already exists (avoid duplicates)
 * 3. ✅ Fetch all slides for the course
 * 4. ✅ Build knowledge base from slides and course content
 * 5. ✅ Validate knowledge base quality
 * 6. ✅ Generate system prompt with teaching strategies
 * 7. ✅ Create ElevenLabs agent via API
 * 8. ✅ Store agent metadata in KV database
 * 9. ✅ Update course record with agent ID
 * 10. ✅ Return result with warnings (if any)
 *
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

  const courseRepo = new CourseRepository(c.mem);
  const slideRepo = new SlideRepository(c.mem);
  const agentRepo = new AgentRepository(c.mem);
  let slidesWereGenerated = false;

  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Validate course exists
    // ────────────────────────────────────────────────────────────
    console.log('📚 [1/10] Validating course...');
    const course = await courseRepo.getById(courseId);
    console.log(`   ✓ Course found: "${course.title}"`);

    // ────────────────────────────────────────────────────────────
    // STEP 2: Check if agent already exists
    // ────────────────────────────────────────────────────────────
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
    // STEP 3: Fetch all slides
    // ────────────────────────────────────────────────────────────
    console.log('📄 [3/10] Fetching slides...');
    let slides = await slideRepo.listByCourse(courseId);

    if (!slides || slides.length === 0) {
      throw new ValidationError(
        `Cannot create agent: No slides found for course ${courseId}. Please generate slides first using the course workflow.`
      );
    }
    console.log(`   ✓ Found ${slides.length} slides`);
    
    // ────────────────────────────────────────────────────────────
    // STEP 4: Build knowledge base
    // ────────────────────────────────────────────────────────────
    console.log('📖 [4/10] Building knowledge base...');
    const knowledgeBase = buildKnowledgeBase(course, slides);
    console.log(`   ✓ Knowledge base built (${knowledgeBase.length} characters)`);

    // ────────────────────────────────────────────────────────────
    // STEP 5: Validate knowledge base quality
    // ────────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────────
    // STEP 6: Generate system prompt
    // ────────────────────────────────────────────────────────────
    console.log('💭 [6/10] Generating system prompt...');
    const systemPrompt = buildAgentSystemPrompt(course, slides, knowledgeBase);
    console.log(`   ✓ System prompt generated (${systemPrompt.length} characters)`);

    // ────────────────────────────────────────────────────────────
    // STEP 7: Generate agent configuration
    // ────────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────────
    // STEP 8: Create ElevenLabs agent via API
    // ────────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────────
    // STEP 9: Store agent metadata in database
    // ────────────────────────────────────────────────────────────
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
    // STEP 10: Update course with agent ID
    // ────────────────────────────────────────────────────────────
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
  const courseRepo = new CourseRepository(c.mem);
  const slideRepo = new SlideRepository(c.mem);
  const agentRepo = new AgentRepository(c.mem);

  try {
    // Get course (via Course API)
    console.log('📚 [1/5] Fetching course...');
    const course = await courseRepo.getById(courseId);
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

  const agentRepo = new AgentRepository(c.mem);
  const courseRepo = new CourseRepository(c.mem);

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
 * @param c - Environment with KV cache and API keys
 */
export async function recreateAgentWorkflow(
  courseId: string,
  teacherId: string,
  voiceId: string | undefined,
  c: Env
): Promise<AgentCreationResult> {
  console.log('🔄 Recreating agent for course:', courseId);

  const agentRepo = new AgentRepository(c.mem);

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
