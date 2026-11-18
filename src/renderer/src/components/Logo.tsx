import { useId } from 'react'

export function Logo({ size = 24, className = '' }: { size?: number; className?: string }) {
  const raw = useId().replace(/[:]/g, '')
  const bg = `bg-${raw}`
  const arc = `arc-${raw}`
  return (
    <svg
      className={`logo-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bg} x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1c1729" />
          <stop offset="1" stopColor="#0a0910" />
        </linearGradient>
        <linearGradient id={arc} x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${bg})`} />
      <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="8.4" stroke="white" strokeOpacity="0.09" />
      <circle
        cx="16"
        cy="16"
        r="7.4"
        stroke={`url(#${arc})`}
        strokeWidth="3.3"
        strokeLinecap="round"
        strokeDasharray="41 6.5"
        transform="rotate(28 16 16)"
      />
      <path
        d="M16 10.9c.62 3.04 1.46 3.88 4.5 4.5-3.04.62-3.88 1.46-4.5 4.5-.62-3.04-1.46-3.88-4.5-4.5 3.04-.62 3.88-1.46 4.5-4.5Z"
        fill="#fff"
      />
    </svg>
  )
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="wordmark">
      <Logo size={size} />
      <span className="wordmark-text">
        Chelp <span className="wordmark-accent">AI</span>
      </span>
    </span>
  )
}
