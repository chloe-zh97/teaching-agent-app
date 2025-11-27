// src/repositories/interaction.repository.ts
import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import {
  Interaction,
  CreateInteractionInput,
  UpdateInteractionInput,
  InteractionType,
  InteractionSummary,
  InteractionStats,
} from '../models/interaction.model';
import { Timestamp } from '../models/common.model';
import { NotFoundError, ValidationError } from '../utils/errors';

export class InteractionRepository {
  private kv: KvCache;
  private readonly INTERACTION_PREFIX = 'interaction:';
  private readonly SESSION_INTERACTIONS_PREFIX = 'session_interactions:';
  private readonly SLIDE_INTERACTIONS_PREFIX = 'slide_interactions:';
  private readonly STUDENT_QUESTIONS_PREFIX = 'student_questions:';

  constructor(kv: KvCache) {
    this.kv = kv;
  }

  /**
   * Generate a unique interaction ID
   */
  private generateId(): string {
    return `interaction_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new interaction
   */
  async create(input: CreateInteractionInput): Promise<Interaction> {
    // Validate required fields
    if (!input.sessionId || !input.slideId || !input.type) {
      throw new ValidationError('sessionId, slideId, and type are required');
    }

    const now: Timestamp = new Date().toISOString();
    const interactionId = this.generateId();

    // Get session to extract courseId and studentId
    const sessionKey = `session:${input.sessionId}`;
    const sessionData = await this.kv.get(sessionKey);
    
    if (!sessionData) {
      throw new NotFoundError(`Session ${input.sessionId} not found`);
    }
    
    const session = JSON.parse(sessionData);

    const interaction: Interaction = {
      interactionId,
      sessionId: input.sessionId,
      courseId: session.courseId,
      studentId: session.studentId,
      slideOrder: input.slideOrder,
      slideId: input.slideId,
      type: input.type,
      data: input.data,
      duration: input.duration,
      timestamp: now,
      createdAt: now,
    };

    // Store interaction data
    const interactionKey = `${this.INTERACTION_PREFIX}${interactionId}`;
    await this.kv.put(interactionKey, JSON.stringify(interaction));

    // Create indexes
    const timestamp = Date.now();
    await this.kv.put(
      `${this.SESSION_INTERACTIONS_PREFIX}${input.sessionId}:${timestamp}:${interactionId}`,
      interactionId
    );
    await this.kv.put(
      `${this.SLIDE_INTERACTIONS_PREFIX}${input.slideId}:${interactionId}`,
      interactionId
    );

    // Index questions separately for easy retrieval
    if (input.type === 'question') {
      await this.kv.put(
        `${this.STUDENT_QUESTIONS_PREFIX}${session.studentId}:${interactionId}`,
        interactionId
      );
    }

    return interaction;
  }

  /**
   * Get interaction by ID
   */
  async getById(interactionId: string): Promise<Interaction> {
    const interactionKey = `${this.INTERACTION_PREFIX}${interactionId}`;
    const interactionData = await this.kv.get(interactionKey);

    if (!interactionData) {
      throw new NotFoundError(`Interaction with ID ${interactionId} not found`);
    }

    return JSON.parse(interactionData) as Interaction;
  }

  /**
   * Update interaction (mainly for feedback)
   */
  async update(interactionId: string, updates: UpdateInteractionInput): Promise<Interaction> {
    const existingInteraction = await this.getById(interactionId);

    const updatedInteraction: Interaction = {
      ...existingInteraction,
      wasHelpful: updates.wasHelpful ?? existingInteraction.wasHelpful,
      rating: updates.rating ?? existingInteraction.rating,
      data: updates.data ? { ...existingInteraction.data, ...updates.data } : existingInteraction.data,
    };

    const interactionKey = `${this.INTERACTION_PREFIX}${interactionId}`;
    await this.kv.put(interactionKey, JSON.stringify(updatedInteraction));

    return updatedInteraction;
  }

  /**
   * Delete interaction
   */
  async delete(interactionId: string): Promise<void> {
    const interaction = await this.getById(interactionId);

    // Delete interaction data
    const interactionKey = `${this.INTERACTION_PREFIX}${interactionId}`;
    await this.kv.delete(interactionKey);

    // Delete indexes (we need to find the timestamp-based key)
    // Note: In production, you might want to store the timestamp in the interaction
    const slideIndexKey = `${this.SLIDE_INTERACTIONS_PREFIX}${interaction.slideId}:${interactionId}`;
    await this.kv.delete(slideIndexKey);

    // Delete question index if it was a question
    if (interaction.type === 'question') {
      await this.kv.delete(
        `${this.STUDENT_QUESTIONS_PREFIX}${interaction.studentId}:${interactionId}`
      );
    }

    // Note: Session interactions index cleanup would require listing with prefix
    // This is acceptable as the index is mainly for listing, not critical for deletion
  }

  /**
   * List interactions by session (timeline)
   */
  async listBySession(
    sessionId: string,
    options?: { limit?: number; type?: InteractionType }
  ): Promise<Interaction[]> {
    const prefix = `${this.SESSION_INTERACTIONS_PREFIX}${sessionId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const interactions: Interaction[] = [];
    for (const key of result.keys) {
      try {
        const interactionId = key.name.split(':').pop() || '';
        const interaction = await this.getById(interactionId);
        
        // Filter by type if provided
        if (!options?.type || interaction.type === options.type) {
          interactions.push(interaction);
        }
      } catch (error) {
        console.error(`Error fetching interaction from key ${key.name}:`, error);
      }
    }

    // Already sorted by timestamp (in the key)
    return interactions;
  }

  /**
   * List interactions by slide
   */
  async listBySlide(
    slideId: string,
    options?: { limit?: number; type?: InteractionType }
  ): Promise<Interaction[]> {
    const prefix = `${this.SLIDE_INTERACTIONS_PREFIX}${slideId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const interactions: Interaction[] = [];
    for (const key of result.keys) {
      try {
        const interactionId = key.name.split(':').pop() || '';
        const interaction = await this.getById(interactionId);
        
        // Filter by type if provided
        if (!options?.type || interaction.type === options.type) {
          interactions.push(interaction);
        }
      } catch (error) {
        console.error(`Error fetching interaction from key ${key.name}:`, error);
      }
    }

    // Sort by timestamp descending (most recent first)
    return interactions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * List student's questions
   */
  async listStudentQuestions(
    studentId: string,
    options?: { limit?: number }
  ): Promise<Interaction[]> {
    const prefix = `${this.STUDENT_QUESTIONS_PREFIX}${studentId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const interactions: Interaction[] = [];
    for (const key of result.keys) {
      try {
        const interactionId = key.name.split(':').pop() || '';
        const interaction = await this.getById(interactionId);
        interactions.push(interaction);
      } catch (error) {
        console.error(`Error fetching interaction from key ${key.name}:`, error);
      }
    }

    // Sort by timestamp descending (most recent first)
    return interactions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get interaction summaries for a session
   */
  async getSessionSummaries(sessionId: string): Promise<InteractionSummary[]> {
    const interactions = await this.listBySession(sessionId);
    
    return interactions.map(interaction => ({
      interactionId: interaction.interactionId,
      type: interaction.type,
      slideOrder: interaction.slideOrder,
      timestamp: interaction.timestamp,
      wasHelpful: interaction.wasHelpful,
    }));
  }

  /**
   * Get interaction statistics for a session
   */
  async getSessionStats(sessionId: string): Promise<InteractionStats> {
    const interactions = await this.listBySession(sessionId);
    
    const questionCount = interactions.filter(i => i.type === 'question').length;
    const highlightCount = interactions.filter(i => i.type === 'highlight').length;
    const navigationCount = interactions.filter(i => i.type === 'navigation').length;
    const annotationCount = interactions.filter(i => i.type === 'annotation').length;
    const agentChatCount = interactions.filter(i => i.type === 'agent-chat').length;

    // Calculate average rating
    const ratedInteractions = interactions.filter(i => i.rating !== undefined);
    const averageRating = ratedInteractions.length > 0
      ? ratedInteractions.reduce((sum, i) => sum + (i.rating || 0), 0) / ratedInteractions.length
      : undefined;

    // Calculate helpful percentage
    const feedbackInteractions = interactions.filter(i => i.wasHelpful !== undefined);
    const helpfulCount = feedbackInteractions.filter(i => i.wasHelpful === true).length;
    const helpfulPercentage = feedbackInteractions.length > 0
      ? Math.round((helpfulCount / feedbackInteractions.length) * 100)
      : undefined;

    return {
      totalInteractions: interactions.length,
      questionCount,
      highlightCount,
      navigationCount,
      annotationCount,
      agentChatCount,
      averageRating: averageRating ? Math.round(averageRating * 10) / 10 : undefined,
      helpfulPercentage,
    };
  }

  /**
   * Get interaction statistics for a course (across all sessions)
   */
  async getCourseStats(courseId: string): Promise<InteractionStats> {
    // Get all sessions for the course
    const courseSessionsPrefix = `course_sessions:${courseId}:`;
    const sessionsResult = await this.kv.list({ prefix: courseSessionsPrefix });

    let totalInteractions = 0;
    let questionCount = 0;
    let highlightCount = 0;
    let navigationCount = 0;
    let annotationCount = 0;
    let agentChatCount = 0;
    let totalRating = 0;
    let ratingCount = 0;
    let helpfulCount = 0;
    let feedbackCount = 0;

    for (const sessionKey of sessionsResult.keys) {
      try {
        const sessionId = sessionKey.name.split(':').pop() || '';
        const interactions = await this.listBySession(sessionId);

        totalInteractions += interactions.length;
        questionCount += interactions.filter(i => i.type === 'question').length;
        highlightCount += interactions.filter(i => i.type === 'highlight').length;
        navigationCount += interactions.filter(i => i.type === 'navigation').length;
        annotationCount += interactions.filter(i => i.type === 'annotation').length;
        agentChatCount += interactions.filter(i => i.type === 'agent-chat').length;

        interactions.forEach(i => {
          if (i.rating !== undefined) {
            totalRating += i.rating;
            ratingCount++;
          }
          if (i.wasHelpful !== undefined) {
            feedbackCount++;
            if (i.wasHelpful) helpfulCount++;
          }
        });
      } catch (error) {
        console.error(`Error processing session ${sessionKey.name}:`, error);
      }
    }

    return {
      totalInteractions,
      questionCount,
      highlightCount,
      navigationCount,
      annotationCount,
      agentChatCount,
      averageRating: ratingCount > 0 ? Math.round((totalRating / ratingCount) * 10) / 10 : undefined,
      helpfulPercentage: feedbackCount > 0 ? Math.round((helpfulCount / feedbackCount) * 100) : undefined,
    };
  }

  /**
   * Get recent questions for a course (teacher view)
   */
  async getRecentCourseQuestions(courseId: string, limit: number = 20): Promise<Interaction[]> {
    // Get all sessions for the course
    const courseSessionsPrefix = `course_sessions:${courseId}:`;
    const sessionsResult = await this.kv.list({ prefix: courseSessionsPrefix, limit: 100 });

    const allQuestions: Interaction[] = [];

    for (const sessionKey of sessionsResult.keys) {
      try {
        const sessionId = sessionKey.name.split(':').pop() || '';
        const questions = await this.listBySession(sessionId, { type: 'question' });
        allQuestions.push(...questions);
      } catch (error) {
        console.error(`Error processing session ${sessionKey.name}:`, error);
      }
    }

    // Sort by timestamp descending and limit
    return allQuestions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
}