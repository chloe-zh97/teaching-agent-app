// src/repositories/transcription.repository.ts
import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import {
  Transcription,
  CreateTranscriptionInput,
  UpdateTranscriptionInput,
  TranscriptionStatus,
  TranscriptionSummary,
} from '../models/transcription.model';
import { Timestamp } from '../models/common.model';
import { NotFoundError, ValidationError } from '../utils/errors';

export class TranscriptionRepository {
  private kv: KvCache;
  private readonly TRANSCRIPTION_PREFIX = 'transcription:';
  private readonly USER_TRANSCRIPTIONS_PREFIX = 'user_transcriptions:';
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(kv: KvCache) {
    this.kv = kv;
  }

  /**
   * Generate a unique transcription ID
   */
  private generateId(): string {
    return `transcription_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new transcription record
   */
  async create(input: CreateTranscriptionInput): Promise<Transcription> {
    // Validate required fields
    if (!input.userId || !input.originalFilename || !input.mimeType) {
      throw new ValidationError('userId, originalFilename, and mimeType are required');
    }

    const now: Timestamp = new Date().toISOString();
    const transcriptionId = this.generateId();
    const expiresAt = new Date(Date.now() + this.TTL_SECONDS * 1000).toISOString();

    const transcription: Transcription = {
      transcriptionId,
      userId: input.userId,
      originalFilename: input.originalFilename,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      duration: undefined,
      text: '', // Will be filled when processing completes
      confidence: undefined,
      language: input.language,
      status: 'processing',
      provider: 'elevenlabs', // Default provider
      purpose: input.purpose,
      relatedEntityId: input.relatedEntityId,
      relatedEntityType: input.relatedEntityType,
      createdAt: now,
      expiresAt,
    };

    // Store transcription data with TTL
    const transcriptionKey = `${this.TRANSCRIPTION_PREFIX}${transcriptionId}`;
    await this.kv.put(transcriptionKey, JSON.stringify(transcription), {
      expirationTtl: this.TTL_SECONDS,
    });

    // Create user index with TTL
    await this.kv.put(
      `${this.USER_TRANSCRIPTIONS_PREFIX}${input.userId}:${transcriptionId}`,
      transcriptionId,
      { expirationTtl: this.TTL_SECONDS }
    );

    return transcription;
  }

  /**
   * Get transcription by ID
   */
  async getById(transcriptionId: string): Promise<Transcription> {
    const transcriptionKey = `${this.TRANSCRIPTION_PREFIX}${transcriptionId}`;
    const transcriptionData = await this.kv.get(transcriptionKey);

    if (!transcriptionData) {
      throw new NotFoundError(`Transcription with ID ${transcriptionId} not found or expired`);
    }

    return JSON.parse(transcriptionData) as Transcription;
  }

  /**
   * Update transcription (mainly for completing processing)
   */
  async update(transcriptionId: string, updates: UpdateTranscriptionInput): Promise<Transcription> {
    const existingTranscription = await this.getById(transcriptionId);

    const now = new Date().toISOString();
    const updatedTranscription: Transcription = {
      ...existingTranscription,
      text: updates.text ?? existingTranscription.text,
      confidence: updates.confidence ?? existingTranscription.confidence,
      language: updates.language ?? existingTranscription.language,
      duration: updates.duration ?? existingTranscription.duration,
      status: updates.status ?? existingTranscription.status,
      processingTime: updates.processingTime ?? existingTranscription.processingTime,
      errorMessage: updates.errorMessage ?? existingTranscription.errorMessage,
      completedAt: updates.status === 'completed' ? now : existingTranscription.completedAt,
    };

    // Calculate remaining TTL
    const expiresAt = new Date(existingTranscription.expiresAt).getTime();
    const remainingTtl = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

    // Update with remaining TTL
    const transcriptionKey = `${this.TRANSCRIPTION_PREFIX}${transcriptionId}`;
    await this.kv.put(transcriptionKey, JSON.stringify(updatedTranscription), {
      expirationTtl: remainingTtl,
    });

    return updatedTranscription;
  }

  /**
   * Complete transcription with result
   */
  async complete(
    transcriptionId: string,
    text: string,
    metadata?: {
      confidence?: number;
      language?: string;
      duration?: number;
      processingTime?: number;
    }
  ): Promise<Transcription> {
    return this.update(transcriptionId, {
      text,
      status: 'completed',
      confidence: metadata?.confidence,
      language: metadata?.language,
      duration: metadata?.duration,
      processingTime: metadata?.processingTime,
    });
  }

  /**
   * Mark transcription as failed
   */
  async fail(transcriptionId: string, errorMessage: string): Promise<Transcription> {
    return this.update(transcriptionId, {
      status: 'failed',
      errorMessage,
    });
  }

  /**
   * Delete transcription (manual deletion before expiry)
   */
  async delete(transcriptionId: string): Promise<void> {
    const transcription = await this.getById(transcriptionId);

    // Delete transcription data
    const transcriptionKey = `${this.TRANSCRIPTION_PREFIX}${transcriptionId}`;
    await this.kv.delete(transcriptionKey);

    // Delete user index
    await this.kv.delete(
      `${this.USER_TRANSCRIPTIONS_PREFIX}${transcription.userId}:${transcriptionId}`
    );
  }

  /**
   * List transcriptions by user
   */
  async listByUser(
    userId: string,
    options?: { limit?: number; status?: TranscriptionStatus }
  ): Promise<Transcription[]> {
    const prefix = `${this.USER_TRANSCRIPTIONS_PREFIX}${userId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 50,
    });

