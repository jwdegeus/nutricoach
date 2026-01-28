/**
 * Guard Rails vNext - Hash Utilities
 * 
 * Deterministic hashing for ruleset content.
 */

import { createHash } from 'crypto';

/**
 * Canonical JSON serialization
 * 
 * Sorts object keys and arrays deterministically for stable hashing.
 * 
 * @param obj - Object to serialize
 * @returns Canonical JSON string
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    // Sort arrays if they contain objects (for determinism)
    const sorted = obj.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return canonicalJson(item);
      }
      return item;
    });
    return JSON.stringify(sorted);
  }
  
  if (typeof obj === 'object') {
    // Sort object keys for determinism
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = canonicalJson((obj as Record<string, unknown>)[key]);
    }
    return JSON.stringify(sorted);
  }
  
  return JSON.stringify(obj);
}

/**
 * Calculate SHA-256 hash of canonical JSON
 * 
 * @param obj - Object to hash
 * @returns SHA-256 hash (hex string)
 */
export function hashContent(obj: unknown): string {
  const canonical = canonicalJson(obj);
  return createHash('sha256').update(canonical).digest('hex');
}
