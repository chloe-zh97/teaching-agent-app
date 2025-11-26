export interface KVCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}

export class KVHelpers {
  constructor(private kv: KVCache) {}

  /**
   * Get and parse JSON from KV storage
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.kv.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Failed to parse JSON for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set JSON value in KV storage
   */
  async setJSON<T>(key: string, value: T, ttl?: number): Promise<void> {
    const jsonStr = JSON.stringify(value);
    await this.kv.put(key, jsonStr, ttl ? { expirationTtl: ttl } : undefined);
  }

  /**
   * Delete a key from KV storage
   */
  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  /**
   * List keys with a given prefix
   */
  async listKeys(prefix: string): Promise<string[]> {
    const result = await this.kv.list({ prefix });
    return result.keys.map(k => k.name);
  }

  /**
   * Delete all keys with a given prefix
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    const keys = await this.listKeys(prefix);
    await Promise.all(keys.map(key => this.delete(key)));
    return keys.length;
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.kv.get(key);
    return value !== null;
  }

  /**
   * Get multiple keys at once
   */
  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.getJSON<T>(key)));
  }

  /**
   * Add item to a list stored in KV
   */
  async addToList(listKey: string, item: string): Promise<void> {
    const list = await this.getJSON<string[]>(listKey) || [];
    if (!list.includes(item)) {
      list.push(item);
      await this.setJSON(listKey, list);
    }
  }

  /**
   * Remove item from a list stored in KV
   */
  async removeFromList(listKey: string, item: string): Promise<void> {
    const list = await this.getJSON<string[]>(listKey) || [];
    const filtered = list.filter(i => i !== item);
    await this.setJSON(listKey, filtered);
  }

  /**
   * Get a list stored in KV
   */
  async getList(listKey: string): Promise<string[]> {
    return await this.getJSON<string[]>(listKey) || [];
  }
}