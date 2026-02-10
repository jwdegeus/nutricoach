'use server';

import { createClient } from '@/src/lib/supabase/server';
import { AppError } from '@/src/lib/errors/app-error';
import { revalidatePath } from 'next/cache';
import type {
  GroceryStoreRow,
  GroceryStoreOrderRow,
} from '@/src/lib/grocery-stores/grocery-stores.types';
import {
  createGroceryStoreInputSchema,
  updateGroceryStoreInputSchema,
  createGroceryStoreOrderInputSchema,
  updateGroceryStoreOrderInputSchema,
} from '@/src/lib/grocery-stores/grocery-stores.schemas';

const STORE_SELECT =
  'id, user_id, name, address, notes, website_url, cutoff_times, sort_order, created_at, updated_at';

function rowToStore(row: Record<string, unknown>): GroceryStoreRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    address: (row.address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    websiteUrl: (row.website_url as string | null) ?? null,
    cutoffTimes: (row.cutoff_times as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const ORDER_SELECT =
  'id, user_id, store_id, order_date, delivery_date, status, notes, created_at, updated_at';

function rowToOrder(row: Record<string, unknown>): GroceryStoreOrderRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    storeId: row.store_id as string,
    orderDate: row.order_date as string,
    deliveryDate: (row.delivery_date as string | null) ?? null,
    status: (row.status as GroceryStoreOrderRow['status']) ?? 'active',
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function getSupabaseAndUserId(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Je moet ingelogd zijn.');
  }
  return { supabase, userId: user.id };
}

/**
 * List all grocery stores for the current user, ordered by sort_order then created_at.
 */
export async function listGroceryStoresAction(): Promise<{
  ok: true;
  stores: GroceryStoreRow[];
}> {
  const { supabase, userId } = await getSupabaseAndUserId();

  const { data, error } = await supabase
    .from('user_grocery_stores')
    .select(STORE_SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new AppError('DB_ERROR', error.message);

  const stores = (data ?? []).map((row) =>
    rowToStore(row as Record<string, unknown>),
  );
  return { ok: true, stores };
}

/**
 * Create a new grocery store.
 */
export async function createGroceryStoreAction(
  raw: unknown,
): Promise<
  { ok: true; store: GroceryStoreRow } | { ok: false; error: string }
> {
  const parsed = createGroceryStoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Ongeldige invoer';
    return { ok: false, error: msg };
  }

  const { supabase, userId } = await getSupabaseAndUserId();

  const { data: maxOrder } = await supabase
    .from('user_grocery_stores')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder =
    ((maxOrder as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from('user_grocery_stores')
    .insert({
      user_id: userId,
      name: parsed.data.name,
      address: parsed.data.address,
      notes: parsed.data.notes,
      website_url: parsed.data.websiteUrl,
      cutoff_times: parsed.data.cutoffTimes,
      sort_order: sortOrder,
    })
    .select(STORE_SELECT)
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/grocery-stores');
  return { ok: true, store: rowToStore(inserted as Record<string, unknown>) };
}

/**
 * Update an existing grocery store (must be owned by current user).
 */
export async function updateGroceryStoreAction(
  storeId: string,
  raw: unknown,
): Promise<
  { ok: true; store: GroceryStoreRow } | { ok: false; error: string }
> {
  const parsed = updateGroceryStoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Ongeldige invoer';
    return { ok: false, error: msg };
  }

  const { supabase, userId } = await getSupabaseAndUserId();

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.address !== undefined) updates.address = parsed.data.address;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.websiteUrl !== undefined)
    updates.website_url = parsed.data.websiteUrl;
  if (parsed.data.cutoffTimes !== undefined)
    updates.cutoff_times = parsed.data.cutoffTimes;
  if (parsed.data.sortOrder !== undefined)
    updates.sort_order = parsed.data.sortOrder;

  if (Object.keys(updates).length === 0) {
    const { data: existing } = await supabase
      .from('user_grocery_stores')
      .select(STORE_SELECT)
      .eq('id', storeId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) return { ok: false, error: 'Winkel niet gevonden.' };
    return { ok: true, store: rowToStore(existing as Record<string, unknown>) };
  }

  const { data: updated, error } = await supabase
    .from('user_grocery_stores')
    .update(updates)
    .eq('id', storeId)
    .eq('user_id', userId)
    .select(STORE_SELECT)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: 'Winkel niet gevonden.' };

  revalidatePath('/grocery-stores');
  return { ok: true, store: rowToStore(updated as Record<string, unknown>) };
}

/**
 * Delete a grocery store (must be owned by current user).
 */
export async function deleteGroceryStoreAction(
  storeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, userId } = await getSupabaseAndUserId();

  const { error } = await supabase
    .from('user_grocery_stores')
    .delete()
    .eq('id', storeId)
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/grocery-stores');
  return { ok: true };
}

/**
 * Get a single grocery store by id (must be owned by current user).
 */
