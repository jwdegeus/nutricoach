'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/catalyst/button';
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
} from '@heroicons/react/20/solid';

type RecipeNotesEditorProps = {
  initialContent: string | null;
  onSave: (content: string) => Promise<void>;
  mealId: string;
  source: 'custom' | 'gemini';
};

export function RecipeNotesEditor({
  initialContent,
  onSave,
  mealId: _mealId,
  source: _source,
}: RecipeNotesEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Placeholder.configure({
        placeholder:
          'Voeg hier je notities toe... Je kunt tekst opmaken met vet, cursief, lijsten, etc.',
      }),
    ],
    content: initialContent || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[150px] text-zinc-900 dark:text-zinc-100',
      },
    },
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!editor) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const html = editor.getHTML();
      await onSave(html);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan');
    } finally {
      setIsSaving(false);
    }
  };

  if (!editor) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          Editor wordt geladen...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-2">
          Notities
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Voeg je eigen notities toe aan dit recept. Je kunt tekst opmaken met
          vet, cursief, lijsten en meer.
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-2 p-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
        <Button
          plain
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={
            editor.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-700' : ''
          }
        >
          <BoldIcon className="h-4 w-4" />
        </Button>
        <Button
          plain
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={
            editor.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-700' : ''
          }
        >
          <ItalicIcon className="h-4 w-4" />
        </Button>
        <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600 mx-1" />
        <Button
          plain
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={
            editor.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-700' : ''
          }
        >
          <ListBulletIcon className="h-4 w-4" />
        </Button>
        <Button
          plain
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={
            editor.isActive('orderedList') ? 'bg-zinc-200 dark:bg-zinc-700' : ''
          }
        >
          <NumberedListIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor */}
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg min-h-[200px] bg-white dark:bg-zinc-900">
        <EditorContent editor={editor} />
      </div>

      <style jsx global>{`
        .ProseMirror {
          outline: none;
          min-height: 150px;
          padding: 1rem;
        }
        .ProseMirror p {
          margin: 0.5rem 0;
        }
        .ProseMirror p:first-child {
          margin-top: 0;
        }
        .ProseMirror p:last-child {
          margin-bottom: 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgb(161 161 170);
          pointer-events: none;
          height: 0;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .ProseMirror strong {
          font-weight: 600;
        }
        .ProseMirror em {
          font-style: italic;
        }
      `}</style>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Notities opgeslagen!
            </p>
          )}
        </div>
        <Button onClick={handleSave} disabled={isSaving} color="primary">
          {isSaving ? 'Opslaan...' : 'Opslaan'}
        </Button>
      </div>
    </div>
  );
}
