export function Logo({ className, ...props }: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 200 200"
      {...props}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* NutriCoach Logo - Apple with leaf representing nutrition/health */}
      <path
        d="M 100 30 Q 70 30 50 60 Q 30 90 50 120 Q 70 150 100 150 Q 130 150 150 120 Q 170 90 150 60 Q 130 30 100 30 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Apple leaf */}
      <path
        d="M 100 30 Q 110 20 120 25 Q 125 30 120 35 Q 115 40 110 35 Q 105 30 100 30"
        fill="currentColor"
      />
      {/* Apple highlight */}
      <ellipse
        cx="85"
        cy="80"
        rx="15"
        ry="20"
        fill="white"
        opacity="0.3"
      />
    </svg>
  )
}
