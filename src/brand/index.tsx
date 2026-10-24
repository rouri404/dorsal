// The product's name and mark, in one place so a rename is one edit.

/** Working name, until a final one is chosen. */
export const PRODUCT = "Dorsal";

/** Where the site lives. */
export const SITE = "https://dorsal.cotoo.dev";

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
