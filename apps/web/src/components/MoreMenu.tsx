'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Sheet } from '@stufen/ui-kit';
import { MORE_ITEMS } from './nav';

/** The More entry of the bottom bar. Opens a Sheet with the remaining links. */
export function MoreMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const holdsCurrentPage = MORE_ITEMS.some((item) => item.route === pathname);

  return (
    <>
      <button
        type="button"
        className="app-nav-link app-nav-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-current={holdsCurrentPage ? 'true' : undefined}
        onClick={() => setOpen(true)}
      >
        More
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="More">
        <nav className="app-more-links" aria-label="More">
          {MORE_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="app-nav-link"
              aria-current={item.route === pathname ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </Sheet>
    </>
  );
}