export async function getGroceryStoreAction(
  storeId: string,
): Promise<
  { ok: true; store: GroceryStoreRow } | { ok: false; error: string }
> {
  const { supabase, userId } = await getSupabaseAndUserId();

  const { data, error } = await supabase
    .from('user_grocery_stores')
    .select(STORE_SELECT)
    .eq('id', storeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Winkel niet gevonden.' };
  return { ok: true, store: rowToStore(data as Record<string, unknown>) };
}

/**
 * List orders for a store (must be owned by current user). Active first, then by order_date desc.
 */
export async function listOrdersByStoreAction(storeId: string): Promise<{
  ok: true;
  orders: GroceryStoreOrderRow[];
}> {
  const { supabase, userId } = await getSupabaseAndUserId();

  const { data: store } = await supabase
    .from('user_grocery_stores')
    .select('id')
    .eq('id', storeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!store) throw new AppError('VALIDATION_ERROR', 'Winkel niet gevonden.');

  const { data, error } = await supabase
    .from('user_grocery_store_orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .order('status', { ascending: true }) // active < cancelled < completed
    .order('order_date', { ascending: false });

  if (error) throw new AppError('DB_ERROR', error.message);
  const orders = (data ?? []).map((row) =>
    rowToOrder(row as Record<string, unknown>),
  );
  return { ok: true, orders };
}

/**
 * Create an order for a store.
 */
export async function createGroceryStoreOrderAction(
  raw: unknown,
): Promise<
  { ok: true; order: GroceryStoreOrderRow } | { ok: false; error: string }
> {
  const parsed = createGroceryStoreOrderInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Ongeldige invoer';
    return { ok: false, error: msg };
  }

  const { supabase, userId } = await getSupabaseAndUserId();

  const { data: store } = await supabase
    .from('user_grocery_stores')
    .select('id')
    .eq('id', parsed.data.storeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!store) return { ok: false, error: 'Winkel niet gevonden.' };

  const insertPayload = {
    user_id: userId,
    store_id: parsed.data.storeId,
    order_date: parsed.data.orderDate,
    delivery_date:
      parsed.data.deliveryDate && parsed.data.deliveryDate !== ''
        ? parsed.data.deliveryDate
        : null,
    status: parsed.data.status,
    notes:
      parsed.data.notes && parsed.data.notes !== '' ? parsed.data.notes : null,
  };

  const { data: inserted, error } = await supabase
    .from('user_grocery_store_orders')
    .insert(insertPayload)
    .select(ORDER_SELECT)
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/grocery-stores');
  revalidatePath(`/grocery-stores/${parsed.data.storeId}`);
  return { ok: true, order: rowToOrder(inserted as Record<string, unknown>) };
}

/**
 * Update an order (must be owned by current user).
 */
export async function updateGroceryStoreOrderAction(
  orderId: string,
  raw: unknown,
): Promise<
  { ok: true; order: GroceryStoreOrderRow } | { ok: false; error: string }
> {
  const parsed = updateGroceryStoreOrderInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Ongeldige invoer';
    return { ok: false, error: msg };
  }

  const { supabase, userId } = await getSupabaseAndUserId();

  const updates: Record<string, unknown> = {};
  if (parsed.data.orderDate !== undefined)
    updates.order_date = parsed.data.orderDate;
  if (parsed.data.deliveryDate !== undefined)
    updates.delivery_date = parsed.data.deliveryDate;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  if (Object.keys(updates).length === 0) {
    const { data: existing } = await supabase
      .from('user_grocery_store_orders')
      .select(ORDER_SELECT)
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) return { ok: false, error: 'Bestelling niet gevonden.' };
    return { ok: true, order: rowToOrder(existing as Record<string, unknown>) };
  }

  const { data: updated, error } = await supabase
    .from('user_grocery_store_orders')
    .update(updates)
    .eq('id', orderId)
    .eq('user_id', userId)
    .select(ORDER_SELECT)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: 'Bestelling niet gevonden.' };

  revalidatePath('/grocery-stores');
  const storeId = (updated as Record<string, unknown>).store_id as string;
  revalidatePath(`/grocery-stores/${storeId}`);
  return { ok: true, order: rowToOrder(updated as Record<string, unknown>) };
}

/**
 * Delete an order (must be owned by current user).
 */
export async function deleteGroceryStoreOrderAction(
  orderId: string,
): Promise<{ ok: true; storeId: string } | { ok: false; error: string }> {
  const { supabase, userId } = await getSupabaseAndUserId();

  const { data: order } = await supabase
    .from('user_grocery_store_orders')
    .select('store_id')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!order) return { ok: false, error: 'Bestelling niet gevonden.' };

  const { error } = await supabase
    .from('user_grocery_store_orders')
    .delete()
    .eq('id', orderId)
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };
  const storeId = (order as { store_id: string }).store_id;
  revalidatePath('/grocery-stores');
  revalidatePath(`/grocery-stores/${storeId}`);
  return { ok: true, storeId };
}
