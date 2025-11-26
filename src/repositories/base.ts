import { nanoid } from 'nanoid';
import { KVCache, KVHelpers } from '../utils/kv-helpers';

export abstract class BaseRepository<T> {
  protected kv: KVHelpers;

  constructor(kvCache: KVCache) {
    this.kv = new KVHelpers(kvCache);
  }

  protected generateId(prefix: string): string {
    return `${prefix}_${nanoid()}`;
  }

  protected now(): string {
    return new Date().toISOString();
  }

  /**
   * Build a KV key for an entity
   */
  protected abstract buildKey(...parts: string[]): string;
  
  /**
   * Create a new entity
   */
  async create(id: string, data: T): Promise<T> {
    const key = this.buildKey(id);
    await this.kv.setJSON(key, data);
    return data;
  }

  /**
   * Get an entity by ID
   */
  async get(id: string): Promise<T | null> {
    const key = this.buildKey(id);
    return await this.kv.getJSON<T>(key);
  }









}