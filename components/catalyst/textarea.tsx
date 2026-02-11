import * as Headless from '@headlessui/react';
import clsx from 'clsx';
import React, { forwardRef } from 'react';

export const Textarea = forwardRef(function Textarea(
  {
    className,
    resizable = true,
    ...props
  }: { className?: string; resizable?: boolean } & Omit<
    Headless.TextareaProps,
    'as' | 'className'
  >,
  ref: React.ForwardedRef<HTMLTextAreaElement>,
) {
  return (
    <span
      data-slot="control"
      className={clsx([
        className,
        // Basic layout
        'relative block w-full',
        // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
        'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-input before:shadow-sm',
        // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
        'dark:before:hidden',
        // Focus ring (semantic ring token)
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset sm:focus-within:after:ring-2 sm:focus-within:after:ring-ring sm:focus-within:after:ring-offset-0',
        // Disabled state
        'has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50 has-data-disabled:before:bg-muted/50 has-data-disabled:before:shadow-none',
      ])}
    >
      <Headless.Textarea
        ref={ref}
        {...props}
        className={clsx([
          // Basic layout (px-3 py-2 matches Input/Select for form consistency)
          'relative block min-h-[80px] w-full appearance-none rounded-lg px-3 py-2 text-base/6 sm:text-sm/6',
          // Typography (semantic tokens)
          'text-foreground placeholder:text-muted-foreground',
          // Border (semantic)
          'border border-border data-hover:border-border/80',
          // Background (transparent in light so before:bg-input shows; bg-input in dark when before hidden)
          'bg-transparent dark:bg-input',
          // Hide default focus styles
          'focus:outline-hidden',
          // Invalid state
          'data-invalid:border-red-500/80 data-invalid:data-hover:border-red-500/80 dark:data-invalid:border-red-500/60 dark:data-invalid:data-hover:border-red-500/60',
          // Disabled state (Textarea uses native disabled, not data-disabled)
          'disabled:cursor-not-allowed disabled:border-border/50 disabled:bg-muted/30 dark:disabled:border-border/40 dark:disabled:bg-muted/20',
          // Resizable
          resizable ? 'resize-y' : 'resize-none',
        ])}
      />
    </span>
  );
});
