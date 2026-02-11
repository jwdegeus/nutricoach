import * as Headless from '@headlessui/react';
import clsx from 'clsx';
import React, { forwardRef } from 'react';

export const Select = forwardRef(function Select(
  {
    className,
    multiple,
    ...props
  }: { className?: string } & Omit<Headless.SelectProps, 'as' | 'className'>,
  ref: React.ForwardedRef<HTMLSelectElement>,
) {
  return (
    <span
      data-slot="control"
      className={clsx([
        className,
        // Basic layout
        'group relative block w-full',
        // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
        'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-input before:shadow-sm',
        // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
        'dark:before:hidden',
        // Focus ring (semantic ring token)
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset has-data-focus:after:ring-2 has-data-focus:after:ring-ring has-data-focus:after:ring-offset-0',
        // Disabled state
        'has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50 has-data-disabled:before:bg-muted/50 has-data-disabled:before:shadow-none',
      ])}
    >
      <Headless.Select
        ref={ref}
        multiple={multiple}
        {...props}
        className={clsx([
          // Basic layout (h-10 baseline matching Input)
          'relative block h-10 w-full appearance-none rounded-lg py-2 text-base/6 sm:text-sm/6',
          // Horizontal padding
          multiple ? 'px-3' : 'pr-10 pl-3',
          // Options (multi-select)
          '[&_optgroup]:font-semibold',
          // Typography (semantic tokens)
          'text-foreground placeholder:text-muted-foreground dark:*:text-foreground',
          // Border (semantic)
          'border border-border data-hover:border-border/80',
          // Background (transparent in light so before:bg-input shows; bg-input in dark when before hidden)
          'bg-transparent dark:bg-input dark:*:bg-muted/30',
          // Hide default focus styles
          'focus:outline-hidden',
          // Invalid state
          'data-invalid:border-red-500/80 data-invalid:data-hover:border-red-500/80 dark:data-invalid:border-red-500/60 dark:data-invalid:data-hover:border-red-500/60',
          // Disabled state
          'data-disabled:border-border/50 data-disabled:bg-muted/30 dark:data-disabled:border-border/40 dark:data-disabled:bg-muted/20',
        ])}
      />
      {!multiple && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg
            className="size-5 stroke-muted-foreground sm:size-4 forced-colors:stroke-[CanvasText]"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
          >
            <path
              d="M5.75 10.75L8 13L10.25 10.75"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.25 5.25L8 3L5.75 5.25"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </span>
  );
});
