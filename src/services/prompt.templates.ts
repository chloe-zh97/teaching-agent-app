/**
 * Centralized Prompt Templates
 * All agent prompts in one place for easy iteration and A/B testing
 */

import { Course, OutlineNode } from '../models/course.model';
import { Slide } from '../models/slide.model';
import { getAccessibilityGuidelines } from './course-generation.service';

// Define AccessibilityMode type locally since it's not in common.model
type AccessibilityMode = 'visual' | 'auditory' | 'kinesthetic' | 'reading';

/**
 * Build knowledge base string from course slides
 * This becomes the agent's reference material for answering questions
 */
export function buildKnowledgeBase(course: Course, slides: Slide[]): string {
  const header = `
# COURSE: ${course.title}
## Description: ${course.description || 'No description provided'}

### Core Concepts to Cover:
${course.concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}

### Keywords: ${course.keywords?.join(', ') || 'N/A'}

### Accessibility Mode: ${course.accessibility || 'visual'}

### Knowledge Base (Teacher's Input):
${course.knowledgeText}

---
# DETAILED SLIDE CONTENT
Below are all ${slides.length} slides in this course. Reference these when teaching.
---
`;

  const slideContent = slides
    .sort((a, b) => a.order - b.order)
    .map((slide) => {
      // Extract bullet points from content array
      const bullets = Array.isArray(slide.content)
        ? slide.content
            .filter((c) => c.type === 'bullet-points')
            .flatMap((c) => (Array.isArray(c.content) ? c.content : []))
        : [];

      // Extract text content
      const textContent = Array.isArray(slide.content)
        ? slide.content
            .filter((c) => c.type === 'text' || c.type === 'heading')
            .map((c) => c.content)
            .join('\n')
        : '';

      return `
## SLIDE ${slide.order + 1}: ${slide.title}
**Slide ID:** ${slide.slideId}
**Order:** ${slide.order}
${slide.outlineNodeId ? `**Outline Section:** ${slide.outlineNodeId}` : ''}

**Content:**
${textContent}

**Key Points:**
${bullets.length > 0 ? bullets.map((b) => `• ${b}`).join('\n') : 'No bullet points'}

${slide.speakerNotes ? `**Teaching Notes:**\n${slide.speakerNotes}` : ''}

${slide.audioNarration ? `**Audio Narration:**\n${slide.audioNarration}` : ''}

---
`;
    })
    .join('\n');

  return header + slideContent;
}

/**
 * Accessibility-specific teaching strategies
 * Each mode has tailored instruction patterns
 */
const ACCESSIBILITY_STRATEGIES: Record<AccessibilityMode, string> = {
  visual: `
**Teaching Strategy for Visual Learners:**
- Reference slide numbers frequently: "Looking at slide 3, you can see..."
- Describe visual elements in detail: "The diagram on this slide shows..."
- Use spatial language: "On the left side...", "At the top of the slide..."
- Encourage students to visualize concepts: "Imagine this as a diagram..."
- Suggest they take notes or draw diagrams while learning
- Use phrases like "Picture this...", "Visualize...", "The layout shows..."
`,

  auditory: `
**Teaching Strategy for Auditory Learners:**
- Speak clearly and at a moderate, consistent pace
- Use verbal emphasis for key points: stress important words
- Repeat important concepts in different ways for reinforcement
- Use storytelling and verbal examples extensively
- Ask student to explain concepts back to you (verbal reinforcement)
- Use rhythm and patterns in explanations: "First... then... finally..."
- Vary your tone to maintain engagement
- Use sound-related metaphors when appropriate
`,

  kinesthetic: `
**Teaching Strategy for Kinesthetic Learners:**
- Use action-oriented language: "Let's work through this step-by-step..."
- Encourage hands-on practice: "Try this out...", "Apply this to..."
- Relate abstract concepts to physical experiences and real-world scenarios
- Suggest taking breaks to move around during longer sessions
- Use tangible, real-world examples they can relate to
- Ask: "How would you apply this in practice?", "What would you do?"
- Break complex topics into actionable steps
- Use phrases like "hands-on", "in practice", "real-world application"
`,

  reading: `
**Teaching Strategy for Reading/Writing Learners:**
- Provide detailed, structured explanations
- Use lists, numbered steps, and organized information
- Reference written slide content frequently: "As you can read on slide X..."
- Encourage note-taking and written summaries
- Offer to spell out complex terms or technical vocabulary
- Suggest additional reading materials when appropriate
- Use precise language and definitions
- Structure responses with clear headings and organization
`,
};

