/**
 * Grocery Stores Types
 *
 * User-owned favorite grocery stores; orders per store.
 */

export type GroceryStoreRow = {
  id: string;
  userId: string;
  name: string;
  address: string | null;
  notes: string | null;
  websiteUrl: string | null;
  cutoffTimes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type GroceryStoreOrderStatus = 'active' | 'completed' | 'cancelled';

export type GroceryStoreOrderRow = {
  id: string;
  userId: string;
  storeId: string;
  orderDate: string;
  deliveryDate: string | null;
  status: GroceryStoreOrderStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
