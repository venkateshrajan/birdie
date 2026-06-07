export function Shuttlecock({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* feather skirt */}
      <path
        d="M32 6 L20 44 H44 L32 6 Z"
        fill="currentColor"
        stroke="#111110"
        strokeWidth="3"
      />
      <path d="M32 8 V42 M26 22 V44 M38 22 V44" stroke="#111110" strokeWidth="2" />
      {/* cork base */}
      <rect
        x="20"
        y="44"
        width="24"
        height="14"
        rx="7"
        fill="#fbf9f2"
        stroke="#111110"
        strokeWidth="3"
      />
    </svg>
  );
}
