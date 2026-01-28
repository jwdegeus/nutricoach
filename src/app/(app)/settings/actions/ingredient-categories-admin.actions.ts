'use server';

import { createClient } from '@/src/lib/supabase/server';
import type { ActionResult, ActionResultWithOk } from '@/src/lib/types';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';

/**
 * Normalize a term for deduplication:
 * - trim
 * - collapse whitespace
 * - lowercase
 */
function normalizeTerm(term: string): string {
  return term
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple whitespace to single space
    .toLowerCase();
}

/**
 * Extract JSON from potentially wrapped response (removes markdown code blocks)
 */
function extractJsonFromResponse(rawResponse: string): string {
  let jsonString = rawResponse.trim();

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  // Handle both single-line and multi-line matches
  const codeBlockMatch = jsonString.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/m);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  }

  // Also handle cases where code block might not be at start/end
  jsonString = jsonString
    .replace(/^```(?:json)?\s*/gm, '')
    .replace(/\s*```$/gm, '')
    .trim();

  // Find JSON array by counting brackets (handles nested arrays correctly)
  const arrayStartIdx = jsonString.indexOf('[');
  if (arrayStartIdx !== -1) {
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = arrayStartIdx; i < jsonString.length; i++) {
      const char = jsonString[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
        if (bracketCount === 0) {
          return jsonString.substring(arrayStartIdx, i + 1).trim();
        }
      }
    }
  }

  // Find JSON object by counting braces (only if no array found)
  const objectStartIdx = jsonString.indexOf('{');
  if (objectStartIdx !== -1) {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = objectStartIdx; i < jsonString.length; i++) {
      const char = jsonString[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount === 0) {
          return jsonString.substring(objectStartIdx, i + 1).trim();
        }
      }
    }
  }

  // Fallback: return trimmed string (might fail parsing, but at least we tried)
  return jsonString.trim();
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
    return { valid: false, error: 'Term moet minimaal 2 tekens lang zijn' };
  }

  if (normalized.length > 80) {
    return { valid: false, error: 'Term mag maximaal 80 tekens lang zijn' };
  }

  // Must contain at least one letter (a-z)
  if (!/[a-z]/.test(normalized)) {
    return { valid: false, error: 'Term moet minimaal één letter bevatten' };
  }

  return { valid: true };
}

/**
 * Get all ingredient categories (forbidden and required)
 */
export async function getIngredientCategoriesAction(): Promise<
  ActionResultWithOk<
    Array<{
      id: string;
      code: string;
      name_nl: string;
      name_en: string | null;
      description: string | null;
      category_type: 'forbidden' | 'required';
      display_order: number;
      is_active: boolean;
      items_count?: number;
    }>
  >
