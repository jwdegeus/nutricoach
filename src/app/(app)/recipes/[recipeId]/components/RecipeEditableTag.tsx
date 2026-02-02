'use client';

import { Badge } from '@/components/catalyst/badge';
import { PencilIcon, TrashIcon } from '@heroicons/react/16/solid';

type RecipeEditableTagProps = {
  label: string;
  color: 'blue' | 'zinc' | 'green' | 'amber' | 'red' | 'purple';
  className?: string;
  editable: boolean;
  onEdit: () => void;
  onRemove?: () => void;
};

export function RecipeEditableTag({
  label,
  color,
  className,
  editable,
  onEdit,
  onRemove,
}: RecipeEditableTagProps) {
  if (!editable) {
    return (
      <Badge color={color} className={className}>
        {label}
      </Badge>
    );
  }

  return (
    <span className="group inline-flex items-center gap-1 rounded-md">
      <Badge color={color} className={className}>
        {label}
      </Badge>
      <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          aria-label={`Bewerk ${label}`}
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="rounded p-1 text-zinc-500 hover:bg-red-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            aria-label={`Verwijder ${label}`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </span>
  );
}
