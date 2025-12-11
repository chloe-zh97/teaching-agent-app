// src/models/interaction.model.ts
import { Timestamp } from './common.model';

export type InteractionType = 
  | 'question' 
  | 'highlight' 
  | 'navigation' 
  | 'annotation'
  | 'agent-chat';

export interface InteractionData {
  // Question/Answer
  question?: string;
  answer?: string;
  confidence?: number; // AI confidence 0-1
  
  // Navigation
  fromSlideOrder?: number;
  toSlideOrder?: number;
  
  // Highlight/Annotation
  highlightedText?: string;
  annotationText?: string;
  position?: { x: number; y: number; width?: number; height?: number };
  color?: string; // Highlight color
  
  // Agent response
  agentResponse?: string;
  agentUsed: boolean;
  
  // Additional context
  context?: Record<string, any>;
}

export interface Interaction {
  interactionId: string;
  sessionId: string;
  courseId: string;
  studentId: string;
  slideOrder: number; // Which slide (position)
  slideId: string;
  
  // Type of interaction
  type: InteractionType;
  
  // Data
  data: InteractionData;
  
  // Feedback
  wasHelpful?: boolean;
  rating?: number; // 1-5
  
  // Timing
  timestamp: Timestamp;
  duration?: number; // How long on this interaction (seconds)
  
  // Metadata
  createdAt: Timestamp;
}

export interface CreateInteractionInput {
  sessionId: string;
  slideOrder: number;
  slideId: string;
  type: InteractionType;
  data: InteractionData;
  duration?: number;
}

export interface UpdateInteractionInput {
  wasHelpful?: boolean;
  rating?: number;
  data?: Partial<InteractionData>;
}

export interface InteractionSummary {
  interactionId: string;
  type: InteractionType;
  slideOrder: number;
  timestamp: Timestamp;
  wasHelpful?: boolean;
}

export interface InteractionStats {
  totalInteractions: number;
  questionCount: number;
  highlightCount: number;
  navigationCount: number;
  annotationCount: number;
  agentChatCount: number;
  averageRating?: number;
  helpfulPercentage?: number;
}