> {
  try {
    const supabase = await createClient();

    // Check admin
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen categorieën bekijken',
        },
      };
    }

    // Get categories with item counts (admins see all, including inactive)
    const { data: categories, error } = await supabase
      .from('ingredient_categories')
      .select(
        `
        *,
        items:ingredient_category_items(count)
      `,
      )
      .order('category_type', { ascending: true })
      .order('display_order', { ascending: true })
      .order('is_active', { ascending: false }); // Active first

    console.log(
      `[getIngredientCategoriesAction] Found ${categories?.length || 0} categories (including inactive)`,
    );

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    const categoriesWithCounts = (categories || []).map((cat: any) => ({
      id: cat.id,
      code: cat.code,
      name_nl: cat.name_nl,
      name_en: cat.name_en,
      description: cat.description,
      category_type: cat.category_type,
      display_order: cat.display_order,
      is_active: cat.is_active,
      items_count: cat.items?.[0]?.count || 0,
    }));

    return {
      ok: true,
      data: categoriesWithCounts,
    };
  } catch (error) {
    console.error('Error in getIngredientCategoriesAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Get ingredient categories filtered for a specific diet (for create constraint dropdown)
 *
 * Returns categories that are:
 * - Already used in constraints for this diet, OR
 * - Have diet-specific prefix (e.g., wahls_), OR
 * - Are global/core categories (not diet-prefixed)
 *
 * Only returns active categories, sorted alphabetically.
 */
export async function getIngredientCategoriesForDietAction(
  dietTypeId: string,
): Promise<
  ActionResultWithOk<
    Array<{
      id: string;
      code: string;
      name_nl: string;
      category_type: 'forbidden' | 'required';
      is_diet_specific: boolean; // true if code starts with diet prefix (e.g., wahls_)
    }>
  >
> {
  try {
    const supabase = await createClient();

    // Check admin
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen categorieën bekijken',
        },
      };
    }

    // Get diet type name to determine prefix (e.g., "Wahls Paleo" -> "wahls_")
    const { data: dietType } = await supabase
      .from('diet_types')
      .select('name')
      .eq('id', dietTypeId)
      .single();

    // Determine diet prefix from diet name
    // For "Wahls Paleo", we look for categories starting with "wahls_"
    let dietPrefix: string | null = null;
    if (dietType?.name) {
      const dietNameLower = dietType.name.toLowerCase();
      if (dietNameLower.includes('wahls')) {
        dietPrefix = 'wahls_';
      }
      // Future: add other diet prefixes here
    }

    // Get categories already used in constraints for this diet
    const { data: existingConstraints } = await supabase
      .from('diet_category_constraints')
      .select('category_id')
      .eq('diet_type_id', dietTypeId)
      .eq('is_active', true);

    const usedCategoryIds = new Set(
      (existingConstraints || []).map((c: any) => c.category_id),
    );

    // Get all active categories
    const { data: categories, error } = await supabase
      .from('ingredient_categories')
      .select('id, code, name_nl, category_type')
      .eq('is_active', true)
      .order('name_nl', { ascending: true }); // Alphabetical

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    // Known diet-specific prefixes (for filtering)
    const knownDietPrefixes = ['wahls_']; // Future: add more as needed

    // Filter categories:
    // 1. Categories already used in constraints for this diet (always show)
    // 2. Categories with this diet's prefix (e.g., wahls_)
    // 3. Global/core categories (not starting with any known diet prefix)
    const filtered = (categories || [])
      .filter((cat: any) => {
        // Always include if already used in constraints for this diet
        if (usedCategoryIds.has(cat.id)) {
          return true;
        }

        // If we have a diet prefix (e.g., wahls_)
        if (dietPrefix) {
          // Include if category has this diet's prefix
          if (cat.code.startsWith(dietPrefix)) {
            return true;
          }
          // Include if category is global/core (doesn't start with any known diet prefix)
          const isGlobalCategory = !knownDietPrefixes.some((prefix) =>
            cat.code.startsWith(prefix),
          );
          if (isGlobalCategory) {
            return true;
          }
          // Exclude other diet-specific categories
          return false;
        }

        // If no diet prefix detected, show all active categories (fallback)
        return true;
      })
      .map((cat: any) => ({
        id: cat.id,
        code: cat.code,
        name_nl: cat.name_nl,
        category_type: cat.category_type,
        is_diet_specific: dietPrefix ? cat.code.startsWith(dietPrefix) : false,
      }))
      .sort((a, b) => {
        // Sort: diet-specific first, then alphabetically
        if (a.is_diet_specific && !b.is_diet_specific) return -1;
        if (!a.is_diet_specific && b.is_diet_specific) return 1;
        return a.name_nl.localeCompare(b.name_nl, 'nl');
      });

    return {
      ok: true,
      data: filtered,
    };
  } catch (error) {
    console.error('Error in getIngredientCategoriesForDietAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Get diet category constraints for a specific diet
 */
export async function getDietCategoryConstraintsAction(
  dietTypeId: string,
): Promise<
  ActionResultWithOk<
    Array<{
      id: string;
      category_id: string;
      category_code: string;
      category_name_nl: string;
      category_type: 'forbidden' | 'required';
      constraint_type: 'forbidden' | 'required';
      rule_action: 'allow' | 'block';
      strictness: 'hard' | 'soft';
      min_per_day: number | null;
      min_per_week: number | null;
      priority: number;
      rule_priority: number;
      is_active: boolean;
    }>
  >
> {
  try {
    const supabase = await createClient();

    // Check admin
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen constraints bekijken',
        },
      };
    }

    // Get ALL constraints for this diet (including inactive for admin view)
    // Sorteer op rule_priority (firewall evaluatie volgorde)
    const { data: constraints, error } = await supabase
      .from('diet_category_constraints')
      .select(
        `
        *,
        category:ingredient_categories(code, name_nl, category_type)
      `,
      )
      .eq('diet_type_id', dietTypeId)
      .order('rule_priority', { ascending: false })
      .order('priority', { ascending: false }); // Fallback voor backward compatibility

    console.log(
      `[getDietCategoryConstraintsAction] Query result for diet ${dietTypeId}:`,
    );
    console.log(`  - Error:`, error);
    console.log(`  - Constraints count:`, constraints?.length || 0);
    if (error) {
      console.error(
        `[getDietCategoryConstraintsAction] Database error:`,
        error,
      );
    }
    if (constraints && constraints.length > 0) {
      console.log(
        `[getDietCategoryConstraintsAction] First constraint:`,
        JSON.stringify(constraints[0], null, 2),
      );
    } else {
      console.warn(
        `[getDietCategoryConstraintsAction] ⚠️ NO CONSTRAINTS FOUND for diet ${dietTypeId}`,
      );
      console.warn(
        `[getDietCategoryConstraintsAction] This means no guard rails have been configured via GuardRailsManager yet.`,
      );
    }

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    const formattedConstraints = (constraints || []).map((constraint: any) => {
      // Handle case where category might be null (if category was deleted)
      const category = constraint.category || {};
      return {
        id: constraint.id,
        category_id: constraint.category_id,
        category_code: category.code || 'unknown',
        category_name_nl: category.name_nl || 'Onbekende categorie',
        category_type: category.category_type || constraint.constraint_type,
        constraint_type: constraint.constraint_type,
        rule_action:
          constraint.rule_action ||
          (constraint.constraint_type === 'forbidden' ? 'block' : 'allow'),
        strictness: constraint.strictness,
        min_per_day: constraint.min_per_day,
        min_per_week: constraint.min_per_week,
        priority: constraint.priority,
        rule_priority: constraint.rule_priority ?? constraint.priority ?? 50,
        is_active: constraint.is_active ?? true,
      };
    });

    console.log(
      `[getDietCategoryConstraintsAction] Formatted ${formattedConstraints.length} constraints`,
    );

    return {
      ok: true,
      data: formattedConstraints,
    };
  } catch (error) {
    console.error('Error in getDietCategoryConstraintsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Upsert diet category constraints (bulk update)
 */
export async function upsertDietCategoryConstraintsAction(
  dietTypeId: string,
  constraints: Array<{
    category_id: string;
    constraint_type?: 'forbidden' | 'required'; // Legacy, wordt afgeleid van rule_action
    rule_action?: 'allow' | 'block';
    strictness?: 'hard' | 'soft';
    min_per_day?: number | null;
    min_per_week?: number | null;
    priority?: number;
    rule_priority?: number;
    is_active?: boolean;
  }>,
): Promise<ActionResultWithOk<void>> {
  try {
    const supabase = await createClient();

    // Check admin
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen constraints bewerken',
        },
      };
    }

    // Delete existing constraints for this diet
    const { error: deleteError } = await supabase
      .from('diet_category_constraints')
      .delete()
      .eq('diet_type_id', dietTypeId);

    if (deleteError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: deleteError.message,
        },
      };
    }

    // Insert new constraints
    if (constraints.length > 0) {
      const { error: insertError } = await supabase
        .from('diet_category_constraints')
        .insert(
          constraints.map((c) => {
            // Bepaal rule_action: gebruik expliciete rule_action of afleiden van constraint_type
            const ruleAction =
              c.rule_action ||
              (c.constraint_type === 'forbidden' ? 'block' : 'allow');
            // Bepaal constraint_type voor backward compatibility
            const constraintType =
              c.constraint_type ||
              (ruleAction === 'block' ? 'forbidden' : 'required');
            // Gebruik rule_priority als expliciet gegeven, anders priority, anders default 50
            const rulePriority = c.rule_priority ?? c.priority ?? 50;
            const priority = c.priority ?? rulePriority; // Behoud priority voor backward compatibility

            return {
              diet_type_id: dietTypeId,
              category_id: c.category_id,
              constraint_type: constraintType,
              rule_action: ruleAction,
              strictness: c.strictness || 'hard',
              min_per_day: c.min_per_day ?? null,
              min_per_week: c.min_per_week ?? null,
              priority: priority,
              rule_priority: rulePriority,
              is_active: c.is_active ?? true,
            };
          }),
        );

      if (insertError) {
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: insertError.message,
          },
        };
      }
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error in upsertDietCategoryConstraintsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Create a new ingredient category
 */
