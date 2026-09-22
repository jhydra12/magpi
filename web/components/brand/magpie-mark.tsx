/** The Digital Brain mark and the hero bird. Every fill is a token from web/styles/tokens.css. */

/** The wordmark bird: three planes, one lit, one shadowed, one sheen. */
export function MagpieMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 20) / 26}
      viewBox="0 0 26 20"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <path d="M0 10 L11 3 L11 12 Z" fill="var(--paper-body)" />
      <path d="M11 3 L26 0 L11 12 Z" fill="var(--paper-body-shade)" />
      <path d="M11 12 L26 0 L22 17 Z" fill="var(--paper-sheen)" />
    </svg>
  );
}

/** The hero bird, fully folded. */
export function FoldedMagpie({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 660 460"
      fill="none"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <g className="magpie-underwing">
        <path d="M198 214 L286 402 L372 224 Z" fill="var(--paper-underwing)" />
        <path d="M286 402 L372 224 L344 262 Z" fill="var(--paper-underwing-dark)" />
      </g>
      <g>
        <path d="M356 232 L648 322 L604 372 Z" fill="var(--paper-tail)" />
        <path d="M356 232 L604 372 L372 292 Z" fill="var(--paper-tail-dark)" />
        <path d="M596 316 L648 322 L604 372 Z" fill="var(--paper-sheen)" />
      </g>
      <g>
        <path d="M46 190 L206 128 L392 236 L196 232 Z" fill="var(--paper-body)" />
        <path d="M46 190 L196 232 L214 268 Z" fill="var(--paper-body-shade)" />
        <path d="M196 232 L392 236 L268 292 Z" fill="var(--paper-body-mid)" />
      </g>
      <g className="magpie-wing">
        <path d="M206 128 L318 12 L400 210 Z" fill="var(--paper-wing)" />
        <path d="M318 12 L400 210 L352 116 Z" fill="var(--paper-body-shade)" />
        <path d="M382 162 L400 210 L352 116 Z" fill="var(--paper-sheen)" />
        <g stroke="var(--paper-crease)" strokeWidth="1">
          <path d="M206 128 L400 210" />
          <path d="M318 12 L352 116" />
        </g>
      </g>
      <g>
        <path d="M46 190 L142 148 L138 206 Z" fill="var(--paper-head)" />
        <path d="M46 190 L138 206 L106 214 Z" fill="var(--paper-head-shade)" />
        <path d="M14 196 L46 190 L44 202 Z" fill="var(--paper-sheen-quiet)" />
      </g>
      <g stroke="var(--paper-crease)" strokeWidth="1">
        <path d="M46 190 L196 232" />
        <path d="M196 232 L392 236" />
        <path d="M356 232 L604 372" />
      </g>
    </svg>
  );
}
