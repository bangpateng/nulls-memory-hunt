/** The Nulls: Memory Hunt mark. Same drawing as the browser tab icon (public/favicon.svg). */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a3c" />
          <stop offset="1" stopColor="#c8261c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#lg)" />
      <rect x="11" y="9" width="42" height="33" rx="5" fill="#26232e" />
      <rect x="16" y="13" width="32" height="25" rx="2" fill="#9bbc0f" />
      <path d="M25 33V19h4.4l6 8.2V19H40v14h-4.2l-6.2-8.4V33z" fill="#0f380f" />
      <rect x="13" y="48.5" width="12" height="4" rx="1" fill="#f3ead6" />
      <rect x="17" y="44.5" width="4" height="12" rx="1" fill="#f3ead6" />
      <circle cx="47" cy="48" r="4" fill="#f3ead6" />
      <circle cx="38" cy="53" r="4" fill="#f3ead6" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <span>UNOFFICIAL FAN PROJECT. NOT AFFILIATED WITH NULLS.</span>
      <a href="https://x.com/naxweb3" target="_blank" rel="noopener noreferrer">
        Built by @naxweb3
      </a>
    </footer>
  );
}

/** The memory card drawn in CSS, used in menus and toasts. */
export function CardChip({ color, dark, small }: { color: string; dark: string; small?: boolean }) {
  return (
    <span className={`cardChip${small ? " small" : ""}`} style={{ ["--c" as string]: color, ["--d" as string]: dark }}>
      <i className="tri" />
      <b>n</b>
      <em>MEMORY CARD</em>
      <span className="lbl">DO NOT ERASE</span>
      <span className="pins" />
    </span>
  );
}