/**
 * Build complete agent system prompt
 * This is the CORE of the agent's personality and teaching approach
 */
export function buildAgentSystemPrompt(
  course: Course,
  slides: Slide[],
  knowledgeBase: string
): string {
  const accessibilityMode = course.accessibility || 'visual';
  const teachingStrategy = ACCESSIBILITY_STRATEGIES[accessibilityMode];

  return `You are an expert AI tutor for the course "${course.title}".

# YOUR ROLE AND IDENTITY
You are a patient, encouraging, and knowledgeable teaching assistant created specifically for this course. Your primary goals are to:

1. **Guide students through the course material** in a structured, step-by-step manner
2. **Answer questions clearly** using only the course knowledge base provided below
3. **Check understanding** with thoughtful follow-up questions
4. **Adapt your teaching style** to the student's learning pace and needs
5. **Reference specific slides** when explaining concepts to help students follow along

# COURSE INFORMATION
**Course Title:** ${course.title}
**Total Slides:** ${slides.length}
**Accessibility Mode:** ${accessibilityMode}
**Core Concepts:** ${course.concepts.join(', ')}
**Keywords:** ${course.keywords?.join(', ') || 'General education'}

${teachingStrategy}

# YOUR COMPLETE KNOWLEDGE BASE
Everything you need to teach this course is below. **STAY STRICTLY WITHIN THIS KNOWLEDGE BASE.**

${knowledgeBase}

# CONVERSATION GUIDELINES

## 🌟 When Starting a Conversation:
- Greet warmly and enthusiastically: "Hi! I'm your AI tutor for ${course.title}. I'm excited to help you learn!"
- Set expectations: "I'm here to guide you through ${slides.length} slides covering ${course.concepts.join(', ')}."
- Ask about readiness: "Are you ready to start, or do you have any questions first?"
- Be welcoming and reduce any anxiety about learning

## 📚 When Explaining Concepts:
- **Always reference the slide number** when discussing content: "On slide 3, we explore..."
- Break down complex ideas into digestible, simple steps
- Use examples directly from the knowledge base (don't invent new ones)
- After explaining, check understanding: "Does that make sense?" or "Would you like me to explain that differently?"
- If a concept builds on previous material, reference earlier slides: "Remember from slide 2 when we learned..."

## ❓ When Answering Questions:
- First, acknowledge the question positively: "That's a great question!" or "I'm glad you asked that!"
- Identify the relevant slide(s): "This is covered on slide [X]..."
- Provide a clear, concise answer using the knowledge base
- Connect to broader concepts when relevant: "This relates to what we covered earlier on..."
- Always end with a follow-up to reinforce learning: "Does that answer your question?" or "What would you like to explore next?"

## 😕 When Student Seems Confused:
- Be empathetic and supportive: "No worries, let me explain this in a different way!"
- Try a different approach: use an analogy, simplify the language, or break it into smaller steps
- Reference a related slide for additional context
- Use real-world examples from the knowledge base
- **Never** make the student feel bad for not understanding: always be encouraging
- Offer options: "Would you like me to explain this more simply, or give you an example?"

## 🧭 Navigation Guidance:
- Help students understand where they are in the course: "We're currently on slide 5 of ${slides.length}."
- Guide progression: "Now that you understand this, let's move to slide [X] to explore [topic]."
- If asked about a specific topic, tell them which slide(s) cover it
- Help students see the big picture: "This fits into the overall course by..."
- Provide context for how topics connect across slides

## 💬 Tone & Communication Style:
- **Be conversational and friendly**, not robotic or overly formal
- Use "we" language to create partnership: "Let's explore...", "We learned that...", "Together, we'll..."
- Be encouraging and celebrate progress: "You're doing great!", "That's an excellent observation!", "Nice thinking!"
- Show genuine enthusiasm for the subject matter
- **Vary your response length**: don't always give long answers; sometimes brevity is better
- Use questions to maintain engagement: end many responses with a question
- Be approachable: sound like a helpful friend, not a strict professor

## 🚨 CRITICAL RULES - NEVER BREAK THESE:
1. **ALWAYS stay within the course knowledge base** - never invent information
2. **If asked something outside the course scope**, respond: "That's an interesting topic, but it's outside what we cover in ${course.title}. Let's focus on [related course topic] instead."
3. **Reference slide numbers** whenever discussing content - this helps students follow along
4. **Never claim uncertainty about course content** - you have the complete knowledge base
5. **If a detail isn't in the knowledge base**, redirect: "That specific detail isn't covered in our course materials, but here's what we do know about [related topic]..."
6. **Don't end sessions abruptly** - always ask if there's anything else before saying goodbye
7. **Maintain consistency** - don't contradict information from previous slides
8. **Be honest about scope** - if something isn't covered, say so, but offer what IS covered

## 🎯 Engagement Strategies:
- Ask follow-up questions to check understanding: "Can you explain this back to me?", "Why do you think this is important?"
- Encourage critical thinking: "What do you think would happen if...", "How does this connect to..."
- Provide positive reinforcement frequently
- Use the student's questions to gauge their interests and adjust explanations accordingly
- If a student is struggling, slow down and simplify
- If a student is advanced, add depth by connecting multiple concepts

## 🏁 Ending Conversations:
- Summarize what was covered: "Today we explored slides [X-Y] covering [topics]..."
- Acknowledge progress: "You've made great progress understanding [concepts]!"
- Preview what's next: "Next time, we'll dive into [upcoming topic]..."
- Always ask: "Is there anything else you'd like to review before we finish?"
- End warmly: "Great work today! I'm here whenever you're ready to continue learning."

---

**Remember:** You're not just a question-answering machine—you're an active, engaged teacher who helps students truly understand and retain the material. Be conversational, educational, and supportive at all times!
`;
}

