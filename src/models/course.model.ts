// src/models/course.model.ts
import { Timestamp } from './common.model';

export type AccessibilityMode = 'visual' | 'auditory' | 'kinesthetic' | 'reading';

export type CourseStatus = 
  | 'draft' 
  | 'outline-generated' 
  | 'slides-generated' 
  | 'agent-created' 
  | 'published' 
  | 'archived';

export interface OutlineNode {
  id: string;
  title: string;
  description: string;
  level: number; // Depth in hierarchy (1=main, 2=sub, etc.)
  children?: OutlineNode[]; // Nested structure
  estimatedDuration?: number; // minutes
  order: number; // Position in sequence
}

export interface OutlineStructure {
  nodes: OutlineNode[]; // Hierarchical array
  mermaidCode?: string; // For visualization
  generatedAt: Timestamp;
  generationPrompt?: string; // What was sent to Claude
}

export interface Course {
  courseId: string;
  teacherId: string; // References User.userId
  
  // Basic Info
  title: string;
  description?: string;
  
  // Input from Teacher (Step 1)
  knowledgeText: string; // Original natural language input
  concepts: string[]; // Required concepts to cover
  keywords?: string[]; // Optional keywords for focus
  accessibility: AccessibilityMode; // Learning style
  
  // Generated Content (Steps 2-3)
  outline?: OutlineStructure; // Generated outline (embedded)
  slides: string[]; // Array of slideIds (ordered)
  
  // Agent Configuration (Step 4)
  agentId?: string; // ElevenLabs agent ID
  voiceId?: string; // ElevenLabs voice ID
  
  // Metadata
  status: CourseStatus;
  isPublic: boolean;
  thumbnailUrl?: string;
  
  // Stats
  totalSlides: number;
  totalStudents: number;
  totalSessions: number;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

export interface CreateCourseInput {
  teacherId: string;
  title: string;
  description?: string;
  knowledgeText: string;
  concepts: string[];
  keywords?: string[];
  accessibility: AccessibilityMode;
  isPublic?: boolean;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  knowledgeText?: string;
  concepts?: string[];
  keywords?: string[];
  accessibility?: AccessibilityMode;
  isPublic?: boolean;
  thumbnailUrl?: string;
}

export interface UpdateCourseOutlineInput {
  outline: OutlineStructure;
}

export interface UpdateCourseSlidesInput {
  slideIds: string[];
}

export interface UpdateCourseAgentInput {
  agentId: string;
  voiceId: string;
}

// API Response types
export interface GenerateOutlineInput {
  knowledgeText: string;
  concepts: string[];
  accessibility: string;
  keywords?: string[];
}

export interface GenerateOutlineResponse {
  outline: OutlineStructure;
  success: boolean;
}