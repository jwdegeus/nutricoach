'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Avatar } from '@/components/catalyst/avatar';
import { useToast } from '@/src/components/app/ToastContext';
import {
  listFamilyMembersAction,
  createFamilyMemberAction,
  deleteFamilyMemberAction,
  type FamilyMemberRow,
} from '../actions/family.actions';
import {
  UserPlusIcon,
  PencilSquareIcon,
  TrashIcon,
  Cog6ToothIcon,
  ChartBarIcon,
} from '@heroicons/react/16/solid';
import { Link } from '@/components/catalyst/link';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/catalyst/dialog';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || '?';
}

export function FamilieListClient() {
  const t = useTranslations('family');
  const { showToast } = useToast();
  const router = useRouter();
  const [members, setMembers] = useState<FamilyMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSelf, setIsSelf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listFamilyMembersAction()
      .then((res) => {
        if (!cancelled && res.ok) setMembers(res.members);
      })
      .catch(() => {
        if (!cancelled) showToast({ type: 'error', title: t('loadError') });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      showToast({ type: 'error', title: t('nameRequired') });
      return;
    }
    setSubmitting(true);
    try {
      const result = await createFamilyMemberAction({ name, is_self: isSelf });
      if (result.ok) {
        setMembers((prev) => [...prev, result.member]);
        setNewName('');
        setIsSelf(false);
        setAddOpen(false);
        showToast({ type: 'success', title: t('memberAdded') });
        router.push(`/familie/${result.member.id}`);
      } else {
        showToast({ type: 'error', title: result.error });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const result = await deleteFamilyMemberAction(id);
      if (result.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
        setDeleteId(null);
        showToast({ type: 'success', title: t('memberDeleted') });
      } else {
        showToast({ type: 'error', title: result.error });
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t('loading')}
      </p>
    );
  }

  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-2xl px-6 text-center lg:px-8">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-6 text-lg/8 text-muted-foreground">
          {t('description')}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button
            onClick={() => setAddOpen(true)}
            className="border-0 dark:!border-0"
          >
            <UserPlusIcon className="size-4" />
            {t('addMember')}
          </Button>
          <Button plain as={Link as never} href="/dashboard">
            <ChartBarIcon className="size-4" />
            {t('intakeDashboard')}
          </Button>
          <Button plain as={Link as never} href="/familie/edit">
            <Cog6ToothIcon className="size-4" />
            {t('editFamilyDiet')}
          </Button>
        </div>
      </div>

      <ul
        role="list"
        className="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-6 px-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-8 lg:px-8"
      >
        {members.map((member) => (
          <li
            key={member.id}
            className="rounded-2xl bg-zinc-100 px-8 py-10 text-center dark:bg-white/10"
          >
            <Avatar
              src={member.avatar_url ?? undefined}
              initials={!member.avatar_url ? initials(member.name) : undefined}
              alt={member.name}
              className="mx-auto size-24 outline-none md:size-28"
            />
            <h3 className="mt-6 text-base font-semibold tracking-tight text-foreground">
              {member.name}
            </h3>
            {!member.is_self && (
              <p className="text-sm/6 text-muted-foreground">
                {t('familyMember')}
              </p>
            )}
            <ul
              role="list"
              className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
            >
              <li>
                <Button plain as={Link as never} href={`/familie/${member.id}`}>
                  <PencilSquareIcon className="size-4" />
                  {t('edit')}
                </Button>
              </li>
              {!member.is_self && (
                <li>
                  <Button
                    plain
                    onClick={() => setDeleteId(member.id)}
                    className="text-red-600 dark:text-red-400"
                    disabled={deleting}
                    aria-label={t('delete')}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>

      <Dialog open={addOpen} onClose={setAddOpen}>
        <DialogTitle>{t('addMember')}</DialogTitle>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>{t('name')}</Label>
              <Description>{t('nameDescription')}</Description>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('namePlaceholder')}
                disabled={submitting}
              />
            </Field>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSelf}
                onChange={(e) => setIsSelf(e.target.checked)}
                disabled={submitting}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {t('markAsSelf')}
              </span>
            </label>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setAddOpen(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleAdd} disabled={submitting || !newName.trim()}>
            {submitting ? t('saving') : t('add')}
          </Button>
        </DialogActions>
      </Dialog>

      {deleteId && (
        <Dialog
          open={!!deleteId}
          onClose={() => !deleting && setDeleteId(null)}
        >
          <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              {t('deleteConfirmDescription')}
            </p>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => setDeleteId(null)} disabled={deleting}>
              {t('cancel')}
            </Button>
            <Button
              color="red"
              onClick={() => handleDelete(deleteId)}
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