    const transcriptions: Transcription[] = [];
    for (const key of result.keys) {
      try {
        const transcriptionId = key.name.split(':').pop() || '';
        const transcription = await this.getById(transcriptionId);
        
        // Filter by status if provided
        if (!options?.status || transcription.status === options.status) {
          transcriptions.push(transcription);
        }
      } catch (error) {
        // Transcription expired or deleted, skip
        console.error(`Error fetching transcription from key ${key.name}:`, error);
      }
    }

    // Sort by createdAt descending (most recent first)
    return transcriptions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Get transcription summaries for a user
   */
  async getUserSummaries(userId: string, limit?: number): Promise<TranscriptionSummary[]> {
    const transcriptions = await this.listByUser(userId, { limit });
    
    return transcriptions.map(t => ({
      transcriptionId: t.transcriptionId,
      originalFilename: t.originalFilename,
      text: t.text.substring(0, 200) + (t.text.length > 200 ? '...' : ''), // Truncate
      status: t.status,
      createdAt: t.createdAt,
    }));
  }

  /**
   * Get recent transcriptions (for specific purpose)
   */
  async listByPurpose(
    userId: string,
    purpose: string,
    limit: number = 10
  ): Promise<Transcription[]> {
    const allTranscriptions = await this.listByUser(userId, { limit: 50 });
    
    return allTranscriptions
      .filter(t => t.purpose === purpose)
      .slice(0, limit);
  }

  /**
   * Count user transcriptions
   */
  async countByUser(userId: string): Promise<number> {
    const transcriptions = await this.listByUser(userId);
    return transcriptions.length;
  }

  /**
   * Get transcriptions by related entity
   */
  async listByRelatedEntity(
    relatedEntityType: string,
    relatedEntityId: string
  ): Promise<Transcription[]> {
    // Note: This requires scanning, so it's less efficient
    // In production, you might want to add a specific index for this
    const prefix = this.TRANSCRIPTION_PREFIX;
    const result = await this.kv.list({ prefix, limit: 100 });

    const transcriptions: Transcription[] = [];
    for (const key of result.keys) {
      try {
        const transcriptionData = await this.kv.get(key.name);
        if (transcriptionData) {
          const transcription = JSON.parse(transcriptionData) as Transcription;
          if (
            transcription.relatedEntityType === relatedEntityType &&
            transcription.relatedEntityId === relatedEntityId
          ) {
            transcriptions.push(transcription);
          }
        }
      } catch (error) {
        console.error(`Error fetching transcription from key ${key.name}:`, error);
      }
    }

    return transcriptions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Cleanup expired transcriptions (called periodically)
   * Note: KV TTL handles this automatically, but this can be used for manual cleanup
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    const prefix = this.TRANSCRIPTION_PREFIX;
    const result = await this.kv.list({ prefix, limit: 1000 });

    let deletedCount = 0;
    for (const key of result.keys) {
      try {
        const transcriptionData = await this.kv.get(key.name);
        if (transcriptionData) {
          const transcription = JSON.parse(transcriptionData) as Transcription;
          const expiresAt = new Date(transcription.expiresAt).getTime();
          
          if (expiresAt <= now) {
            await this.delete(transcription.transcriptionId);
            deletedCount++;
          }
        }
      } catch (error) {
        console.error(`Error cleaning up transcription ${key.name}:`, error);
      }
    }

    return deletedCount;
  }
}