'use client';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
}: ProgressIndicatorProps) {
  const percentage = (currentStep / totalSteps) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          {/* TODO: i18n key: onboarding.progress */}
          Stap {currentStep} van {totalSteps}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          {Math.round(percentage)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-zinc-900 transition-all duration-300 dark:bg-white"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