export async function createIngredientCategoryAction(input: {
  code: string;
  name_nl: string;
  name_en?: string | null;
  description?: string | null;
  category_type: 'forbidden' | 'required';
  parent_category_id?: string | null;
  display_order?: number;
}): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen categorieën aanmaken',
        },
      };
    }

    // Validate input
    if (!input.code.trim() || !input.name_nl.trim()) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Code en Nederlandse naam zijn verplicht',
        },
      };
    }

    const { data, error } = await supabase
      .from('ingredient_categories')
      .insert({
        code: input.code.trim().toLowerCase(),
        name_nl: input.name_nl.trim(),
        name_en: input.name_en?.trim() || null,
        description: input.description?.trim() || null,
        category_type: input.category_type,
        parent_category_id: input.parent_category_id || null,
        display_order: input.display_order || 0,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Categorie met code "${input.code}" bestaat al`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in createIngredientCategoryAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Update an ingredient category
 */
export async function updateIngredientCategoryAction(
  categoryId: string,
  input: {
    code?: string;
    name_nl?: string;
    name_en?: string | null;
    description?: string | null;
    display_order?: number;
    is_active?: boolean;
  },
): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen categorieën bewerken',
        },
      };
    }

    const updateData: any = {};
    if (input.code !== undefined)
      updateData.code = input.code.trim().toLowerCase();
    if (input.name_nl !== undefined) updateData.name_nl = input.name_nl.trim();
    if (input.name_en !== undefined)
      updateData.name_en = input.name_en?.trim() || null;
    if (input.description !== undefined)
      updateData.description = input.description?.trim() || null;
    if (input.display_order !== undefined)
      updateData.display_order = input.display_order;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await supabase
      .from('ingredient_categories')
      .update(updateData)
      .eq('id', categoryId)
      .select('id')
      .single();

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in updateIngredientCategoryAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Resolve diet prefix from diet type name (same logic as listIngredientCategoriesForDietAction).
 */
function getDietPrefixFromName(dietName: string | null): string | null {
  if (!dietName) return null;
  const lower = dietName.toLowerCase();
  if (lower.includes('wahls')) return 'wahls_';
  return null;
}

/**
 * Update the "herkomst" (origin) of an ingredient category.
 * Herkomst is derived from the category code: diet-specific categories have a diet prefix (e.g. wahls_).
 * This action adds or removes that prefix to switch between "Dit dieet" and "Algemeen".
 */
export async function updateIngredientCategoryOriginAction(
  categoryId: string,
  dietTypeId: string,
  origin: 'diet_specific' | 'general',
): Promise<ActionResultWithOk<{ id: string; code: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen categorieën bewerken',
        },
      };
    }

    const { data: dietType } = await supabase
      .from('diet_types')
      .select('name')
      .eq('id', dietTypeId)
      .single();

    const dietPrefix = getDietPrefixFromName(dietType?.name ?? null);
    if (origin === 'diet_specific' && !dietPrefix) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dit dieettype ondersteunt geen dieet-specifieke herkomst',
        },
      };
    }

    const { data: category, error: fetchError } = await supabase
      .from('ingredient_categories')
      .select('id, code')
      .eq('id', categoryId)
      .single();

    if (fetchError || !category) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: fetchError?.message ?? 'Categorie niet gevonden',
        },
      };
    }

    const currentCode = (category as { code: string }).code;
    let newCode: string;

    if (origin === 'diet_specific') {
      newCode =
        dietPrefix && !currentCode.startsWith(dietPrefix)
          ? `${dietPrefix}${currentCode}`
          : currentCode;
    } else {
      if (dietPrefix && currentCode.startsWith(dietPrefix)) {
        newCode = currentCode.slice(dietPrefix.length);
      } else {
        newCode = currentCode;
      }
    }

    if (!newCode.trim()) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Code mag niet leeg worden',
        },
      };
    }

    newCode = newCode.trim().toLowerCase();

    if (newCode === currentCode) {
      return { ok: true, data: { id: categoryId, code: currentCode } };
    }

    const { data: existing } = await supabase
      .from('ingredient_categories')
      .select('id')
      .eq('code', newCode)
      .neq('id', categoryId)
      .maybeSingle();

    if (existing) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Er bestaat al een categorie met code "${newCode}"`,
        },
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('ingredient_categories')
      .update({ code: newCode })
      .eq('id', categoryId)
      .select('id, code')
      .single();

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: updateError.message,
        },
      };
    }

    return {
      ok: true,
      data: {
        id: (updated as { id: string }).id,
        code: (updated as { code: string }).code,
      },
    };
  } catch (error) {
    console.error('Error in updateIngredientCategoryOriginAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Delete (soft delete) an ingredient category
 */
export async function deleteIngredientCategoryAction(
  categoryId: string,
): Promise<ActionResultWithOk<void>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen categorieën verwijderen',
        },
      };
    }

    // Blokkeer verwijderen als deze categorie nog in een actieve dieetregel (diet_category_constraint) zit
    const { data: inUse } = await supabase
      .from('diet_category_constraints')
      .select('id')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (inUse) {
      return {
        ok: false,
        error: {
          code: 'IN_USE',
          message:
            'Deze ingrediëntgroep wordt nog gebruikt door één of meer dieetregels. Verwijder eerst die dieetregels (tab Dieetregels).',
        },
      };
    }

    // Soft delete by setting is_active = false
    const { error } = await supabase
      .from('ingredient_categories')
      .update({ is_active: false })
      .eq('id', categoryId);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error in deleteIngredientCategoryAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/** Diet Logic (P0–P3): drop, force, limit, pass – zie docs/diet-logic-plan.md */
type DietLogicValue = 'drop' | 'force' | 'limit' | 'pass';

/**
 * Update a single diet category constraint
 * Ondersteunt diet_logic; rule_action wordt afgeleid (drop/limit→block, force/pass→allow).
 */
export async function updateDietCategoryConstraintAction(
  constraintId: string,
  input: {
    rule_action?: 'allow' | 'block';
    strictness?: 'hard' | 'soft';
    min_per_day?: number | null;
    min_per_week?: number | null;
    max_per_day?: number | null;
    max_per_week?: number | null;
    priority?: number;
    rule_priority?: number;
    is_active?: boolean;
    /** True = regel gepauzeerd (niet geëvalueerd). Los van strictness. */
    is_paused?: boolean;
    /** Diet Logic (P0–P3); bij zetten wordt rule_action afgeleid: drop/limit→block, force/pass→allow */
    diet_logic?: DietLogicValue;
  },
): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen constraints bewerken',
        },
      };
    }

    const updateData: any = {};
    if (input.rule_action !== undefined)
      updateData.rule_action = input.rule_action;
    if (input.strictness !== undefined)
      updateData.strictness = input.strictness;
    if (input.min_per_day !== undefined)
      updateData.min_per_day = input.min_per_day;
    if (input.min_per_week !== undefined)
      updateData.min_per_week = input.min_per_week;
    if (input.max_per_day !== undefined)
      updateData.max_per_day = input.max_per_day;
    if (input.max_per_week !== undefined)
      updateData.max_per_week = input.max_per_week;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.rule_priority !== undefined) {
      updateData.rule_priority = input.rule_priority;
      if (input.priority === undefined) {
        updateData.priority = input.rule_priority;
      }
    }
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.is_paused !== undefined) updateData.is_paused = input.is_paused;
    if (input.diet_logic !== undefined) {
      updateData.diet_logic = input.diet_logic;
      // rule_action afleiden uit diet_logic (docs/diet-logic-plan.md)
      updateData.rule_action =
        input.diet_logic === 'drop' || input.diet_logic === 'limit'
          ? 'block'
          : 'allow';
    }

    const { data, error } = await supabase
      .from('diet_category_constraints')
      .update(updateData)
      .eq('id', constraintId)
      .select('id')
      .single();

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in updateDietCategoryConstraintAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Delete a specific diet category constraint
 */
export async function deleteDietCategoryConstraintAction(
  constraintId: string,
): Promise<ActionResultWithOk<void>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen constraints verwijderen',
        },
      };
    }

    const { error } = await supabase
      .from('diet_category_constraints')
      .delete()
      .eq('id', constraintId);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error in deleteDietCategoryConstraintAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * List ingredient categories for a diet with item counts (read-only overview)
 *
 * Returns categories filtered for the diet (same logic as getIngredientCategoriesForDietAction)
 * but includes item counts for display.
 */
export async function listIngredientCategoriesForDietAction(
  dietTypeId: string,
): Promise<
  ActionResultWithOk<
    Array<{
      id: string;
      code: string;
      name_nl: string;
      category_type: 'forbidden' | 'required';
      is_diet_specific: boolean;
      items_count: number; // Active items count
    }>
  >
