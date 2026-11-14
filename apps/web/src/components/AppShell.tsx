'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MoreMenu } from './MoreMenu';
import { BAR_ITEMS, RAIL_ITEMS, type NavItem } from './nav';

function NavLinks({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  return (
    <>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="app-nav-link"
          aria-current={item.route === pathname ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

/** Left rail on wide screens, bottom bar on narrow ones. CSS picks which shows. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // A lesson hides the navigation and shows only its own exit control, so the
  // learner is not pulled away mid task (docs/06-ui-ux.md section 2).
  if (pathname.startsWith('/lesson/')) {
    return (
      <main id="main" className="app-main app-main--focused" tabIndex={-1}>
        {children}
      </main>
    );
  }
  return (
    <div className="app-shell">
      <nav className="app-rail" aria-label="Main">
        <div className="app-brand">Stufen</div>
        <NavLinks items={RAIL_ITEMS} pathname={pathname} />
      </nav>
      <main id="main" className="app-main" tabIndex={-1}>
        {children}
      </main>
      <nav className="app-bar" aria-label="Main, compact">
        <NavLinks items={BAR_ITEMS} pathname={pathname} />
        <MoreMenu pathname={pathname} />
      </nav>
    </div>
  );
}
