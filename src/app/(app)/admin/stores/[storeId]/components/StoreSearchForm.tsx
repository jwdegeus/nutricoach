'use client';

import { Field, Label } from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { Button } from '@/components/catalyst/button';

type Props = {
  storeId: string;
  query: string;
  showInactive: boolean;
};

export function StoreSearchForm({ storeId, query, showInactive }: Props) {
  return (
    <form
      method="get"
      action={`/admin/stores/${storeId}`}
      className="flex flex-wrap items-end gap-4"
    >
      <Field className="min-w-[200px]">
        <Label>Zoeken (titel of merk)</Label>
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Min. 2 tekens"
        />
      </Field>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="inactive"
          name="inactive"
          value="1"
          defaultChecked={showInactive}
          className="size-4 rounded border-zinc-950/20 dark:border-white/20"
        />
        <label
          htmlFor="inactive"
          className="text-sm text-foreground select-none"
        >
          Toon inactieve producten
        </label>
      </div>
      <Button type="submit">Toepassen</Button>
    </form>
  );
}
