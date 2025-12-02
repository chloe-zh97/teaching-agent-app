import { Timestamp } from './common.model';
import { AccessibilityMode } from './course.model';

export type SlideContentType = 
  | 'text' 
  | 'heading' 
  | 'bullet-points' 
  | 'diagram' 
  | 'image' 
  | 'code' 
  | 'quote'
  | 'markdown';

export type SlideLayout = 
  | 'title' 
  | 'content' 
  | 'two-column' 
  | 'full-image' 
  | 'diagram'
  | 'custom';

export interface SlideContent {
  type: SlideContentType;
  content: string | string[]; // String or array for bullet points
  style?: Record<string, any>; // Custom styling
  position?: { x: number; y: number }; // For custom layouts
}

export interface Slide {
  slideId: string;
  courseId: string;
  
  // Position in presentation
  order: number; // 0-indexed position in presentation
  
  // Content
  title: string;
  content: SlideContent[];
  speakerNotes?: string;
  
  // Related to outline
  outlineNodeId?: string; // Which outline section this covers
  
  // Accessibility-specific
  accessibilityMode: AccessibilityMode;
  visualAids?: string[]; // URLs to images/diagrams
  audioNarration?: string; // Text for TTS or audio URL
  
  // Layout
  layout: SlideLayout;
  theme?: string;
  backgroundColor?: string;
  
  // Generation metadata
  generatedBy: 'ai' | 'teacher';
  aiPrompt?: string;
  generatedAt: Timestamp;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateSlideInput {
  courseId: string;
  order: number;
  title: string;
  content: SlideContent[];
  speakerNotes?: string;
  outlineNodeId?: string;
  accessibilityMode: AccessibilityMode;
  visualAids?: string[];
  audioNarration?: string;
  layout?: SlideLayout;
  theme?: string;
  backgroundColor?: string;
  generatedBy?: 'ai' | 'teacher';
  aiPrompt?: string;
}

export interface UpdateSlideInput {
  title?: string;
  content?: SlideContent[];
  speakerNotes?: string;
  outlineNodeId?: string;
  visualAids?: string[];
  audioNarration?: string;
  layout?: SlideLayout;
  theme?: string;
  backgroundColor?: string;
}

export interface ReorderSlidesInput {
  slideOrders: Array<{ slideId: string; newOrder: number }>;
}

// API Response types for generating slides
export interface GenerateSlidesInput {
  outline: any[]; // Array format from frontend
  accessibility: string;
}

export interface GenerateSlidesResponse {
  slides: Slide[]; // Generated slides
  success: boolean;
}