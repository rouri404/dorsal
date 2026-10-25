// The product's name and mark, in one place so a rename is one edit.

export const PRODUCT = "Dorsal";

/** Where the site lives (VITE_SITE_URL in .env). */
export const SITE = (import.meta.env.VITE_SITE_URL || "https://dorsal.cotoo.dev").replace(/\/$/, "");

/** The source repository (VITE_REPO_URL in .env): issues and releases. */
export const REPO = (import.meta.env.VITE_REPO_URL || "https://github.com/rouri404/dorsal").replace(/\/$/, "");

/** The mark: a keycap with a dorsal fin cutting through its face. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#f2f3f4" />
      <path d="M7 23 C8.6 15.2 14 8.6 22.4 6.8 C19.6 11.2 19.8 17.4 25 23 Z" fill="#0a0b0c" />
      <rect x="6" y="24.6" width="20" height="1.8" rx="0.9" fill="#0a0b0c" />
    </svg>
  );
}

/** GitHub's mark (Simple Icons, CC0). */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3" />
    </svg>
  );
}