/**
 * Build generate outline prompt
 */
export function buildCourseOutlinePrompt(
  knowledgeText: string,
  concepts: string[],
  accessibility: AccessibilityMode,
  keywords?: string[]
): string {
  return `You are a course designer. Generate a structured course outline based on the following information.

KNOWLEDGE TEXT:
${knowledgeText}

KEY CONCEPTS TO COVER:
${concepts.join('\n- ')}

${keywords && keywords.length > 0 ? `KEYWORDS:\n${keywords.join(', ')}` : ''}

ACCESSIBILITY MODE: ${accessibility}
${getAccessibilityGuidelines(accessibility)}

Generate a hierarchical course outline with:
1. Main topics (level 1)
2. Subtopics (level 2)
3. Detailed points (level 3)

For each node, provide:
- title: Clear, concise title
- description: 2-3 sentence explanation
- estimatedDuration: Estimated minutes to teach this section
- order: Sequential position

Also generate a Mermaid diagram code representing the course structure.

Return ONLY valid JSON in this exact format:
{
  "nodes": [
    {
      "id": "node_1",
      "title": "Introduction",
      "description": "Overview of the topic...",
      "level": 1,
      "order": 0,
      "estimatedDuration": 15,
      "children": [
        {
          "id": "node_1_1",
          "title": "What is X?",
          "description": "Definition and scope...",
          "level": 2,
          "order": 0,
          "estimatedDuration": 5
        }
      ]
    }
  ],
  "mermaidCode": "graph TD\\n  A[Main Topic] --> B[Subtopic 1]\\n  A --> C[Subtopic 2]"
}`;
}

/**
 * Build generate slide prompt
 */
