// src/models/agent.model.ts
import { Timestamp } from './common.model';

export type AgentStatus = 'creating' | 'active' | 'inactive' | 'error';

export type AgentTone = 'professional' | 'friendly' | 'casual' | 'formal' | 'enthusiastic';

export interface ElevenLabsConfig {
  agentId: string; // ElevenLabs conversational agent ID
  voiceId: string; // ElevenLabs voice ID
  firstMessage?: string; // Initial greeting
  language?: string; // e.g., "en", "es"
  maxDuration?: number; // Max conversation duration in seconds
}

export interface AgentPersonality {
  name: string;
  description: string;
  tone: AgentTone;
  expertise: string[];
  teachingStyle?: string;
  greetingMessage?: string;
}

export interface Agent {
  agentId: string; // Our internal agent ID
  courseId: string;
  teacherId: string;
  
  // ElevenLabs Configuration
  elevenLabsConfig: ElevenLabsConfig;
  
  // Agent Identity
  name: string;
  personality: AgentPersonality;
  systemPrompt: string;
  
  // Knowledge Base
  courseContext: string; // Compiled knowledge from course
  slideReferences: string[]; // SlideIds for navigation
  
  // Capabilities
  canNavigateSlides: boolean;
  canAnswerQuestions: boolean;
  canProvideExamples: boolean;
  canGiveFeedback: boolean;
  
  // Settings
  temperature?: number; // AI creativity (0-1) if configurable
  maxTokens?: number; // If configurable
  
  // Status
  status: AgentStatus;
  errorMessage?: string;
  
  // Stats
  totalConversations: number;
  totalInteractions: number;
  averageRating?: number;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUsedAt?: Timestamp;
}

export interface CreateAgentInput {
  courseId: string;
  teacherId: string;
  name?: string;
  voiceId?: string; // ElevenLabs voice ID, optional with default
  personality?: Partial<AgentPersonality>;
  systemPrompt?: string;
  firstMessage?: string;
  language?: string;
}

export interface UpdateAgentInput {
  name?: string;
  voiceId?: string;
  personality?: Partial<AgentPersonality>;
  systemPrompt?: string;
  courseContext?: string;
  canNavigateSlides?: boolean;
  canAnswerQuestions?: boolean;
  canProvideExamples?: boolean;
  canGiveFeedback?: boolean;
  firstMessage?: string;
  language?: string;
}

export interface UpdateAgentStatusInput {
  status: AgentStatus;
  errorMessage?: string;
  elevenLabsAgentId?: string; // Update after ElevenLabs creation
}

export interface AgentStats {
  agentId: string;
  elevenLabsAgentId: string;
  totalConversations: number;
  totalInteractions: number;
  averageRating?: number;
  lastUsedAt?: Timestamp;
  status: AgentStatus;
}

// For API compatibility with your frontend
export interface CreateAgentResponse {
  agentId: string; // Our internal ID
  elevenLabsAgentId?: string; // ElevenLabs agent ID (if created)
  voiceId: string;
  status: AgentStatus;
  message: string;
}