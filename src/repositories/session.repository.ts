// src/repositories/session.repository.ts
import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import {
  Session,
  CreateSessionInput,
  UpdateSessionProgressInput,
  UpdateSessionStatusInput,
  SessionStatus,
  SessionSummary,
} from '../models/session.model';
import { Timestamp } from '../models/common.model';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

export class SessionRepository {
  private kv: KvCache;
  private readonly SESSION_PREFIX = 'session:';
  private readonly STUDENT_SESSIONS_PREFIX = 'student_sessions:';
  private readonly COURSE_SESSIONS_PREFIX = 'course_sessions:';
  private readonly ACTIVE_SESSION_PREFIX = 'active_session:';

  constructor(kv: KvCache) {
    this.kv = kv;
  }

  /**
   * Generate a unique session ID
   */
  private generateId(): string {
    return `session_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate progress percentage
   */
  private calculateProgress(completedSlides: number[], totalSlides: number): number {
    if (totalSlides === 0) return 0;
    return Math.round((completedSlides.length / totalSlides) * 100);
  }

  /**
   * Create a new session
   */
  async create(input: CreateSessionInput, totalSlides: number): Promise<Session> {
    // Check if there's already an active session for this student and course
    const existingActiveSession = await this.getActiveSession(input.studentId, input.courseId);
    if (existingActiveSession) {
      throw new ConflictError(
        `Student already has an active session for this course: ${existingActiveSession.sessionId}`
      );
    }

    const now: Timestamp = new Date().toISOString();
    const sessionId = this.generateId();

    const session: Session = {
      sessionId,
      courseId: input.courseId,
      studentId: input.studentId,
      progress: {
        currentSlideOrder: 0,
        currentSlideId: '', // Will be set when first slide is accessed
        visitedSlides: [],
        completedSlides: [],
        totalSlides,
        progressPercentage: 0,
      },
      startedAt: now,
      lastActivityAt: now,
      totalDuration: 0,
      status: 'active',
      totalQuestions: 0,
      totalInteractions: 0,
      isPracticeMode: input.isPracticeMode ?? false,
      createdAt: now,
      updatedAt: now,
    };

    // Store session data
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.kv.put(sessionKey, JSON.stringify(session));

    // Create indexes
    await this.kv.put(
      `${this.STUDENT_SESSIONS_PREFIX}${input.studentId}:${sessionId}`,
      sessionId
    );
    await this.kv.put(
      `${this.COURSE_SESSIONS_PREFIX}${input.courseId}:${sessionId}`,
      sessionId
    );
    await this.kv.put(
      `${this.ACTIVE_SESSION_PREFIX}${input.studentId}:${input.courseId}`,
      sessionId
    );

    return session;
  }

  /**
   * Get session by ID
   */
  async getById(sessionId: string): Promise<Session> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const sessionData = await this.kv.get(sessionKey);

    if (!sessionData) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    return JSON.parse(sessionData) as Session;
  }

  /**
   * Get active session for a student and course
   */
  async getActiveSession(studentId: string, courseId: string): Promise<Session | null> {
    const activeKey = `${this.ACTIVE_SESSION_PREFIX}${studentId}:${courseId}`;
    const sessionId = await this.kv.get(activeKey);

    if (!sessionId) {
      return null;
    }

    try {
      return await this.getById(sessionId);
    } catch (error) {
      // Clean up stale index if session doesn't exist
      await this.kv.delete(activeKey);
      return null;
    }
  }

  /**
   * Update session progress
   */
  async updateProgress(
    sessionId: string,
    input: UpdateSessionProgressInput
  ): Promise<Session> {
    const session = await this.getById(sessionId);

    if (session.status === 'completed') {
      throw new ValidationError('Cannot update progress for completed session');
    }

    const now = new Date();
    const lastActivity = new Date(session.lastActivityAt);
    const durationDelta = Math.floor((now.getTime() - lastActivity.getTime()) / 1000);

    // Update visited slides
    if (!session.progress.visitedSlides.includes(input.currentSlideOrder)) {
      session.progress.visitedSlides.push(input.currentSlideOrder);
    }

    // Update completed slides based on action
    if (input.action === 'complete') {
      if (!session.progress.completedSlides.includes(input.currentSlideOrder)) {
        session.progress.completedSlides.push(input.currentSlideOrder);
      }
    }

    // Update current position
    session.progress.currentSlideOrder = input.currentSlideOrder;
    session.progress.currentSlideId = input.currentSlideId;

    // Recalculate progress percentage
    session.progress.progressPercentage = this.calculateProgress(
      session.progress.completedSlides,
      session.progress.totalSlides
    );

    // Update timing
    session.lastActivityAt = now.toISOString();
    session.totalDuration += durationDelta;
    session.updatedAt = now.toISOString();

    // Auto-complete if all slides are completed
    if (session.progress.completedSlides.length === session.progress.totalSlides) {
      session.status = 'completed';
      session.endedAt = now.toISOString();

      // Remove from active sessions
      await this.kv.delete(
        `${this.ACTIVE_SESSION_PREFIX}${session.studentId}:${session.courseId}`
      );
    }

    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.kv.put(sessionKey, JSON.stringify(session));

    return session;
  }

  /**
   * Update session status
   */
  async updateStatus(sessionId: string, input: UpdateSessionStatusInput): Promise<Session> {
    const session = await this.getById(sessionId);
    const now = new Date().toISOString();

    session.status = input.status;
    session.updatedAt = now;

    if (input.status === 'completed' && !session.endedAt) {
      session.endedAt = now;
      // Remove from active sessions
      await this.kv.delete(
        `${this.ACTIVE_SESSION_PREFIX}${session.studentId}:${session.courseId}`
      );
    }

    if (input.status === 'active') {
      session.lastActivityAt = now;
      // Add back to active sessions
      await this.kv.put(
        `${this.ACTIVE_SESSION_PREFIX}${session.studentId}:${session.courseId}`,
        sessionId
      );
    }

    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.kv.put(sessionKey, JSON.stringify(session));

    return session;
  }

  /**
   * Update session notes
   */
  async updateNotes(sessionId: string, notes: string): Promise<Session> {
    const session = await this.getById(sessionId);

    session.notes = notes;
    session.updatedAt = new Date().toISOString();

    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.kv.put(sessionKey, JSON.stringify(session));

    return session;
  }

  /**
   * Increment interaction count
   */
  async incrementInteractionCount(sessionId: string): Promise<void> {
    const session = await this.getById(sessionId);
    
    session.totalInteractions += 1;
    session.lastActivityAt = new Date().toISOString();
    session.updatedAt = new Date().toISOString();

    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.kv.put(sessionKey, JSON.stringify(session));
  }

  /**
   * Increment question count
   */
  async incrementQuestionCount(sessionId: string): Promise<void> {
    const session = await this.getById(sessionId);
    
    session.totalQuestions += 1;
    session.totalInteractions += 1; // Questions are interactions too
    session.lastActivityAt = new Date().toISOString();
    session.updatedAt = new Date().toISOString();

    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.kv.put(sessionKey, JSON.stringify(session));
  }

  /**
   * Delete session
   */
  async delete(sessionId: string): Promise<void> {
    const session = await this.getById(sessionId);

    // Delete session data
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.kv.delete(sessionKey);

    // Delete indexes
    await this.kv.delete(
      `${this.STUDENT_SESSIONS_PREFIX}${session.studentId}:${sessionId}`
    );
    await this.kv.delete(
      `${this.COURSE_SESSIONS_PREFIX}${session.courseId}:${sessionId}`
    );

    // Delete active session index if this was active
    if (session.status === 'active') {
      await this.kv.delete(
        `${this.ACTIVE_SESSION_PREFIX}${session.studentId}:${session.courseId}`
      );
    }
  }

  /**
   * List sessions by student
   */
  async listByStudent(
    studentId: string,
    options?: { limit?: number; status?: SessionStatus }
  ): Promise<Session[]> {
    const prefix = `${this.STUDENT_SESSIONS_PREFIX}${studentId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const sessions: Session[] = [];
    for (const key of result.keys) {
      try {
        const sessionId = key.name.split(':').pop() || '';
        const session = await this.getById(sessionId);
        
        // Filter by status if provided
        if (!options?.status || session.status === options.status) {
          sessions.push(session);
        }
      } catch (error) {
        console.error(`Error fetching session from key ${key.name}:`, error);
      }
    }

    // Sort by lastActivityAt descending (most recent first)
    return sessions.sort((a, b) => 
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
  }

  /**
   * List sessions by course
   */
  async listByCourse(
    courseId: string,
    options?: { limit?: number; status?: SessionStatus }
  ): Promise<Session[]> {
    const prefix = `${this.COURSE_SESSIONS_PREFIX}${courseId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const sessions: Session[] = [];
    for (const key of result.keys) {
      try {
        const sessionId = key.name.split(':').pop() || '';
        const session = await this.getById(sessionId);
        
        // Filter by status if provided
        if (!options?.status || session.status === options.status) {
          sessions.push(session);
        }
      } catch (error) {
        console.error(`Error fetching session from key ${key.name}:`, error);
      }
    }

    // Sort by lastActivityAt descending (most recent first)
    return sessions.sort((a, b) => 
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
  }

  /**
   * Get session summary for student
   */
  async getStudentSummaries(studentId: string, limit?: number): Promise<SessionSummary[]> {
    const sessions = await this.listByStudent(studentId, { limit });
    
    return sessions.map(session => ({
      sessionId: session.sessionId,
      courseId: session.courseId,
      progress: session.progress,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      totalDuration: session.totalDuration,
      status: session.status,
    }));
  }

  /**
   * Get course statistics
   */
  async getCourseStats(courseId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    averageProgress: number;
    averageDuration: number;
  }> {
    const sessions = await this.listByCourse(courseId);
    
    const activeSessions = sessions.filter(s => s.status === 'active').length;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    
    const totalProgress = sessions.reduce((sum, s) => sum + s.progress.progressPercentage, 0);
    const averageProgress = sessions.length > 0 ? totalProgress / sessions.length : 0;
    
    const totalDuration = sessions.reduce((sum, s) => sum + s.totalDuration, 0);
    const averageDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

    return {
      totalSessions: sessions.length,
      activeSessions,
      completedSessions,
      averageProgress: Math.round(averageProgress),
      averageDuration: Math.round(averageDuration),
    };
  }

  /**
   * Resume or create session
   * If active session exists, return it. Otherwise create new one.
   */
  async resumeOrCreate(
    input: CreateSessionInput,
    totalSlides: number
  ): Promise<{ session: Session; isNew: boolean }> {
    const activeSession = await this.getActiveSession(input.studentId, input.courseId);
    
    if (activeSession) {
      return { session: activeSession, isNew: false };
    }
    
    const newSession = await this.create(input, totalSlides);
    return { session: newSession, isNew: true };
  }
}