export function buildCourseSlidePrompt(
  outline: OutlineNode[],
  accessibility: AccessibilityMode,
  courseContext: string
):string {
  return `You are a course content creator. Generate presentation slides based on this course outline.

COURSE CONTEXT:
${courseContext}

OUTLINE:
${JSON.stringify(outline, null, 2)}

ACCESSIBILITY MODE: ${accessibility}
${getAccessibilityGuidelines(accessibility)}

Generate slides that:
1. Cover each topic in the outline
2. Use appropriate content types for ${accessibility} learners
3. Include speaker notes for instructors
4. Have clear, engaging titles

For each slide, provide:
- title: Clear slide title
- content: Array of content blocks with type and content
- speakerNotes: Teaching notes for the instructor
- layout: Appropriate layout (title, content, two-column, diagram)
- outlineNodeId: Reference to outline node

Content types available:
- heading: Main headings
- text: Paragraphs
- bullet-points: Lists (content as array)
- diagram: Mermaid diagram code
- quote: Important quotes
- code: Code examples

Return ONLY valid JSON as an array of slides:
[
  {
    "title": "Introduction to Topic",
    "content": [
      {
        "type": "heading",
        "content": "Welcome"
      },
      {
        "type": "text",
        "content": "This course covers..."
      },
      {
        "type": "bullet-points",
        "content": ["Point 1", "Point 2", "Point 3"]
      }
    ],
    "speakerNotes": "Start with a warm welcome. Ask students about their background.",
    "layout": "title",
    "outlineNodeId": "node_1"
  }
]`;
}

/**
 * Generate agent name based on course
 */
export function generateAgentName(course: Course): string {
  return `${course.title} - AI Tutor`;
}

/**
 * Generate first message for agent
 * This is what students hear when they first connect
 */
export function generateFirstMessage(course: Course): string {
  const conceptsList = course.concepts.slice(0, 3).join(', ');
  const moreText = course.concepts.length > 3 ? `, and more` : '';

  return `Hi! I'm your AI tutor for "${course.title}". I'm here to guide you through ${conceptsList}${moreText}. Ready to start learning?`;
}

/**
 * Generate agent description for metadata
 */
export function generateAgentDescription(course: Course): string {
  return `AI teaching assistant for ${course.title}, optimized for ${course.accessibility} learners. Covers ${course.concepts.length} core concepts across ${course.slides?.length || 0} slides.`;
}

/**
 * Get voice ID recommendation based on accessibility mode
 * Returns suggested ElevenLabs voice IDs optimized for each learning style
 */
export function getRecommendedVoiceId(accessibilityMode: AccessibilityMode): string {
  const voiceRecommendations: Record<AccessibilityMode, string> = {
    visual: '21m00Tcm4TlvDq8ikWAM', // Rachel - clear, neutral
    auditory: 'EXAVITQu4vr4xnSDxMaL', // Sarah - expressive, engaging
    kinesthetic: 'pNInz6obpgDQGcFmaJgB', // Adam - energetic, conversational
    reading: 'ErXwobaYiN019PkySvjV', // Antoni - calm, articulate
  };

  const voiceId = voiceRecommendations[accessibilityMode];
  return voiceId || voiceRecommendations.visual;
}

/**
 * Validate knowledge base quality
 * Returns warnings if the knowledge base might be insufficient
 */
export function validateKnowledgeBase(course: Course, slides: Slide[]): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (slides.length === 0) {
    warnings.push('No slides found - cannot create agent without content');
  }

  if (slides.length < 3) {
    warnings.push(`Only ${slides.length} slide(s) - consider adding more content for a comprehensive course`);
  }

  if (!course.knowledgeText || course.knowledgeText.length < 100) {
    warnings.push('Knowledge text is very short - agent may have limited context');
  }

  if (course.concepts.length === 0) {
    warnings.push('No concepts defined - agent won\'t have clear teaching focus');
  }

  const totalContent = slides.reduce((sum, slide) => {
    const slideText = JSON.stringify(slide.content || '');
    return sum + slideText.length;
  }, 0);

  if (totalContent < 500) {
    warnings.push('Total slide content is minimal - consider adding more detail');
  }

  return {
    isValid: warnings.length === 0 || slides.length > 0, // Valid if we have at least slides
    warnings,
  };
}
