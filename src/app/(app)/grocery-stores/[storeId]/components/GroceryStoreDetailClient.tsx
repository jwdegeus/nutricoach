'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Field, FieldGroup, Label } from '@/components/catalyst/fieldset';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { Link } from '@/components/catalyst/link';
import { useToast } from '@/src/components/app/ToastContext';
import {
  createGroceryStoreOrderAction,
  updateGroceryStoreOrderAction,
  deleteGroceryStoreOrderAction,
} from '../../actions/grocery-stores.actions';
import type {
  GroceryStoreRow,
  GroceryStoreOrderRow,
} from '@/src/lib/grocery-stores/grocery-stores.types';
import {
  ArrowLeftIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/16/solid';

type GroceryStoreDetailClientProps = {
  store: GroceryStoreRow;
  initialOrders: GroceryStoreOrderRow[];
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GroceryStoreDetailClient({
  store,
  initialOrders,
}: GroceryStoreDetailClientProps) {
  const t = useTranslations('groceryStores');
  const { showToast } = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<GroceryStoreOrderRow[]>(initialOrders);
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<GroceryStoreOrderRow | null>(null);
  const [orderDate, setOrderDate] = useState(todayISO());
  const [deliveryDate, setDeliveryDate] = useState('');
  const [orderStatus, setOrderStatus] = useState<
    'active' | 'completed' | 'cancelled'
  >('active');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const activeOrders = orders.filter((o) => o.status === 'active');
  const historyOrders = orders.filter((o) => o.status !== 'active');

  const openAddOrder = () => {
    setOrderDate(todayISO());
    setDeliveryDate('');
    setOrderStatus('active');
    setOrderNotes('');
    setEditOrder(null);
    setAddOrderOpen(true);
  };

  const openEditOrder = (order: GroceryStoreOrderRow) => {
    setOrderDate(order.orderDate);
    setDeliveryDate(order.deliveryDate ?? '');
    setOrderStatus(order.status);
    setOrderNotes(order.notes ?? '');
    setEditOrder(order);
    setAddOrderOpen(true);
  };

  const closeOrderForm = () => {
    setAddOrderOpen(false);
    setEditOrder(null);
  };

  const statusLabel = (status: string) => {
    if (status === 'active') return t('statusActive');
    if (status === 'completed') return t('statusCompleted');
    return t('statusCancelled');
  };

  const handleSaveOrder = async () => {
    setSubmitting(true);
    try {
      if (editOrder) {
        const result = await updateGroceryStoreOrderAction(editOrder.id, {
          orderDate,
          deliveryDate: deliveryDate.trim() || null,
          status: orderStatus,
          notes: orderNotes.trim() || null,
        });
        if (result.ok) {
          setOrders((prev) =>
            prev.map((o) => (o.id === editOrder.id ? result.order : o)),
          );
          closeOrderForm();
          showToast({ type: 'success', title: t('orderUpdated') });
          router.refresh();
        } else {
          showToast({ type: 'error', title: result.error });
        }
      } else {
        const result = await createGroceryStoreOrderAction({
          storeId: store.id,
          orderDate,
          deliveryDate: deliveryDate.trim() || undefined,
          status: orderStatus,
          notes: orderNotes.trim() || undefined,
        });
        if (result.ok) {
          setOrders((prev) =>
            [...prev, result.order].sort(
              (a, b) =>
                (a.status === 'active' ? 0 : 1) -
                  (b.status === 'active' ? 0 : 1) ||
                b.orderDate.localeCompare(a.orderDate),
            ),
          );
          closeOrderForm();
          showToast({ type: 'success', title: t('orderAdded') });
          router.refresh();
        } else {
          showToast({ type: 'error', title: result.error });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    setDeleting(true);
    try {
      const result = await deleteGroceryStoreOrderAction(id);
      if (result.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        setDeleteOrderId(null);
        showToast({ type: 'success', title: t('orderDeleted') });
        router.refresh();
      } else {
        showToast({ type: 'error', title: result.error });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Button plain as={Link as never} href="/grocery-stores">
          <ArrowLeftIcon className="size-4" />
          {t('title')}
        </Button>
      </div>

      <div className="rounded-2xl bg-muted/20 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">{store.name}</h2>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {store.websiteUrl && (
            <>
              <dt className="text-muted-foreground">{t('website')}</dt>
              <dd>
                <a
                  href={store.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {store.websiteUrl}
                </a>
              </dd>
            </>
          )}
          {store.cutoffTimes && (
            <>
              <dt className="text-muted-foreground">{t('cutoffTimes')}</dt>
              <dd className="text-foreground">{store.cutoffTimes}</dd>
            </>
          )}
          {store.address && (
            <>
              <dt className="text-muted-foreground">{t('address')}</dt>
              <dd className="text-foreground">{store.address}</dd>
            </>
          )}
          {store.notes && (
            <>
              <dt className="text-muted-foreground">{t('notes')}</dt>
              <dd className="text-foreground">{store.notes}</dd>
            </>
          )}
        </dl>
      </div>

      <section>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-foreground">
            {t('activeOrders')}
          </h3>
          <Button onClick={openAddOrder}>
            <PlusIcon className="size-4" />
            {t('addOrder')}
          </Button>
        </div>
        {activeOrders.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t('noActiveOrders')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 rounded-2xl bg-muted/20 shadow-sm">
            {activeOrders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {formatDate(order.orderDate)}
                  </span>
                  {order.deliveryDate && (
                    <span className="ml-2 text-muted-foreground">
                      → {formatDate(order.deliveryDate)}
                    </span>
                  )}
                  {order.notes && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {order.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    plain
                    onClick={() => openEditOrder(order)}
                    aria-label={t('editOrder')}
                  >
                    <PencilSquareIcon className="size-4" />
                  </Button>
                  <Button
                    plain
                    className="text-red-600 dark:text-red-400"
                    onClick={() => setDeleteOrderId(order.id)}
                    aria-label={t('delete')}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-lg font-semibold text-foreground">
          {t('orderHistory')}
        </h3>
        {historyOrders.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t('noOrderHistory')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 rounded-2xl bg-muted/20 shadow-sm">
            {historyOrders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {formatDate(order.orderDate)}
                  </span>
                  {order.deliveryDate && (
                    <span className="ml-2 text-muted-foreground">
                      → {formatDate(order.deliveryDate)}
                    </span>
                  )}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {statusLabel(order.status)}
                  </span>
                  {order.notes && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {order.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    plain
                    onClick={() => openEditOrder(order)}
                    aria-label={t('editOrder')}
                  >
                    <PencilSquareIcon className="size-4" />
                  </Button>
                  <Button
                    plain
                    className="text-red-600 dark:text-red-400"
                    onClick={() => setDeleteOrderId(order.id)}
                    aria-label={t('delete')}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={addOrderOpen} onClose={closeOrderForm}>
        <DialogTitle>{editOrder ? t('editOrder') : t('addOrder')}</DialogTitle>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>{t('orderDate')}</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field>
              <Label>{t('deliveryDate')}</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field>
              <Label>{t('status')}</Label>
              <select
                value={orderStatus}
                onChange={(e) =>
                  setOrderStatus(
                    e.target.value as 'active' | 'completed' | 'cancelled',
                  )
                }
                disabled={submitting}
                className="mt-1 block w-full rounded-lg border-0 bg-white/5 py-2 shadow-sm ring-1 ring-white/10 ring-inset focus:ring-2 focus:ring-accent focus:ring-inset dark:bg-white/5 dark:ring-white/10"
              >
                <option value="active">{t('statusActive')}</option>
                <option value="completed">{t('statusCompleted')}</option>
                <option value="cancelled">{t('statusCancelled')}</option>
              </select>
            </Field>
            <Field>
              <Label>{t('notes')}</Label>
              <Textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
                disabled={submitting}
                rows={2}
              />
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={closeOrderForm} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSaveOrder} disabled={submitting}>
            {submitting ? t('saving') : editOrder ? t('edit') : t('add')}
          </Button>
        </DialogActions>
      </Dialog>

      {deleteOrderId && (
        <Dialog
          open={!!deleteOrderId}
          onClose={() => !deleting && setDeleteOrderId(null)}
        >
          <DialogTitle>{t('deleteOrderConfirm')}</DialogTitle>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              {t('deleteOrderConfirmDescription', {
                date: formatDate(
                  orders.find((o) => o.id === deleteOrderId)?.orderDate ?? '',
                ),
              })}
            </p>
          </DialogBody>
          <DialogActions>
            <Button
              plain
              onClick={() => setDeleteOrderId(null)}
              disabled={deleting}
            >
              {t('cancel')}
            </Button>
            <Button
              className="text-red-600 dark:text-red-400"
              onClick={() => handleDeleteOrder(deleteOrderId)}
              disabled={deleting}
            >
              {deleting ? t('deleting') : t('delete')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
