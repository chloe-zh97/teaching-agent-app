// src/services/course-generation.service.ts
import { OutlineNode, OutlineStructure, AccessibilityMode, Course } from '../models/course.model';
import { Slide } from '../models/slide.model';
import { ValidationError } from '../utils/errors';
import { buildCourseOutlinePrompt, buildCourseSlidePrompt } from '../utils/prompt.templates';
import { Env } from '../utils/raindrop.gen';

/**
 * Generate course outline from knowledge text using Claude API
 */
export async function generateOutline(
  c: Env,
  knowledgeText: string,
  concepts: string[],
  accessibility: AccessibilityMode,
  keywords?: string[],
): Promise<OutlineStructure> {
  
  const prompt = buildCourseOutlinePrompt(
    knowledgeText,
    concepts,
    accessibility,
    keywords
  );

  //c.logger.info(`Generate outline prompt: ${prompt}`);

  try {
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        //'x-api-key': c.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.log(`Claude API error: ${response.statusText}`);
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const responseText = data.content[0].text;

    // Parse JSON response
    const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
    const outlineData = JSON.parse(cleanedResponse);

    const outline: OutlineStructure = {
      nodes: outlineData.nodes,
      mermaidCode: outlineData.mermaidCode,
      generatedAt: new Date().toISOString(),
      generationPrompt: prompt,
    };

    return outline;
  } catch (error) {
    console.error('Error generating outline:', error);
    throw new Error('Failed to generate course outline');
  }
}

/**
 * Generate slides from outline using Claude API
 */
export async function generateSlides(
  c: Env,
  outline: OutlineNode[],
  accessibility: AccessibilityMode,
  courseContext: string
): Promise<Slide[]> {
  
  const prompt = buildCourseSlidePrompt(
    outline,
    accessibility,
    courseContext
  );

  try {
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        //'x-api-key': c.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 8000, 
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const responseText = data.content[0].text;

    // Parse JSON response
    const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
    const slidesData = JSON.parse(cleanedResponse);

    // Transform to Slide objects with proper structure
    const slides: Slide[] = slidesData.map((slideData: any, index: number) => ({
      slideId: '', // Will be set by repository
      courseId: '', // Will be set by repository
      order: index,
      title: slideData.title,
      content: slideData.content,
      speakerNotes: slideData.speakerNotes,
      outlineNodeId: slideData.outlineNodeId,
      accessibilityMode: accessibility,
      visualAids: slideData.visualAids || [],
      audioNarration: slideData.audioNarration,
      layout: slideData.layout || 'content',
      theme: slideData.theme,
      backgroundColor: slideData.backgroundColor,
      generatedBy: 'ai',
      aiPrompt: prompt,
      generatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    return slides;
  } catch (error) {
    console.error('Error generating slides:', error);
    throw new Error('Failed to generate slides');
  }
}

/**
 * Get accessibility-specific guidelines for AI generation
 */
export function getAccessibilityGuidelines(accessibility: AccessibilityMode): string {
  const guidelines = {
    visual: `
VISUAL LEARNERS prefer:
- Diagrams, charts, and infographics
- Color-coded information
- Mind maps and visual hierarchies
- Images and illustrations
- Spatial organization of content`,
    
    auditory: `
AUDITORY LEARNERS prefer:
- Clear verbal explanations
- Discussion prompts
- Rhythm and repetition
- Sound patterns and mnemonics
- Storytelling approach`,
    
    kinesthetic: `
KINESTHETIC LEARNERS prefer:
- Hands-on examples
- Interactive demonstrations
- Real-world applications
- Step-by-step processes
- Physical or practical activities`,
    
    reading: `
READING/WRITING LEARNERS prefer:
- Detailed text explanations
- Lists and written summaries
- Definitions and terminology
- Written examples
- Note-taking opportunities`,
  };

  return guidelines[accessibility] || '';
}

/**
 * Helper function to flatten outline nodes for easier processing
 */
export function flattenOutlineNodes(nodes: OutlineNode[]): OutlineNode[] {
  const flattened: OutlineNode[] = [];
  
  function flatten(nodeList: OutlineNode[]) {
    for (const node of nodeList) {
      flattened.push(node);
      if (node.children && node.children.length > 0) {
        flatten(node.children);
      }
    }
  }
  
  flatten(nodes);
  return flattened;
}

/**
 * Estimate total course duration from outline
 */
export function estimateCourseDuration(nodes: OutlineNode[]): number {
  const flattened = flattenOutlineNodes(nodes);
  return flattened.reduce((total, node) => total + (node.estimatedDuration || 0), 0);
}