'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import {
  LinkIcon,
  PencilIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/16/solid';
import {
  getAutoLinkProposalsAction,
  applyAutoLinkChoicesAction,
  searchIngredientCandidatesAction,
} from '../actions/ingredient-matching.actions';
import type { IngredientCandidate } from '../actions/ingredient-matching.actions';
import { useToast } from '@/src/components/app/ToastContext';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';

type ProposalRow = {
  index: number;
  ingredient: {
    name: string;
    quantity?: string | number | null;
    unit?: string | null;
    original_line?: string;
  };
  proposedMatch: IngredientCandidate | null;
  hadExistingRef: boolean;
};

type AutoLinkReviewDialogProps = {
  open: boolean;
  onClose: () => void;
  recipeId: string;
  onApplied: () => void;
};

export function AutoLinkReviewDialog({
  open,
  onClose,
  recipeId,
  onApplied,
}: AutoLinkReviewDialogProps) {
  const { showToast } = useToast();
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [_ingredients, setIngredients] = useState<
    Array<{
      name: string;
      quantity?: string | number | null;
      unit?: string | null;
      original_line?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editSuggestions, setEditSuggestions] = useState<IngredientCandidate[]>(
    [],
  );
  const [editSearchQuery, setEditSearchQuery] = useState('');
  const [editSearching, setEditSearching] = useState(false);
  const editPanelRef = useRef<HTMLDivElement>(null);

  const loadProposals = useCallback(async () => {
    if (!open || !recipeId) return;
    setLoading(true);
    setError(null);
    const result = await getAutoLinkProposalsAction(recipeId);
    setLoading(false);
    if (result.ok) {
      setProposals(result.data.proposals);
      setIngredients(result.data.ingredients);
    } else {
      setError(result.error.message);
      showToast({
        type: 'error',
        title: 'Laden mislukt',
        description: result.error.message,
      });
    }
  }, [open, recipeId, showToast]);

  useEffect(() => {
    if (open && recipeId) {
      loadProposals();
    }
  }, [open, recipeId, loadProposals]);

  const updateChoice = (
    index: number,
    candidate: IngredientCandidate | null,
  ) => {
    setProposals((prev) =>
      prev.map((p) =>
        p.index === index
          ? { ...p, proposedMatch: candidate, hadExistingRef: false }
          : p,
      ),
    );
    setEditIndex(null);
    setEditSuggestions([]);
    setEditSearchQuery('');
  };

  const searchForEdit = useCallback(
    async (query?: string) => {
      const q = (query ?? editSearchQuery).trim();
      if (!q) return;
      setEditSearching(true);
      const result = await searchIngredientCandidatesAction(q, 10);
      setEditSearching(false);
      if (result.ok) setEditSuggestions(result.data ?? []);
    },
    [editSearchQuery],
  );

  useEffect(() => {
    if (editIndex != null && editSearchQuery.trim()) {
      searchForEdit(editSearchQuery);
    } else if (editIndex != null) {
      setEditSuggestions([]);
    }
  }, [editIndex]);

  useEffect(() => {
    if (editIndex != null && editPanelRef.current) {
      editPanelRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [editIndex]);

  const handleApply = async () => {
    const toApply = proposals
      .filter((p) => !p.hadExistingRef)
      .map((p) => ({
        index: p.index,
        candidate: p.proposedMatch,
      }));
    const keepExisting = proposals.some((p) => p.hadExistingRef);
    setApplying(true);
    const result = await applyAutoLinkChoicesAction(
      recipeId,
      toApply,
      keepExisting,
    );
    setApplying(false);
    if (result.ok) {
      const { linked, total } = result.data;
      showToast({
        type: 'success',
        title: 'Koppelingen opgeslagen',
        description: `${linked} van ${total} ingrediënten gekoppeld.`,
      });
      onApplied();
      onClose();
    } else {
      showToast({
        type: 'error',
        title: 'Opslaan mislukt',
        description: result.error.message,
      });
    }
  };

  const formatIngredientLine = (ing: ProposalRow['ingredient']) =>
    [ing.quantity, ing.unit, ing.name || ing.original_line]
      .filter(Boolean)
      .join(' ') ||
    ing.name ||
    ing.original_line ||
    '';

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Controleer koppelingen</DialogTitle>
      <DialogDescription>
        Controleer de voorgestelde koppelingen vóór ze worden opgeslagen. Klik
        op Wijzig om een andere match te kiezen.
      </DialogDescription>
      <DialogBody>
        {loading && (
          <Text className="text-muted-foreground">
            Voorgestelde koppelingen laden…
          </Text>
        )}
        {error && (
          <Text className="text-red-600 dark:text-red-400">{error}</Text>
        )}
        {!loading && !error && proposals.length === 0 && (
          <Text className="text-muted-foreground">
            Geen ingrediënten om te koppelen.
          </Text>
        )}
        {!loading && !error && proposals.length > 0 && (
          <div className="space-y-3">
            {editIndex != null && (
              <div
                ref={editPanelRef}
                className="space-y-3 rounded-lg border border-white/10 bg-background p-4"
              >
                <Text className="text-sm font-medium">
                  Kies match voor:{' '}
                  {formatIngredientLine(
                    proposals.find((pr) => pr.index === editIndex)
                      ?.ingredient ?? { name: '' },
                  )}
                </Text>
                <Field>
                  <Label>Zoeken</Label>
                  <div className="flex gap-2">
                    <Input
                      value={editSearchQuery}
                      onChange={(e) => setEditSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchForEdit()}
                      placeholder="Zoek product…"
                    />
                    <Button
                      onClick={() => searchForEdit()}
                      disabled={editSearching}
                    >
                      <MagnifyingGlassIcon className="size-4" />
                      Zoek
                    </Button>
                  </div>
                </Field>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  <Button
                    plain
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => updateChoice(editIndex, null)}
                  >
                    Geen koppeling
                  </Button>
                  {editSuggestions.map((c) => (
                    <Button
                      key={`${c.source}-${c.nevoCode ?? c.customFoodId ?? c.fdcId}`}
                      plain
                      className="w-full justify-start"
                      onClick={() => updateChoice(editIndex, c)}
                    >
                      {c.name_nl}{' '}
                      <Badge color="zinc" className="ml-1">
                        {c.sourceLabel}
                      </Badge>
                    </Button>
                  ))}
                </div>
                <Button outline onClick={() => setEditIndex(null)}>
                  Sluiten
                </Button>
              </div>
            )}
            <div className="max-h-80 space-y-3 overflow-y-auto">
              {proposals.map((p) => (
                <div
                  key={p.index}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <Text className="truncate text-sm font-medium">
                      {formatIngredientLine(p.ingredient)}
                    </Text>
                    {p.hadExistingRef ? (
                      <Badge color="zinc" className="mt-1">
                        Heeft al koppeling
                      </Badge>
                    ) : p.proposedMatch ? (
                      <Text className="mt-0.5 text-sm text-muted-foreground">
                        → {p.proposedMatch.name_nl}{' '}
                        <Badge color="zinc" className="align-middle">
                          {p.proposedMatch.sourceLabel}
                        </Badge>
                      </Text>
                    ) : (
                      <Text className="mt-0.5 text-sm text-muted-foreground">
                        Geen match gevonden
                      </Text>
                    )}
                  </div>
                  {!p.hadExistingRef && (
                    <Button
                      outline
                      onClick={() => {
                        const q =
                          p.ingredient.name || p.ingredient.original_line || '';
                        setEditIndex(p.index);
                        setEditSearchQuery(q);
                        if (q.trim()) searchForEdit(q);
                        else setEditSuggestions([]);
                      }}
                    >
                      <PencilIcon className="size-4" />
                      Wijzig
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Annuleren
        </Button>
        <Button
          onClick={handleApply}
          disabled={loading || applying || proposals.length === 0}
        >
          <LinkIcon className="size-4" />
          {applying ? 'Opslaan…' : 'Toepassen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
