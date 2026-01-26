"use server";

import { createClient } from "@/src/lib/supabase/server";
import type { ActionResult } from "@/src/lib/actions";

/**
 * Get all ingredient categories (forbidden and required)
 */
export async function getIngredientCategoriesAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      code: string;
      name_nl: string;
      name_en: string | null;
      description: string | null;
      category_type: "forbidden" | "required";
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen categorieën bekijken",
        },
      };
    }

    // Get categories with item counts (admins see all, including inactive)
    const { data: categories, error } = await supabase
      .from("ingredient_categories")
      .select(
        `
        *,
        items:ingredient_category_items(count)
      `
      )
      .order("category_type", { ascending: true })
      .order("display_order", { ascending: true })
      .order("is_active", { ascending: false }); // Active first
    
    console.log(`[getIngredientCategoriesAction] Found ${categories?.length || 0} categories (including inactive)`);

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
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
    console.error("Error in getIngredientCategoriesAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Get diet category constraints for a specific diet
 */
export async function getDietCategoryConstraintsAction(
  dietTypeId: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      category_id: string;
      category_code: string;
      category_name_nl: string;
      category_type: "forbidden" | "required";
      constraint_type: "forbidden" | "required";
      rule_action: "allow" | "block";
      strictness: "hard" | "soft";
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen constraints bekijken",
        },
      };
    }

    // Get ALL constraints for this diet (including inactive for admin view)
    // Sorteer op rule_priority (firewall evaluatie volgorde)
    const { data: constraints, error } = await supabase
      .from("diet_category_constraints")
      .select(
        `
        *,
        category:ingredient_categories(code, name_nl, category_type)
      `
      )
      .eq("diet_type_id", dietTypeId)
      .order("rule_priority", { ascending: false })
      .order("priority", { ascending: false }); // Fallback voor backward compatibility
    
    console.log(`[getDietCategoryConstraintsAction] Query result for diet ${dietTypeId}:`);
    console.log(`  - Error:`, error);
    console.log(`  - Constraints count:`, constraints?.length || 0);
    if (error) {
      console.error(`[getDietCategoryConstraintsAction] Database error:`, error);
    }
    if (constraints && constraints.length > 0) {
      console.log(`[getDietCategoryConstraintsAction] First constraint:`, JSON.stringify(constraints[0], null, 2));
    } else {
      console.warn(`[getDietCategoryConstraintsAction] ⚠️ NO CONSTRAINTS FOUND for diet ${dietTypeId}`);
      console.warn(`[getDietCategoryConstraintsAction] This means no guard rails have been configured via GuardRailsManager yet.`);
    }

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
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
        rule_action: constraint.rule_action || (constraint.constraint_type === 'forbidden' ? 'block' : 'allow'),
        strictness: constraint.strictness,
        min_per_day: constraint.min_per_day,
        min_per_week: constraint.min_per_week,
        priority: constraint.priority,
        rule_priority: constraint.rule_priority ?? constraint.priority ?? 50,
        is_active: constraint.is_active ?? true,
      };
    });
    
    console.log(`[getDietCategoryConstraintsAction] Formatted ${formattedConstraints.length} constraints`);

    return {
      ok: true,
      data: formattedConstraints,
    };
  } catch (error) {
    console.error("Error in getDietCategoryConstraintsAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
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
    constraint_type?: "forbidden" | "required"; // Legacy, wordt afgeleid van rule_action
    rule_action?: "allow" | "block";
    strictness?: "hard" | "soft";
    min_per_day?: number | null;
    min_per_week?: number | null;
    priority?: number;
    rule_priority?: number;
    is_active?: boolean;
  }>
): Promise<ActionResult<void>> {
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin using user_roles table
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen constraints bewerken",
        },
      };
    }

    // Delete existing constraints for this diet
    const { error: deleteError } = await supabase
      .from("diet_category_constraints")
      .delete()
      .eq("diet_type_id", dietTypeId);

    if (deleteError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: deleteError.message,
        },
      };
    }

    // Insert new constraints
    if (constraints.length > 0) {
      const { error: insertError } = await supabase
        .from("diet_category_constraints")
        .insert(
          constraints.map((c) => {
            // Bepaal rule_action: gebruik expliciete rule_action of afleiden van constraint_type
            const ruleAction = c.rule_action || (c.constraint_type === 'forbidden' ? 'block' : 'allow');
            // Bepaal constraint_type voor backward compatibility
            const constraintType = c.constraint_type || (ruleAction === 'block' ? 'forbidden' : 'required');
            // Gebruik rule_priority als expliciet gegeven, anders priority, anders default 50
            const rulePriority = c.rule_priority ?? c.priority ?? 50;
            const priority = c.priority ?? rulePriority; // Behoud priority voor backward compatibility
            
            return {
              diet_type_id: dietTypeId,
              category_id: c.category_id,
              constraint_type: constraintType,
              rule_action: ruleAction,
              strictness: c.strictness || "hard",
              min_per_day: c.min_per_day ?? null,
              min_per_week: c.min_per_week ?? null,
              priority: priority,
              rule_priority: rulePriority,
              is_active: c.is_active ?? true,
            };
          })
        );

      if (insertError) {
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
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
    console.error("Error in upsertDietCategoryConstraintsAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
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
  category_type: "forbidden" | "required";
  parent_category_id?: string | null;
  display_order?: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen categorieën aanmaken",
        },
      };
    }

    // Validate input
    if (!input.code.trim() || !input.name_nl.trim()) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Code en Nederlandse naam zijn verplicht",
        },
      };
    }

    const { data, error } = await supabase
      .from("ingredient_categories")
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
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Categorie met code "${input.code}" bestaat al`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error("Error in createIngredientCategoryAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
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
    name_nl?: string;
    name_en?: string | null;
    description?: string | null;
    display_order?: number;
    is_active?: boolean;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen categorieën bewerken",
        },
      };
    }

    const updateData: any = {};
    if (input.name_nl !== undefined) updateData.name_nl = input.name_nl.trim();
    if (input.name_en !== undefined) updateData.name_en = input.name_en?.trim() || null;
    if (input.description !== undefined) updateData.description = input.description?.trim() || null;
    if (input.display_order !== undefined) updateData.display_order = input.display_order;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await supabase
      .from("ingredient_categories")
      .update(updateData)
      .eq("id", categoryId)
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error("Error in updateIngredientCategoryAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Delete (soft delete) an ingredient category
 */
export async function deleteIngredientCategoryAction(
  categoryId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen categorieën verwijderen",
        },
      };
    }

    // Soft delete by setting is_active = false
    const { error } = await supabase
      .from("ingredient_categories")
      .update({ is_active: false })
      .eq("id", categoryId);

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error in deleteIngredientCategoryAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Update a single diet category constraint
 */
export async function updateDietCategoryConstraintAction(
  constraintId: string,
  input: {
    rule_action?: "allow" | "block";
    strictness?: "hard" | "soft";
    min_per_day?: number | null;
    min_per_week?: number | null;
    priority?: number;
    rule_priority?: number;
    is_active?: boolean;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen constraints bewerken",
        },
      };
    }

    const updateData: any = {};
    if (input.rule_action !== undefined) updateData.rule_action = input.rule_action;
    if (input.strictness !== undefined) updateData.strictness = input.strictness;
    if (input.min_per_day !== undefined) updateData.min_per_day = input.min_per_day;
    if (input.min_per_week !== undefined) updateData.min_per_week = input.min_per_week;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.rule_priority !== undefined) {
      updateData.rule_priority = input.rule_priority;
      // Update priority ook als rule_priority wordt gezet (voor backward compatibility)
      if (input.priority === undefined) {
        updateData.priority = input.rule_priority;
      }
    }
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await supabase
      .from("diet_category_constraints")
      .update(updateData)
      .eq("id", constraintId)
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error("Error in updateDietCategoryConstraintAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Delete a specific diet category constraint
 */
export async function deleteDietCategoryConstraintAction(
  constraintId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen constraints verwijderen",
        },
      };
    }

    const { error } = await supabase
      .from("diet_category_constraints")
      .delete()
      .eq("id", constraintId);

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error in deleteDietCategoryConstraintAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Get ingredient category items (synonyms) for a category
 */
export async function getIngredientCategoryItemsAction(
  categoryId: string
): Promise<
  ActionResult<
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
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen items bekijken",
        },
      };
    }

    const { data: items, error } = await supabase
      .from("ingredient_category_items")
      .select("*")
      .eq("category_id", categoryId)
      .order("display_order", { ascending: true })
      .order("term", { ascending: true });

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
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
    console.error("Error in getIngredientCategoryItemsAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
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
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen items aanmaken",
        },
      };
    }

    if (!input.term.trim()) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Term is verplicht",
        },
      };
    }

    const { data, error } = await supabase
      .from("ingredient_category_items")
      .insert({
        category_id: input.category_id,
        term: input.term.trim().toLowerCase(),
        term_nl: input.term_nl?.trim() || null,
        synonyms: input.synonyms || [],
        display_order: input.display_order || 0,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Term "${input.term}" bestaat al in deze categorie`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error("Error in createIngredientCategoryItemAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
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
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen items bewerken",
        },
      };
    }

    const updateData: any = {};
    if (input.term !== undefined) updateData.term = input.term.trim().toLowerCase();
    if (input.term_nl !== undefined) updateData.term_nl = input.term_nl?.trim() || null;
    if (input.synonyms !== undefined) updateData.synonyms = input.synonyms;
    if (input.display_order !== undefined) updateData.display_order = input.display_order;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await supabase
      .from("ingredient_category_items")
      .update(updateData)
      .eq("id", itemId)
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: { id: data.id },
    };
  } catch (error) {
    console.error("Error in updateIngredientCategoryItemAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Delete an ingredient category item
 */
export async function deleteIngredientCategoryItemAction(
  itemId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen items verwijderen",
        },
      };
    }

    const { error } = await supabase
      .from("ingredient_category_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error in deleteIngredientCategoryItemAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}

/**
 * Migrate legacy diet_rules to new ingredient_categories system
 */
export async function migrateLegacyRulesToNewSystemAction(
  dietTypeId: string
): Promise<ActionResult<{ migrated: number; skipped: number }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn",
        },
      };
    }

    // Check admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!role) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Alleen admins kunnen migreren",
        },
      };
    }

    // Get legacy rules
    const { data: legacyRules, error: rulesError } = await supabase
      .from("diet_rules")
      .select("*")
      .eq("diet_type_id", dietTypeId)
      .eq("is_active", true)
      .in("rule_type", ["exclude_ingredient", "require_ingredient"]);

    if (rulesError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
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
        const isForbidden = rule.rule_type === "exclude_ingredient";
        const isRequired = rule.rule_type === "require_ingredient";

        // Extract category info
        let categoryCode: string;
        let categoryName: string;
        let ingredients: string[] = [];

        if (isForbidden) {
          if (Array.isArray(ruleValue)) {
            // Array of category names
            categoryCode = rule.rule_key || `forbidden_${rule.id.substring(0, 8)}`;
            categoryName = rule.description || ruleValue.join(", ");
            ingredients = ruleValue;
          } else if (ruleValue?.excluded_categories) {
            const categories = Array.isArray(ruleValue.excluded_categories)
              ? ruleValue.excluded_categories
              : [ruleValue.excluded_categories];
            categoryCode = rule.rule_key || `forbidden_${rule.id.substring(0, 8)}`;
            categoryName = rule.description || categories.join(", ");
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
            categoryCode = rule.rule_key || `required_${rule.id.substring(0, 8)}`;
            categoryName = rule.description || ingredients.join(", ");
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
          .replace(/[^a-z0-9_]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");

        // Check if category already exists
        let { data: existingCategory } = await supabase
          .from("ingredient_categories")
          .select("id")
          .eq("code", categoryCode)
          .maybeSingle();

        let categoryId: string;

        if (!existingCategory) {
          // Create category
          const { data: newCategory, error: categoryError } = await supabase
            .from("ingredient_categories")
            .insert({
              code: categoryCode,
              name_nl: categoryName,
              category_type: isForbidden ? "forbidden" : "required",
              is_active: true,
            })
            .select("id")
            .single();

          if (categoryError) {
            console.error(`Error creating category ${categoryCode}:`, categoryError);
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
            .from("ingredient_category_items")
            .select("id")
            .eq("category_id", categoryId)
            .eq("term", term)
            .maybeSingle();

          if (!existingItem) {
            await supabase.from("ingredient_category_items").insert({
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
          .from("diet_category_constraints")
          .select("id")
          .eq("diet_type_id", dietTypeId)
          .eq("category_id", categoryId)
          .maybeSingle();

        if (!existingConstraint) {
          // Create constraint
          const minPerDay =
            isRequired && ruleValue?.frequency === "daily"
              ? ruleValue?.minimumAmount || ruleValue?.minAmountMl || 1
              : null;
          const minPerWeek =
            isRequired &&
            (ruleValue?.frequency === "2x_weekly" || ruleValue?.frequency === "weekly")
              ? ruleValue?.minimumAmount || 1
              : null;

          await supabase.from("diet_category_constraints").insert({
            diet_type_id: dietTypeId,
            category_id: categoryId,
            constraint_type: isForbidden ? "forbidden" : "required",
            rule_action: isForbidden ? "block" : "allow",
            strictness: "hard",
            min_per_day: minPerDay,
            min_per_week: minPerWeek,
            priority: rule.priority || 50,
            rule_priority: rule.priority || 50,
            is_active: true,
          });
        }

        // Deactivate legacy rule
        await supabase
          .from("diet_rules")
          .update({ is_active: false })
          .eq("id", rule.id);

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
    console.error("Error in migrateLegacyRulesToNewSystemAction:", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Onbekende fout",
      },
    };
  }
}
