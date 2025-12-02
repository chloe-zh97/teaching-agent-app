// src/models/transcription.model.ts
import { Timestamp } from './common.model';

export type TranscriptionStatus = 'processing' | 'completed' | 'failed';

export type TranscriptionProvider = 'elevenlabs' | 'openai-whisper' | 'google' | 'other';

export interface Transcription {
  transcriptionId: string;
  userId: string; // Who requested the transcription
  
  // Audio info
  originalFilename: string;
  fileSize: number; // bytes
  mimeType: string; // e.g., 'audio/webm', 'audio/mpeg'
  duration?: number; // seconds
  
  // Transcription result
  text: string;
  confidence?: number; // 0-1
  language?: string; // Detected or specified language
  
  // Processing info
  status: TranscriptionStatus;
  provider: TranscriptionProvider;
  processingTime?: number; // milliseconds
  errorMessage?: string;
  
  // Metadata
  purpose?: string; // e.g., 'course-creation', 'question', 'note'
  relatedEntityId?: string; // courseId, sessionId, etc.
  relatedEntityType?: string; // 'course', 'session', 'interaction'
  
  // Timestamps
  createdAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt: Timestamp; // Auto-delete after 24 hours (using KV TTL)
}

export interface CreateTranscriptionInput {
  userId: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  audioData?: string; // Base64 encoded audio (if stored temporarily)
  language?: string;
  purpose?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

export interface UpdateTranscriptionInput {
  text?: string;
  confidence?: number;
  language?: string;
  duration?: number;
  status?: TranscriptionStatus;
  processingTime?: number;
  errorMessage?: string;
}

export interface TranscriptionSummary {
  transcriptionId: string;
  originalFilename: string;
  text: string;
  status: TranscriptionStatus;
  createdAt: Timestamp;
}

// For API response
export interface TranscribeAudioResponse {
  transcriptionId: string;
  text: string;
  fileSize: number;
  mimeType: string;
  duration?: number;
  confidence?: number;
  language?: string;
  processingTime?: number;
}