> {
  try {
    const supabase = await createClient();

    // Check admin
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen categorieën bekijken',
        },
      };
    }

    // Get diet type name to determine prefix
    const { data: dietType } = await supabase
      .from('diet_types')
      .select('name')
      .eq('id', dietTypeId)
      .single();

    // Determine diet prefix
    let dietPrefix: string | null = null;
    if (dietType?.name) {
      const dietNameLower = dietType.name.toLowerCase();
      if (dietNameLower.includes('wahls')) {
        dietPrefix = 'wahls_';
      }
    }

    // Get categories already used in constraints for this diet
    const { data: existingConstraints } = await supabase
      .from('diet_category_constraints')
      .select('category_id')
      .eq('diet_type_id', dietTypeId)
      .eq('is_active', true);

    const usedCategoryIds = new Set(
      (existingConstraints || []).map((c: any) => c.category_id),
    );

    // Known diet-specific prefixes
    const knownDietPrefixes = ['wahls_'];

    // Get all active categories
    const { data: categories, error } = await supabase
      .from('ingredient_categories')
      .select('id, code, name_nl, category_type')
      .eq('is_active', true)
      .order('name_nl', { ascending: true });

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    // Filter categories
    const filteredCategories = (categories || []).filter((cat: any) => {
      // Always include if already used
      if (usedCategoryIds.has(cat.id)) {
        return true;
      }

      if (dietPrefix) {
        // Include if has diet prefix
        if (cat.code.startsWith(dietPrefix)) {
          return true;
        }
        // Include if global
        const isGlobalCategory = !knownDietPrefixes.some((prefix) =>
          cat.code.startsWith(prefix),
        );
        if (isGlobalCategory) {
          return true;
        }
        return false;
      }

      return true;
    });

    // Get item counts for filtered categories (efficient: count per category)
    const categoryIds = filteredCategories.map((cat: any) => cat.id);
    const itemsCountMap = new Map<string, number>();

    // For each category, get count efficiently
    if (categoryIds.length > 0) {
      // Use a more efficient approach: get counts per category
      // Note: Supabase doesn't support GROUP BY directly in select, so we'll do individual counts
      // For better performance with many categories, we could use a Postgres function, but for now this works
      const countPromises = categoryIds.map(async (categoryId: string) => {
        const { count, error } = await supabase
          .from('ingredient_category_items')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', categoryId)
          .eq('is_active', true);

        if (!error && count !== null) {
          itemsCountMap.set(categoryId, count);
        }
      });

      await Promise.all(countPromises);
    }

    // Map and sort categories
    const filtered = filteredCategories
      .map((cat: any) => ({
        id: cat.id,
        code: cat.code,
        name_nl: cat.name_nl,
        category_type: cat.category_type,
        is_diet_specific: dietPrefix ? cat.code.startsWith(dietPrefix) : false,
        items_count: itemsCountMap.get(cat.id) || 0,
      }))
      .sort((a, b) => {
        // Sort: diet-specific first, then alphabetically
        if (a.is_diet_specific && !b.is_diet_specific) return -1;
        if (!a.is_diet_specific && b.is_diet_specific) return 1;
        return a.name_nl.localeCompare(b.name_nl, 'nl');
      });

    return {
      ok: true,
      data: filtered,
    };
  } catch (error) {
    console.error('Error in listIngredientCategoriesForDietAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Read ingredient category items for a category (read-only, with limit)
 *
 * Returns first N items (default 50) + total count for pagination info.
 */
export async function readIngredientCategoryItemsAction(
  categoryId: string,
  limit: number = 50,
): Promise<
  ActionResultWithOk<{
    items: Array<{
      id: string;
      term: string;
      term_nl: string | null;
      synonyms: string[];
      display_order: number;
      is_active: boolean;
      subgroup_id: string | null;
    }>;
    total_count: number;
    has_more: boolean;
  }>
> {
  try {
    const supabase = await createClient();

    // Check admin
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen items bekijken',
        },
      };
    }

    // Get total count (active items only)
    const { count: totalCount, error: countError } = await supabase
      .from('ingredient_category_items')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('is_active', true);

    if (countError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: countError.message,
        },
      };
    }

    // Get first N items (active only), including subgroup_id
    const { data: items, error } = await supabase
      .from('ingredient_category_items')
      .select(
        'id, term, term_nl, synonyms, display_order, is_active, subgroup_id',
      )
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('term', { ascending: true })
      .limit(limit);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    const formattedItems = (items || []).map((item: any) => ({
      id: item.id,
      term: item.term,
      term_nl: item.term_nl,
      synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
      display_order: item.display_order,
      is_active: item.is_active,
      subgroup_id: item.subgroup_id || null,
    }));

    return {
      ok: true,
      data: {
        items: formattedItems,
        total_count: totalCount || 0,
        has_more: (totalCount || 0) > limit,
      },
    };
  } catch (error) {
    console.error('Error in readIngredientCategoryItemsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Get ingredient category items (synonyms) for a category
 */
export async function getIngredientCategoryItemsAction(
  categoryId: string,
): Promise<
  ActionResultWithOk<
    Array<{
      id: string;
      category_id: string;
      term: string;
      term_nl: string | null;
      synonyms: string[];
      display_order: number;
      is_active: boolean;
    }>
  >
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen items bekijken',
        },
      };
    }

    const { data: items, error } = await supabase
      .from('ingredient_category_items')
      .select('*')
      .eq('category_id', categoryId)
      .order('display_order', { ascending: true })
      .order('term', { ascending: true });

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    const formattedItems = (items || []).map((item: any) => ({
      id: item.id,
      category_id: item.category_id,
      term: item.term,
      term_nl: item.term_nl,
      synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
      display_order: item.display_order,
      is_active: item.is_active,
    }));

    return {
      ok: true,
      data: formattedItems,
    };
  } catch (error) {
    console.error('Error in getIngredientCategoryItemsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Create an ingredient category item (with synonyms)
 */
export async function createIngredientCategoryItemAction(input: {
  category_id: string;
  term: string;
  term_nl?: string | null;
  synonyms?: string[];
  display_order?: number;
}): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen items aanmaken',
        },
      };
    }

    if (!input.term.trim()) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Term is verplicht',
        },
      };
    }

    const { data, error } = await supabase
      .from('ingredient_category_items')
      .insert({
        category_id: input.category_id,
        term: input.term.trim().toLowerCase(),
        term_nl: input.term_nl?.trim() || null,
        synonyms: input.synonyms || [],
        display_order: input.display_order || 0,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Term "${input.term}" bestaat al in deze categorie`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in createIngredientCategoryItemAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Update an ingredient category item
 */
export async function updateIngredientCategoryItemAction(
  itemId: string,
  input: {
    term?: string;
    term_nl?: string | null;
    synonyms?: string[];
    display_order?: number;
    is_active?: boolean;
    subgroup_id?: string | null;
  },
): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen items bewerken',
        },
      };
    }

    const updateData: any = {};
    if (input.term !== undefined)
      updateData.term = input.term.trim().toLowerCase();
    if (input.term_nl !== undefined)
      updateData.term_nl = input.term_nl?.trim() || null;
    if (input.synonyms !== undefined) updateData.synonyms = input.synonyms;
    if (input.display_order !== undefined)
      updateData.display_order = input.display_order;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.subgroup_id !== undefined)
      updateData.subgroup_id = input.subgroup_id;

    const { data, error } = await supabase
      .from('ingredient_category_items')
      .update(updateData)
      .eq('id', itemId)
      .select('id')
      .single();

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in updateIngredientCategoryItemAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Delete an ingredient category item (soft delete: sets is_active=false)
 */
export async function deleteIngredientCategoryItemAction(
  itemId: string,
): Promise<ActionResultWithOk<void>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen items verwijderen',
        },
      };
    }

    // Soft delete: set is_active=false
    const { error } = await supabase
      .from('ingredient_category_items')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error in deleteIngredientCategoryItemAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Generate subgroup suggestions using AI based on category name
 *
 * Level 1: Suggests logical subgroups for a category (e.g., for "non-gluten grains": rijst, pasta's, granen)
 */
export async function generateSubgroupSuggestionsAction(input: {
  categoryId: string;
  categoryName: string;
  categoryCode?: string;
}): Promise<
  ActionResultWithOk<{
    suggestions: Array<{
      name: string;
      nameNl: string;
      description?: string;
    }>;
  }>
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen AI suggesties genereren',
        },
      };
    }

    // Fetch existing subgroups
    const { data: existingSubgroups } = await supabase
      .from('ingredient_subgroups')
      .select('name, name_nl')
      .eq('category_id', input.categoryId)
      .eq('is_active', true);

    const existingNames = new Set<string>();
    (existingSubgroups || []).forEach((sg) => {
      if (sg.name) existingNames.add(normalizeTerm(sg.name));
      if (sg.name_nl) existingNames.add(normalizeTerm(sg.name_nl));
    });

    const gemini = getGeminiClient();

    const prompt = `Je bent een expert in ingrediënten en voedingscategorieën.

Gegeven de ingrediëntgroep: "${input.categoryName}"${input.categoryCode ? ` (code: ${input.categoryCode})` : ''}

BELANGRIJK - BESTAANDE SUBGROEPEN:
${existingNames.size > 0 ? `Deze categorie heeft al de volgende subgroepen: ${Array.from(existingNames).join(', ')}` : 'Deze categorie heeft nog geen subgroepen'}

Gevraagd:
1. Genereer 5-8 logische subgroepen die deze categorie zouden kunnen organiseren
2. VOORKOM duplicaten: controleer zorgvuldig dat je suggesties niet overlappen met bestaande subgroepen
3. Voor elke subgroep: geef een Nederlandse naam (bijv. "rijst", "pasta's", "granen")
4. Focus op logische groeperingen die helpen om ingrediënten beter te organiseren
5. Subgroepen moeten algemeen genoeg zijn om meerdere specifieke ingrediënten te bevatten

Voorbeeld voor "Non-Gluten Granen":
- name: "rijst", nameNl: "rijst", description: "Verschillende soorten rijst"
- name: "pasta's", nameNl: "pasta's", description: "Glutenvrije pasta varianten"
- name: "granen", nameNl: "granen", description: "Andere glutenvrije granen"

Return alleen een JSON array met deze structuur:
[
  {
    "name": "subgroup_name",
    "nameNl": "nederlandse_naam",
    "description": "optionele beschrijving"
  },
  ...
]

Zorg dat alle namen lowercase zijn en geen speciale tekens bevatten (behalve spaties).
VOORKOM DUPLICATEN met bestaande subgroepen.`;

    const jsonSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          nameNl: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
        required: ['name', 'nameNl'],
      },
    };

    try {
      const rawResponse = await gemini.generateJson({
        prompt,
        jsonSchema,
        temperature: 0.7,
        purpose: 'enrich',
      });

      // Extract JSON from potentially wrapped response (remove markdown code blocks)
      const jsonString = extractJsonFromResponse(rawResponse);
      let parsed: unknown;

      try {
        parsed = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Raw response:', rawResponse.substring(0, 500));
        throw new Error(
          `Invalid JSON from AI: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`,
        );
      }

      const suggestions = Array.isArray(parsed) ? parsed : [];

      // Normalize and filter suggestions
      const normalized = suggestions
        .map((s: any) => {
          if (
            !s.name ||
            !s.nameNl ||
            typeof s.name !== 'string' ||
            typeof s.nameNl !== 'string'
          ) {
            return null;
          }

          const normalizedName = normalizeTerm(s.name);
          const normalizedNameNl = normalizeTerm(s.nameNl);

          // Check for duplicates
          if (
            existingNames.has(normalizedName) ||
            existingNames.has(normalizedNameNl)
          ) {
            return null;
          }

          return {
            name: normalizedName,
            nameNl: normalizedNameNl,
            description: s.description ? s.description.trim() : undefined,
          };
        })
        .filter(
          (
            s: unknown,
          ): s is { name: string; nameNl: string; description?: string } =>
            s !== null && typeof s === 'object',
        ) as { name: string; nameNl: string; description?: string }[];

      return {
        ok: true,
        data: {
          suggestions: normalized,
        },
      };
    } catch (aiError) {
      console.error('Error calling Gemini API:', aiError);
      return {
        ok: false,
        error: {
          code: 'AI_ERROR',
          message: `AI generatie mislukt: ${aiError instanceof Error ? aiError.message : 'Onbekende fout'}`,
        },
      };
    }
  } catch (error) {
    console.error('Error in generateSubgroupSuggestionsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Generate ingredient suggestions using AI based on category name
 *
 * Level 2: Uses Gemini AI to find specific ingredients for a subgroup (e.g., for "rijst": zilvervliesrijst, basmati, bruine rijst)
 */
const DEFAULT_SUGGESTION_LIMIT = 30;

export async function generateIngredientSuggestionsAction(input: {
  categoryId: string;
  categoryName: string;
  categoryCode?: string;
  subgroupId?: string | null;
  subgroupName?: string | null;
  /** Aantal suggesties om te vragen (default 30). Bij "Meer suggesties" kan je hetzelfde of lager houden. */
  limit?: number;
  /** Extra termen om uit te sluiten (bv. eerder gegenereerde suggesties in deze sessie). */
  excludeTerms?: string[];
}): Promise<
  ActionResultWithOk<{
    suggestions: Array<{
      term: string;
      termNl: string | null;
      synonyms: string[];
    }>;
  }>
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen AI suggesties genereren',
        },
      };
    }

    // Fetch existing items - in category or in specific subgroup
    const itemsQuery = supabase
      .from('ingredient_category_items')
      .select('term, term_nl, synonyms')
      .eq('category_id', input.categoryId)
      .eq('is_active', true);

    // If subgroup is specified, only check items in that subgroup
    // Otherwise check all items in category (including those without subgroup)
    if (input.subgroupId) {
      itemsQuery.eq('subgroup_id', input.subgroupId);
    }

    const { data: existingItems, error: itemsError } = await itemsQuery;

    if (itemsError) {
      console.error('Error fetching existing items:', itemsError);
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Kon bestaande items niet ophalen',
        },
      };
    }

    // Build list of existing terms and synonyms for AI context
    const existingTerms = new Set<string>();
    const existingSynonyms = new Set<string>();

    (existingItems || []).forEach((item) => {
      const normalizedTerm = normalizeTerm(item.term);
      existingTerms.add(normalizedTerm);

      if (item.term_nl) {
        const normalizedNl = normalizeTerm(item.term_nl);
        existingTerms.add(normalizedNl);
      }

      if (item.synonyms && Array.isArray(item.synonyms)) {
        item.synonyms.forEach((syn: string) => {
          existingSynonyms.add(normalizeTerm(syn));
        });
      }
    });

    // Merge excludeTerms (e.g. already-shown suggestions when fetching "more")
    (input.excludeTerms ?? []).forEach((t) =>
      existingTerms.add(normalizeTerm(t)),
    );

    const existingTermsList = Array.from(existingTerms).slice(0, 80); // Limit to avoid huge prompts
    const existingSynonymsList = Array.from(existingSynonyms).slice(0, 50);

    const gemini = getGeminiClient();

    // Build prompt for AI with existing items context and subgroup context
    const subgroupContext =
      input.subgroupId && input.subgroupName
        ? `\n\nSUBGROEP CONTEXT:
Je genereert suggesties voor de subgroep "${input.subgroupName}" binnen "${input.categoryName}".
Focus specifiek op ingrediënten die bij deze subgroep horen.`
        : '';

    const prompt = `Je bent een expert in ingrediënten en voedingscategorieën.

Gegeven de ingrediëntgroep: "${input.categoryName}"${input.categoryCode ? ` (code: ${input.categoryCode})` : ''}${subgroupContext}

BELANGRIJK - BESTAANDE INGREDIËNTEN:
${
  input.subgroupId && input.subgroupName
    ? `De subgroep "${input.subgroupName}" bevat al de volgende ingrediënten:`
    : `Deze categorie bevat al de volgende ingrediënten:`
}
${existingTermsList.length > 0 ? `- Termen: ${existingTermsList.join(', ')}` : '- Geen bestaande termen'}
${existingSynonymsList.length > 0 ? `- Synoniemen: ${existingSynonymsList.join(', ')}` : '- Geen bestaande synoniemen'}

Gevraagd:
1. Genereer tot ${input.limit ?? DEFAULT_SUGGESTION_LIMIT} NIEUWE relevante ingrediënten die tot ${input.subgroupId ? `de subgroep "${input.subgroupName}"` : 'deze groep'} behoren maar NOG NIET in de lijst staan
2. VOORKOM duplicaten: controleer zorgvuldig dat je suggesties niet overlappen met bestaande termen of synoniemen
3. Voor elk ingrediënt: geef ALLEEN de Nederlandse term (lowercase), en 3-5 Nederlandse synoniemen
4. Synoniemen moeten ook lowercase zijn en ALLEEN Nederlands
5. Focus op ingrediënten die logisch bij ${input.subgroupId ? `deze subgroep` : 'deze categorie'} horen maar nog ontbreken
6. GEEN Engels - alleen Nederlandse termen

Voorbeeld voor ${input.subgroupId ? `subgroep "pasta" binnen "Glutenhoudende granen"` : `"Glutenhoudende granen"`} (als pasta en tarwe al bestaan):
- term: "gerst", termNl: "gerst", synonyms: ["parelgort", "gerstemeel", "gepofte gerst"]
- term: "rogge", termNl: "rogge", synonyms: ["roggebloem", "roggebrood", "donkere rogge"]

Return alleen een JSON array met deze structuur:
[
  {
    "term": "ingredient_name",
    "termNl": "nederlandse_naam",
    "synonyms": ["synonym1", "synonym2", ...]
  },
  ...
]

Zorg dat alle termen lowercase zijn en geen speciale tekens bevatten (behalve spaties die worden genormaliseerd).
VOORKOM DUPLICATEN met bestaande termen en synoniemen.`;

    const jsonSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          termNl: { type: 'string', nullable: true },
          synonyms: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['term'],
      },
    };

    try {
      const rawResponse = await gemini.generateJson({
        prompt,
        jsonSchema,
        temperature: 0.7,
        purpose: 'enrich',
      });

      // Extract JSON from potentially wrapped response (remove markdown code blocks)
      const jsonString = extractJsonFromResponse(rawResponse);
      let parsed: unknown;

      try {
        parsed = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Raw response:', rawResponse.substring(0, 500));
        throw new Error(
          `Invalid JSON from AI: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`,
        );
      }

      const suggestions = Array.isArray(parsed) ? parsed : [];

      // Normalize and validate suggestions
      const normalized = suggestions
        .map((s: any) => {
          if (!s.term || typeof s.term !== 'string') return null;

          const normalizedTerm = normalizeTerm(s.term);

          // Check if this term already exists (case-insensitive)
          if (existingTerms.has(normalizedTerm)) {
            return null; // Skip duplicates
          }

          // Use Dutch term as primary, fallback to term if no termNl
          const termNl = s.termNl ? normalizeTerm(s.termNl) : normalizedTerm;
          return {
            term: normalizedTerm,
            termNl: termNl,
            synonyms: Array.isArray(s.synonyms)
              ? s.synonyms
                  .map((syn: any) =>
                    typeof syn === 'string' ? normalizeTerm(syn) : null,
                  )
                  .filter(
                    (syn: string | null): syn is string =>
                      syn !== null && syn.length >= 2,
                  )
                  .filter((syn: string) => !existingSynonyms.has(syn)) // Filter out existing synonyms
              : [],
          };
        })
        .filter(
          (
            s: unknown,
          ): s is { term: string; termNl: string | null; synonyms: string[] } =>
            s !== null && typeof s === 'object',
        ) as { term: string; termNl: string | null; synonyms: string[] }[];

      return {
        ok: true,
        data: {
          suggestions: normalized,
        },
      };
    } catch (aiError) {
      console.error('Error calling Gemini API:', aiError);
      return {
        ok: false,
        error: {
          code: 'AI_ERROR',
          message: `AI generatie mislukt: ${aiError instanceof Error ? aiError.message : 'Onbekende fout'}`,
        },
      };
    }
  } catch (error) {
    console.error('Error in generateIngredientSuggestionsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Add a single ingredient category item
 *
 * Validates and normalizes the term, checks for duplicates (case-insensitive),
 * and returns the created item ID or an error if duplicate.
 */
export async function addIngredientCategoryItemAction(input: {
  categoryId: string;
  subgroupId?: string | null;
  term: string;
  termNl?: string | null;
  synonyms?: string[];
}): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen items toevoegen',
        },
      };
    }

    // Validate term
    const validation = validateTerm(input.term);
    if (!validation.valid) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error || 'Ongeldige term',
        },
      };
    }

    // Normalize term
    const normalizedTerm = normalizeTerm(input.term);

    // If subgroup_id is provided, verify it belongs to the category
    if (input.subgroupId) {
      const { data: subgroup } = await supabase
        .from('ingredient_subgroups')
        .select('category_id')
        .eq('id', input.subgroupId)
        .eq('is_active', true)
        .single();

      if (!subgroup || subgroup.category_id !== input.categoryId) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Subgroep hoort niet bij deze categorie',
          },
        };
      }
    }

    // Check for existing duplicate (case-insensitive, including inactive items)
    // Check in category if no subgroup, or in subgroup if subgroup is provided
    const query = supabase
      .from('ingredient_category_items')
      .select('id, is_active')
      .eq('category_id', input.categoryId)
      .ilike('term', normalizedTerm);

    if (input.subgroupId) {
      query.eq('subgroup_id', input.subgroupId);
    } else {
      query.is('subgroup_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      if (existing.is_active) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Term "${input.term}" bestaat al in deze categorie`,
          },
        };
      } else {
        // Reactivate soft-deleted item
        const { data: reactivated, error: reactivateError } = await supabase
          .from('ingredient_category_items')
          .update({
            is_active: true,
            term_nl: input.termNl?.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select('id')
          .single();

        if (reactivateError) {
          return {
            ok: false,
            error: {
              code: 'DB_ERROR',
              message: reactivateError.message,
            },
          };
        }

        return {
          ok: true,
          data: { id: reactivated.id },
        };
      }
    }

    // Normalize synonyms
    const normalizedSynonyms = (input.synonyms || [])
      .map((syn) => normalizeTerm(syn))
      .filter((syn) => syn.length >= 2 && syn !== normalizedTerm); // Remove duplicates and same as main term

    // Insert new item
    const { data, error } = await supabase
      .from('ingredient_category_items')
      .insert({
        category_id: input.categoryId,
        subgroup_id: input.subgroupId || null,
        term: normalizedTerm,
        term_nl: input.termNl?.trim() || null,
        synonyms: normalizedSynonyms,
        display_order: 0,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Term "${input.term}" bestaat al in deze categorie`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in addIngredientCategoryItemAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Bulk add ingredient category items
 *
 * Parses lines from text input, normalizes and validates each term,
 * deduplicates (case-insensitive), and returns summary of added/skipped items.
 *
 * Max 200 items per bulk action (anti-abuse).
 */
export async function bulkAddIngredientCategoryItemsAction(input: {
  categoryId: string;
  termsText: string; // Multi-line text, one term per line
}): Promise<
  ActionResultWithOk<{
    added: string[]; // Terms that were successfully added
    skippedDuplicates: string[]; // Terms that were skipped (already exist)
    skippedInvalid: Array<{ term: string; error: string }>; // Terms that failed validation
    totalProcessed: number;
  }>
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen items bulk toevoegen',
        },
      };
    }

    // Parse lines: split, trim, filter empty
    const lines = input.termsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Geen geldige termen gevonden',
        },
      };
    }

    // Anti-abuse: max 200 items
    if (lines.length > 200) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Maximaal 200 termen per bulk actie toegestaan',
        },
      };
    }

    // Normalize and validate all terms
    const normalizedTerms = new Map<string, string>(); // normalized -> original
    const validationResults: Array<{
      original: string;
      normalized: string;
      valid: boolean;
      error?: string;
    }> = [];

    for (const originalTerm of lines) {
      const normalized = normalizeTerm(originalTerm);

      // Skip if we've already seen this normalized term in the input
      if (normalizedTerms.has(normalized)) {
        continue;
      }

      normalizedTerms.set(normalized, originalTerm);

      const validation = validateTerm(originalTerm);
      validationResults.push({
        original: originalTerm,
        normalized,
        valid: validation.valid,
        error: validation.error,
      });
    }

    // Get existing items for this category (all, including inactive)
    const { data: existingItems, error: fetchError } = await supabase
      .from('ingredient_category_items')
      .select('term, is_active')
      .eq('category_id', input.categoryId);

    if (fetchError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: fetchError.message,
        },
      };
    }

    const existingTermsSet = new Set(
      (existingItems || []).map((item: any) => item.term.toLowerCase()),
    );
    const existingInactiveTerms = new Map<string, string>(); // normalized term -> original term from DB
    (existingItems || []).forEach((item: any) => {
      if (!item.is_active) {
        existingInactiveTerms.set(item.term.toLowerCase(), item.term);
      }
    });

    // Separate valid/invalid/duplicate terms
    const added: string[] = [];
    const skippedDuplicates: string[] = [];
    const skippedInvalid: Array<{ term: string; error: string }> = [];
    const toInsert: Array<{ term: string; original: string }> = [];
    const toReactivate: Array<{ term: string; original: string }> = [];

    for (const result of validationResults) {
      if (!result.valid) {
        skippedInvalid.push({
          term: result.original,
          error: result.error || 'Ongeldige term',
        });
        continue;
      }

      const normalized = result.normalized;
      if (existingTermsSet.has(normalized)) {
        skippedDuplicates.push(result.original);
        continue;
      }

      // Check if inactive version exists
      if (existingInactiveTerms.has(normalized)) {
        toReactivate.push({
          term: normalized,
          original: result.original,
        });
      } else {
        toInsert.push({
          term: normalized,
          original: result.original,
        });
      }
    }

    // Reactivate soft-deleted items
    if (toReactivate.length > 0) {
      const reactivatePromises = toReactivate.map(
        async ({ term, original }) => {
          const { error: reactivateError } = await supabase
            .from('ingredient_category_items')
            .update({
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq('category_id', input.categoryId)
            .ilike('term', term);

          if (!reactivateError) {
            added.push(original);
          }
        },
      );

      await Promise.all(reactivatePromises);
    }

    // Insert new items (without synonyms for bulk - user can add those manually)
    if (toInsert.length > 0) {
      const insertData = toInsert.map(({ term }) => ({
        category_id: input.categoryId,
        term,
        term_nl: null,
        synonyms: [],
        display_order: 0,
        is_active: true,
      }));

      const { error: insertError } = await supabase
        .from('ingredient_category_items')
        .insert(insertData);

      if (insertError) {
        // Partial failure - some might have been inserted
        // We'll report what we can, but this is a best-effort scenario
        console.error('Error inserting bulk items:', insertError);
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: `Fout bij toevoegen items: ${insertError.message}`,
          },
        };
      }

      // All inserts succeeded
      toInsert.forEach(({ original }) => {
        added.push(original);
      });
    }

    return {
      ok: true,
      data: {
        added,
        skippedDuplicates,
        skippedInvalid,
        totalProcessed: lines.length,
      },
    };
  } catch (error) {
    console.error('Error in bulkAddIngredientCategoryItemsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Migrate legacy diet_rules to new ingredient_categories system
 */
export async function migrateLegacyRulesToNewSystemAction(
  dietTypeId: string,
): Promise<ActionResultWithOk<{ migrated: number; skipped: number }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen migreren',
        },
      };
    }

    // Get legacy rules
    const { data: legacyRules, error: rulesError } = await supabase
      .from('diet_rules')
      .select('*')
      .eq('diet_type_id', dietTypeId)
      .eq('is_active', true)
      .in('rule_type', ['exclude_ingredient', 'require_ingredient']);

    if (rulesError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: rulesError.message,
        },
      };
    }

    if (!legacyRules || legacyRules.length === 0) {
      return {
        ok: true,
        data: { migrated: 0, skipped: 0 },
      };
    }

    let migrated = 0;
    let skipped = 0;

    for (const rule of legacyRules) {
      try {
        const ruleValue = rule.rule_value as any;
        const isForbidden = rule.rule_type === 'exclude_ingredient';
        const isRequired = rule.rule_type === 'require_ingredient';

        // Extract category info
        let categoryCode: string;
        let categoryName: string;
        let ingredients: string[] = [];

        if (isForbidden) {
          if (Array.isArray(ruleValue)) {
            // Array of category names
            categoryCode =
              rule.rule_key || `forbidden_${rule.id.substring(0, 8)}`;
            categoryName = rule.description || ruleValue.join(', ');
            ingredients = ruleValue;
          } else if (ruleValue?.excluded_categories) {
            const categories = Array.isArray(ruleValue.excluded_categories)
              ? ruleValue.excluded_categories
              : [ruleValue.excluded_categories];
            categoryCode =
              rule.rule_key || `forbidden_${rule.id.substring(0, 8)}`;
            categoryName = rule.description || categories.join(', ');
            ingredients = categories;
          } else {
            skipped++;
            continue;
          }
        } else if (isRequired) {
          if (ruleValue?.requiredIngredients) {
            ingredients = Array.isArray(ruleValue.requiredIngredients)
              ? ruleValue.requiredIngredients
              : [ruleValue.requiredIngredients];
            categoryCode =
              rule.rule_key || `required_${rule.id.substring(0, 8)}`;
            categoryName = rule.description || ingredients.join(', ');
          } else {
            skipped++;
            continue;
          }
        } else {
          skipped++;
          continue;
        }

        // Normalize category code
        categoryCode = categoryCode
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');

        // Check if category already exists
        const { data: existingCategory } = await supabase
          .from('ingredient_categories')
          .select('id')
          .eq('code', categoryCode)
          .maybeSingle();

        let categoryId: string;

        if (!existingCategory) {
          // Create category
          const { data: newCategory, error: categoryError } = await supabase
            .from('ingredient_categories')
            .insert({
              code: categoryCode,
              name_nl: categoryName,
              category_type: isForbidden ? 'forbidden' : 'required',
              is_active: true,
            })
            .select('id')
            .single();

          if (categoryError) {
            console.error(
              `Error creating category ${categoryCode}:`,
              categoryError,
            );
            skipped++;
            continue;
          }

          categoryId = newCategory.id;
        } else {
          categoryId = existingCategory.id;
        }

        // Create category items for ingredients
        for (const ingredient of ingredients) {
          const term = ingredient.toLowerCase().trim();
          if (!term) continue;

          // Check if item already exists
          const { data: existingItem } = await supabase
            .from('ingredient_category_items')
            .select('id')
            .eq('category_id', categoryId)
            .eq('term', term)
            .maybeSingle();

          if (!existingItem) {
            await supabase.from('ingredient_category_items').insert({
              category_id: categoryId,
              term: term,
              term_nl: ingredient,
              synonyms: [],
              is_active: true,
            });
          }
        }

        // Check if constraint already exists
        const { data: existingConstraint } = await supabase
          .from('diet_category_constraints')
          .select('id')
          .eq('diet_type_id', dietTypeId)
          .eq('category_id', categoryId)
          .maybeSingle();

        if (!existingConstraint) {
          // Create constraint
          const minPerDay =
            isRequired && ruleValue?.frequency === 'daily'
              ? ruleValue?.minimumAmount || ruleValue?.minAmountMl || 1
              : null;
          const minPerWeek =
            isRequired &&
            (ruleValue?.frequency === '2x_weekly' ||
              ruleValue?.frequency === 'weekly')
              ? ruleValue?.minimumAmount || 1
              : null;

          await supabase.from('diet_category_constraints').insert({
            diet_type_id: dietTypeId,
            category_id: categoryId,
            constraint_type: isForbidden ? 'forbidden' : 'required',
            rule_action: isForbidden ? 'block' : 'allow',
            strictness: 'hard',
            min_per_day: minPerDay,
            min_per_week: minPerWeek,
            priority: rule.priority || 50,
            rule_priority: rule.priority || 50,
            is_active: true,
          });
        }

        // Deactivate legacy rule
        await supabase
          .from('diet_rules')
          .update({ is_active: false })
          .eq('id', rule.id);

        migrated++;
      } catch (err) {
        console.error(`Error migrating rule ${rule.id}:`, err);
        skipped++;
      }
    }

    return {
      ok: true,
      data: { migrated, skipped },
    };
  } catch (error) {
    console.error('Error in migrateLegacyRulesToNewSystemAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

// ============================================================================
// Ingredient Subgroups Actions
// ============================================================================

/**
 * Get all subgroups for a category, with their items
 */
export async function getIngredientSubgroupsAction(categoryId: string): Promise<
  ActionResultWithOk<
    Array<{
      id: string;
      category_id: string;
      name: string;
      name_nl: string | null;
      description: string | null;
      display_order: number;
      is_active: boolean;
      items_count: number;
      items: Array<{
        id: string;
        term: string;
        term_nl: string | null;
        synonyms: string[];
        display_order: number;
        is_active: boolean;
      }>;
    }>
  >
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen subgroepen bekijken',
        },
      };
    }

    // Get subgroups
    const { data: subgroups, error: subgroupsError } = await supabase
      .from('ingredient_subgroups')
      .select('*')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (subgroupsError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: subgroupsError.message,
        },
      };
    }

    // Get items for each subgroup and count
    const subgroupsWithItems = await Promise.all(
      (subgroups || []).map(async (subgroup) => {
        // Get items count
        const { count } = await supabase
          .from('ingredient_category_items')
          .select('*', { count: 'exact', head: true })
          .eq('subgroup_id', subgroup.id)
          .eq('is_active', true);

        // Get items
        const { data: items } = await supabase
          .from('ingredient_category_items')
          .select('id, term, term_nl, synonyms, display_order, is_active')
          .eq('subgroup_id', subgroup.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('term', { ascending: true });

        return {
          id: subgroup.id,
          category_id: subgroup.category_id,
          name: subgroup.name,
          name_nl: subgroup.name_nl,
          description: subgroup.description,
          display_order: subgroup.display_order,
          is_active: subgroup.is_active,
          items_count: count || 0,
          items: (items || []).map((item) => ({
            id: item.id,
            term: item.term,
            term_nl: item.term_nl,
            synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
            display_order: item.display_order,
            is_active: item.is_active,
          })),
        };
      }),
    );

    return {
      ok: true,
      data: subgroupsWithItems,
    };
  } catch (error) {
    console.error('Error in getIngredientSubgroupsAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Create a new ingredient subgroup
 */
export async function createIngredientSubgroupAction(input: {
  categoryId: string;
  name: string;
  nameNl?: string | null;
  description?: string | null;
  displayOrder?: number;
}): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen subgroepen aanmaken',
        },
      };
    }

    // Validate name
    if (!input.name.trim() || input.name.trim().length < 2) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Subgroep naam moet minimaal 2 tekens lang zijn',
        },
      };
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('ingredient_subgroups')
      .select('id')
      .eq('category_id', input.categoryId)
      .ilike('name', input.name.trim())
      .maybeSingle();

    if (existing) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Subgroep "${input.name}" bestaat al in deze categorie`,
        },
      };
    }

    // Insert
    const { data, error } = await supabase
      .from('ingredient_subgroups')
      .insert({
        category_id: input.categoryId,
        name: input.name.trim(),
        name_nl: input.nameNl?.trim() || null,
        description: input.description?.trim() || null,
        display_order: input.displayOrder ?? 0,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Subgroep "${input.name}" bestaat al in deze categorie`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in createIngredientSubgroupAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Update an ingredient subgroup
 */
export async function updateIngredientSubgroupAction(
  subgroupId: string,
  input: {
    name?: string;
    nameNl?: string | null;
    description?: string | null;
    displayOrder?: number;
  },
): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen subgroepen bewerken',
        },
      };
    }

    // Build update object
    const updates: Record<string, any> = {};
    if (input.name !== undefined) {
      if (!input.name.trim() || input.name.trim().length < 2) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Subgroep naam moet minimaal 2 tekens lang zijn',
          },
        };
      }
      updates.name = input.name.trim();
    }
    if (input.nameNl !== undefined) {
      updates.name_nl = input.nameNl?.trim() || null;
    }
    if (input.description !== undefined) {
      updates.description = input.description?.trim() || null;
    }
    if (input.displayOrder !== undefined) {
      updates.display_order = input.displayOrder;
    }

    if (Object.keys(updates).length === 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Geen velden om bij te werken',
        },
      };
    }

    // Check for duplicate name if name is being updated
    if (input.name !== undefined) {
      const { data: subgroup } = await supabase
        .from('ingredient_subgroups')
        .select('category_id')
        .eq('id', subgroupId)
        .single();

      if (subgroup) {
        const { data: existing } = await supabase
          .from('ingredient_subgroups')
          .select('id')
          .eq('category_id', subgroup.category_id)
          .ilike('name', input.name.trim())
          .neq('id', subgroupId)
          .maybeSingle();

        if (existing) {
          return {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Subgroep "${input.name}" bestaat al in deze categorie`,
            },
          };
        }
      }
    }

    // Update
    const { data, error } = await supabase
      .from('ingredient_subgroups')
      .update(updates)
      .eq('id', subgroupId)
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Subgroep naam bestaat al in deze categorie`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in updateIngredientSubgroupAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Delete (soft delete) an ingredient subgroup
 */
export async function deleteIngredientSubgroupAction(
  subgroupId: string,
): Promise<ActionResultWithOk<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Alleen admins kunnen subgroepen verwijderen',
        },
      };
    }

    // Soft delete: set is_active = false
    const { data, error } = await supabase
      .from('ingredient_subgroups')
      .update({ is_active: false })
      .eq('id', subgroupId)
      .select('id')
      .single();

    if (error) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error('Error in deleteIngredientSubgroupAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}
