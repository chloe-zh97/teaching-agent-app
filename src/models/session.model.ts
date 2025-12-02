// src/models/session.model.ts
import { Timestamp } from './common.model';

export type SessionStatus = 'active' | 'paused' | 'completed';

export interface SessionProgress {
  currentSlideOrder: number; // Current position (0-indexed)
  currentSlideId: string;
  visitedSlides: number[]; // Array of slide orders visited
  completedSlides: number[]; // Array of slide orders marked complete
  totalSlides: number;
  progressPercentage: number; // 0-100
}

export interface Session {
  sessionId: string;
  courseId: string;
  studentId: string; // References User.userId
  
  // Progress tracking
  progress: SessionProgress;
  
  // Timing
  startedAt: Timestamp;
  lastActivityAt: Timestamp;
  endedAt?: Timestamp;
  totalDuration: number; // seconds
  
  // Status
  status: SessionStatus;
  
  // Interaction tracking
  totalQuestions: number;
  totalInteractions: number;
  
  // Metadata
  isPracticeMode?: boolean;
  notes?: string;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateSessionInput {
  courseId: string;
  studentId: string;
  isPracticeMode?: boolean;
}

export interface UpdateSessionProgressInput {
  currentSlideOrder: number;
  currentSlideId: string;
  action: 'visit' | 'complete' | 'back' | 'forward';
}

export interface UpdateSessionStatusInput {
  status: SessionStatus;
}

export interface SessionSummary {
  sessionId: string;
  courseId: string;
  courseTitle?: string;
  progress: SessionProgress;
  startedAt: Timestamp;
  lastActivityAt: Timestamp;
  totalDuration: number;
  status: SessionStatus;
}