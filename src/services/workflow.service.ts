import { AgentRepository } from "../repositories/agent.repository";
import { CourseRepository } from "../repositories/course.repository";
import { SlideRepository } from "../repositories/slide.repository";
import { createConversationalAgent, initializeElevenLabsClient } from "./elevenlabs-integration.service";
import { AgentCreationResult } from "../models/agent.model";
import { ValidationError } from "../utils/errors";
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
      console.log('   ⚠️  No slides found - auto-generating from course content...');
      // Check if course has necessary content for generation
      if (!course.knowledgeText || course.knowledgeText.trim().length === 0) {
        throw new ValidationError(
          `Cannot create agent: Course ${courseId} has no slides and no knowledge text to generate from. Please add course content first.`
        );
      }
      // Step 3a: Generate outline from course content
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
      await courseRepo.updateOutline(courseId, {outline: outline});
      console.log('   ✓ Outline saved to course');

      // Step 3b: Generate slides from outline
      console.log('   📝 [3b/10] Generating slides from outline...');
      const generatedSlides = await generateSlides(
        c,
        outline.nodes,
        course.accessibility || 'visual',
        course.knowledgeText
      );
      console.log(`   ✓ Generated ${generatedSlides.length} slides`);

      // Step 3c: Save slides to repository
      console.log('   💾 [3c/10] Saving generated slides...');
      slides = [];
      for (const slideData of generatedSlides) {
        const savedSlide = await slideRepo.create({
            ...slideData,
            courseId: courseId,
        });
        slides.push(savedSlide);
      }
      console.log(`   ✅ Saved ${slides.length} slides to database`);
      slidesWereGenerated = true;
    } else {
      console.log(`   ✓ Found ${slides.length} slides`);
    }
    
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

