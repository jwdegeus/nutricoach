'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import type { ActionResult } from '@/src/lib/types';

export type DietTypeInput = {
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
};

export type DietTypeOutput = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Get all diet types (including inactive ones for admin)
 */
export async function getAllDietTypes(): Promise<
  ActionResult<DietTypeOutput[]>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins kunnen alle dieettypes zien' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('diet_types')
    .select(
      'id, name, description, display_order, is_active, created_at, updated_at',
    )
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching all diet types:', error);
    return { error: `Fout bij ophalen dieettypes: ${error.message}` };
  }

  return {
    data:
      data?.map((dt) => ({
        id: dt.id,
        name: dt.name,
        description: dt.description,
        displayOrder: dt.display_order,
        isActive: dt.is_active,
        createdAt: dt.created_at,
        updatedAt: dt.updated_at,
      })) ?? [],
  };
}

/**
 * Create a new diet type (admin only)
 */
export async function createDietType(
  input: DietTypeInput,
): Promise<ActionResult<DietTypeOutput>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins kunnen dieettypes aanmaken' };
  }

  if (!input.name || input.name.trim().length === 0) {
    return { error: 'Naam is verplicht' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('diet_types')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      display_order: input.displayOrder,
      is_active: input.isActive,
    })
    .select(
      'id, name, description, display_order, is_active, created_at, updated_at',
    )
    .single();

  if (error) {
    console.error('Error creating diet type:', error);
    // Check for unique constraint violation
    if (error.code === '23505') {
      return { error: 'Een dieettype met deze naam bestaat al' };
    }
    return { error: `Fout bij aanmaken dieettype: ${error.message}` };
  }

  return {
    data: {
      id: data.id,
      name: data.name,
      description: data.description,
      displayOrder: data.display_order,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Update a diet type (admin only)
 */
export async function updateDietType(
  id: string,
  input: Partial<DietTypeInput>,
): Promise<ActionResult<DietTypeOutput>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins kunnen dieettypes bewerken' };
  }

  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) {
    updateData.name = input.name.trim();
  }
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }
  if (input.displayOrder !== undefined) {
    updateData.display_order = input.displayOrder;
  }
  if (input.isActive !== undefined) {
    updateData.is_active = input.isActive;
  }

  if (Object.keys(updateData).length === 0) {
    return { error: 'Geen wijzigingen opgegeven' };
  }

  const { data, error } = await supabase
    .from('diet_types')
    .update(updateData)
    .eq('id', id)
    .select(
      'id, name, description, display_order, is_active, created_at, updated_at',
    )
    .single();

  if (error) {
    console.error('Error updating diet type:', error);
    if (error.code === '23505') {
      return { error: 'Een dieettype met deze naam bestaat al' };
    }
    return { error: `Fout bij bijwerken dieettype: ${error.message}` };
  }

  return {
    data: {
      id: data.id,
      name: data.name,
      description: data.description,
      displayOrder: data.display_order,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Delete a diet type (soft delete by setting is_active = false)
 */
export async function deleteDietType(id: string): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen dieettypes verwijderen',
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('diet_types')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting diet type:', error);
    return { error: `Fout bij verwijderen dieettype: ${error.message}` };
  }

  return { data: undefined };
}
