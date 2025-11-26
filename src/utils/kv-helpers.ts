// src/utils/kv-helpers.ts
import { KvCache } from '@liquidmetal-ai/raindrop-framework';

/**
 * Helper to safely get and parse JSON from KV
 */
export async function getJSON<T>(
  kv: KvCache,
  key: string
): Promise<T | null> {
  const data = await kv.get(key);
  if (!data) return null;
  
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Failed to parse JSON for key ${key}:`, error);
    return null;
  }
}

/**
 * Helper to stringify and put JSON into KV
 */
export async function putJSON<T>(
  kv: KvCache,
  key: string,
  value: T,
  options?: { expirationTtl?: number }
): Promise<void> {
  await kv.put(key, JSON.stringify(value), options);
}

/**
 * Helper to check if a key exists
 */
export async function exists(kv: KvCache, key: string): Promise<boolean> {
  const value = await kv.get(key);
  return value !== null;
}

/**
 * Helper to get all keys with a prefix
 */
export async function getAllKeys(
  kv: KvCache,
  prefix: string
): Promise<string[]> {
  const result = await kv.list({ prefix });
  return result.keys.map(k => k.name);
}

/**
 * Helper to delete all keys with a prefix
 */
export async function deleteByPrefix(
  kv: KvCache,
  prefix: string
): Promise<number> {
  const keys = await getAllKeys(kv, prefix);
  
  await Promise.all(keys.map(key => kv.delete(key)));
  
  return keys.length;
}

/**
 * Helper to batch get multiple keys
 */
export async function batchGet<T>(
  kv: KvCache,
  keys: string[]
): Promise<Map<string, T>> {
  const results = await Promise.all(
    keys.map(async key => ({
      key,
      value: await getJSON<T>(kv, key)
    }))
  );
  
  const map = new Map<string, T>();
  results.forEach(({ key, value }) => {
    if (value !== null) {
      map.set(key, value);
    }
  });
  
  return map;
}

/**
 * Helper to batch put multiple key-value pairs
 */
export async function batchPut<T>(
  kv: KvCache,
  entries: Array<{ key: string; value: T; ttl?: number }>
): Promise<void> {
  await Promise.all(
    entries.map(({ key, value, ttl }) =>
      putJSON(kv, key, value, ttl ? { expirationTtl: ttl } : undefined)
    )
  );
}