'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/catalyst/table';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Field, Label, Description } from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { Select } from '@/components/catalyst/select';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  PlusIcon,
} from '@heroicons/react/20/solid';

type RecipeSource = {
  id: string;
  name: string;
  is_system: boolean;
  created_by_user_id: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export function RecipeSourcesAdminClient() {
  const router = useRouter();
  const [sources, setSources] = useState<RecipeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<RecipeSource | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSource, setDeletingSource] = useState<RecipeSource | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergingSource, setMergingSource] = useState<RecipeSource | null>(null);
  const [targetSourceId, setTargetSourceId] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/recipe-sources');
      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Fout bij laden bronnen');
      }

      setSources(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij laden bronnen');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (source: RecipeSource) => {
    setEditingSource(source);
    setEditName(source.name);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSource || !editName.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/recipe-sources', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingSource.id,
          name: editName.trim(),
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Fout bij bijwerken');
      }

      await loadSources();

      // Wait a bit to ensure database updates are complete
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Dispatch event to notify other components that sources have been updated
      // Use a more reliable approach: broadcast to all windows/tabs
      if (typeof window !== 'undefined') {
        // Dispatch to current window
        const event = new CustomEvent('recipeSourceUpdated', {
          detail: { oldName: editingSource.name, newName: editName.trim() },
        });
        window.dispatchEvent(event);

        // Also use BroadcastChannel for cross-tab communication
        try {
          const channel = new BroadcastChannel('recipe-source-updates');
          channel.postMessage({
            type: 'sourceUpdated',
            oldName: editingSource.name,
            newName: editName.trim(),
          });
          // Keep channel open briefly to ensure message is sent
          setTimeout(() => channel.close(), 100);
        } catch (_e) {
          // BroadcastChannel not supported, fallback to event only
          console.log('BroadcastChannel not supported, using events only');
        }
      }

      // Refresh all pages to show updated source names
      router.refresh();

      setEditDialogOpen(false);
      setEditingSource(null);
      setEditName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij bijwerken');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (source: RecipeSource) => {
    setDeletingSource(source);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSource) return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/admin/recipe-sources/${deletingSource.id}`,
        {
          method: 'DELETE',
        },
      );

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Fout bij verwijderen');
      }

      await loadSources();
      setDeleteDialogOpen(false);
      setDeletingSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMerge = (source: RecipeSource) => {
    setMergingSource(source);
    setTargetSourceId('');
    setMergeDialogOpen(true);
  };

  const handleConfirmMerge = async () => {
    if (!mergingSource || !targetSourceId) return;

    setIsMerging(true);
    try {
      const response = await fetch(
        `/api/admin/recipe-sources/${mergingSource.id}/merge`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetSourceId,
          }),
        },
      );

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Fout bij samenvoegen');
      }

      await loadSources();
      setMergeDialogOpen(false);
      setMergingSource(null);
      setTargetSourceId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij samenvoegen');
    } finally {
      setIsMerging(false);
    }
  };

  const handleCreate = async () => {
    if (!newSourceName.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/admin/recipe-sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newSourceName.trim(),
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Fout bij aanmaken');
      }

      await loadSources();
      setCreateDialogOpen(false);
      setNewSourceName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij aanmaken');
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-zinc-600 dark:text-zinc-400">Laden...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
            Recept Bronnen Beheer
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Beheer alle recept bronnen. Wijzig, verwijder of voeg samen.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" />
          Nieuwe bron
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden">
        <Table
          className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]"
          striped
        >
          <TableHead>
            <TableRow>
              <TableHeader>Naam</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Gebruik</TableHeader>
              <TableHeader>Aangemaakt</TableHeader>
              <TableHeader className="text-right">Acties</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  Geen bronnen gevonden
                </TableCell>
              </TableRow>
            ) : (
              sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-medium text-zinc-900 dark:text-white">
                    {source.name}
                  </TableCell>
                  <TableCell>
                    <Badge color={source.is_system ? 'blue' : 'zinc'}>
                      {source.is_system ? 'Systeem' : 'Gebruiker'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {source.usage_count}x
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {new Date(source.created_at).toLocaleDateString('nl-NL')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        plain
                        onClick={() => handleEdit(source)}
                        className="text-sm"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        plain
                        onClick={() => handleMerge(source)}
                        className="text-sm"
                        disabled={sources.length <= 1}
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        plain
                        onClick={() => handleDelete(source)}
                        className="text-sm text-red-600 dark:text-red-400"
                        disabled={source.is_system && source.usage_count > 0}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>Bron bewerken</DialogTitle>
        <DialogDescription>Wijzig de naam van deze bron</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Naam</Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={isSaving}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => setEditDialogOpen(false)}
            disabled={isSaving}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleSaveEdit}
            disabled={isSaving || !editName.trim()}
          >
            {isSaving ? 'Opslaan...' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Bron verwijderen"
        description={
          deletingSource
            ? `Weet je zeker dat je "${deletingSource.name}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
            : ''
        }
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isDeleting}
      />

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onClose={() => setMergeDialogOpen(false)}>
        <DialogTitle>Bronnen samenvoegen</DialogTitle>
        <DialogDescription>
          Voeg &quot;{mergingSource?.name}&quot; samen met een andere bron. Alle
          recepten met deze bron worden bijgewerkt naar de gekozen doelbron.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Doelbron</Label>
            <Select
              value={targetSourceId}
              onChange={(e) => setTargetSourceId(e.target.value)}
              disabled={isMerging}
            >
              <option value="">Selecteer een bron...</option>
              {sources
                .filter((s) => s.id !== mergingSource?.id)
                .map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} ({source.usage_count}x gebruikt)
                  </option>
                ))}
            </Select>
            <Description>
              Kies de bron waarmee je wilt samenvoegen. De huidige bron wordt
              verwijderd.
            </Description>
          </Field>
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => setMergeDialogOpen(false)}
            disabled={isMerging}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleConfirmMerge}
            disabled={isMerging || !targetSourceId}
            color="primary"
          >
            {isMerging ? 'Samenvoegen...' : 'Samenvoegen'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      >
        <DialogTitle>Nieuwe bron toevoegen</DialogTitle>
        <DialogDescription>Voeg een nieuwe systeembron toe</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Naam</Label>
            <Input
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              placeholder="Bijv. 'Allrecipes', 'BBC Good Food'"
              disabled={isCreating}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => setCreateDialogOpen(false)}
            disabled={isCreating}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !newSourceName.trim()}
          >
            {isCreating ? 'Aanmaken...' : 'Aanmaken'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
