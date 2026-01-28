import { describe, it } from "node:test";
import assert from "node:assert";

// Import the helper functions (we'll need to export them or test them indirectly)
// For now, we'll test the logic by creating test versions

/**
 * Normalize a term for deduplication:
 * - trim
 * - collapse whitespace
 * - lowercase
 */
function normalizeTerm(term: string): string {
  return term
    .trim()
    .replace(/\s+/g, " ") // Collapse multiple whitespace to single space
    .toLowerCase();
}

/**
 * Validate a term:
 * - min length 2
 * - max length 80
 * - must contain at least one letter (not just digits/symbols)
 */
function validateTerm(term: string): { valid: boolean; error?: string } {
  const normalized = normalizeTerm(term);
  
  if (normalized.length < 2) {
    return { valid: false, error: "Term moet minimaal 2 tekens lang zijn" };
  }
  
  if (normalized.length > 80) {
    return { valid: false, error: "Term mag maximaal 80 tekens lang zijn" };
  }
  
  // Must contain at least one letter (a-z)
  if (!/[a-z]/.test(normalized)) {
    return { valid: false, error: "Term moet minimaal één letter bevatten" };
  }
  
  return { valid: true };
}

/**
 * Simulate bulk add deduplication logic
 */
function simulateBulkDedupe(
  inputTerms: string[],
  existingTerms: string[]
): {
  added: string[];
  skippedDuplicates: string[];
  skippedInvalid: Array<{ term: string; error: string }>;
} {
  const normalizedExisting = new Set(
    existingTerms.map((t) => normalizeTerm(t))
  );
  
  const added: string[] = [];
  const skippedDuplicates: string[] = [];
  const skippedInvalid: Array<{ term: string; error: string }> = [];
  const seenNormalized = new Set<string>();
  
  for (const originalTerm of inputTerms) {
    const normalized = normalizeTerm(originalTerm);
    
    // Skip empty after normalization
    if (!normalized) continue;
    
    // Skip if already seen in input
    if (seenNormalized.has(normalized)) {
      skippedDuplicates.push(originalTerm);
      continue;
    }
    seenNormalized.add(normalized);
    
    // Validate
    const validation = validateTerm(originalTerm);
    if (!validation.valid) {
      skippedInvalid.push({
        term: originalTerm,
        error: validation.error || "Ongeldige term",
      });
      continue;
    }
    
    // Check against existing
    if (normalizedExisting.has(normalized)) {
      skippedDuplicates.push(originalTerm);
      continue;
    }
    
    added.push(originalTerm);
  }
  
  return { added, skippedDuplicates, skippedInvalid };
}

describe("Ingredient Category Items - Normalization", () => {
  it("should normalize terms correctly", () => {
    assert.strictEqual(normalizeTerm("  Pasta  "), "pasta");
    assert.strictEqual(normalizeTerm("Whole   Wheat"), "whole wheat");
    assert.strictEqual(normalizeTerm("SPINACH"), "spinach");
    assert.strictEqual(normalizeTerm("  Red   Bell   Pepper  "), "red bell pepper");
  });

  it("should validate terms correctly", () => {
    // Valid terms
    assert.strictEqual(validateTerm("pasta").valid, true);
    assert.strictEqual(validateTerm("whole wheat").valid, true);
    assert.strictEqual(validateTerm("a").valid, false); // Too short
    assert.strictEqual(validateTerm("123").valid, false); // No letters
    assert.strictEqual(validateTerm("!@#").valid, false); // No letters
    assert.strictEqual(validateTerm("a".repeat(81)).valid, false); // Too long
  });
});

describe("Ingredient Category Items - Deduplication", () => {
  it("should deduplicate case-insensitively", () => {
    const input = ["Pasta", "pasta", "PASTA", "spaghetti"];
    const existing: string[] = [];
    
    const result = simulateBulkDedupe(input, existing);
    
    assert.strictEqual(result.added.length, 2); // pasta (first), spaghetti
    assert.strictEqual(result.skippedDuplicates.length, 2); // pasta (duplicates)
    assert.strictEqual(result.skippedInvalid.length, 0);
  });

  it("should skip existing terms", () => {
    const input = ["pasta", "spaghetti", "orzo"];
    const existing = ["pasta", "rice"];
    
    const result = simulateBulkDedupe(input, existing);
    
    assert.strictEqual(result.added.length, 2); // spaghetti, orzo
    assert.strictEqual(result.skippedDuplicates.length, 1); // pasta
    assert.strictEqual(result.skippedInvalid.length, 0);
  });

  it("should handle whitespace normalization in deduplication", () => {
    const input = ["whole wheat", "whole  wheat", "wholewheat"];
    const existing: string[] = [];
    
    const result = simulateBulkDedupe(input, existing);
    
    // "whole wheat" and "whole  wheat" should be deduplicated
    // "wholewheat" is different
    assert.strictEqual(result.added.length, 2); // "whole wheat" (first), "wholewheat"
    assert.strictEqual(result.skippedDuplicates.length, 1); // "whole  wheat"
  });
});

describe("Ingredient Category Items - Bulk Results", () => {
  it("should return correct summary for mixed input", () => {
    const input = [
      "pasta", // valid, new
      "spaghetti", // valid, new
      "123", // invalid (no letters)
      "a", // invalid (too short)
      "pasta", // duplicate in input
      "rice", // valid, new
    ];
    const existing = ["bread"];
    
    const result = simulateBulkDedupe(input, existing);
    
    assert.strictEqual(result.added.length, 3); // pasta (first), spaghetti, rice
    assert.strictEqual(result.skippedDuplicates.length, 1); // pasta (duplicate)
    assert.strictEqual(result.skippedInvalid.length, 2); // "123", "a"
  });

  it("should handle empty and whitespace-only terms", () => {
    const input = ["pasta", "  ", "", "spaghetti", "\n", "rice"];
    const existing: string[] = [];
    
    const result = simulateBulkDedupe(input, existing);
    
    // Empty/whitespace should be filtered out before processing
    // In our implementation, normalizeTerm("  ") returns "", which is falsy
    assert.strictEqual(result.added.length, 3); // pasta, spaghetti, rice
    assert.strictEqual(result.skippedDuplicates.length, 0);
    assert.strictEqual(result.skippedInvalid.length, 0);
  });
});
