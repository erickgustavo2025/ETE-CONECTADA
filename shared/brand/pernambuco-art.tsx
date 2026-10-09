/** Arte vetorial do portal: arcos e cores de Pernambuco, sem substituir a bandeira oficial. */
export default function PernambucoArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 560"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="280" cy="280" r="244" stroke="currentColor" opacity=".09" />
      <circle cx="280" cy="280" r="196" stroke="currentColor" opacity=".09" />
      <path
        d="M74 332V270a206 206 0 0 1 412 0v62"
        stroke="#2765d7"
        strokeWidth="62"
      />
      <path
        d="M144 332v-62a136 136 0 0 1 272 0v62"
        stroke="#7aaaf2"
        strokeWidth="42"
      />
      <path
        d="M198 332v-62a82 82 0 0 1 164 0v62"
        stroke="#f5c518"
        strokeWidth="23"
      />
      <path
        d="M197 345h165"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M144 389h272"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
        opacity=".32"
      />
      <path
        d="M208 433h145"
        stroke="#d92747"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="m280 207 6.5 19.5H307l-16.5 12 6.5 19.5-17-12-17 12 6.5-19.5-16.5-12h20.5Z"
        fill="currentColor"
      />
      <circle cx="473" cy="433" r="23" fill="#f5c518" />
      <path
        d="M70 126h24m-12-12v24M449 87h16m-8-8v16"
        stroke="currentColor"
        strokeWidth="2"
        opacity=".6"
      />
    </svg>
  );
}
