import Link from 'next/link';
import type { ReactNode } from 'react';

export interface LinkButtonProps {
  href: string;
  /** `primary` is the one filled action of a screen. Default `secondary`. */
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

/**
 * A link that looks like the ui-kit Button. The kit Button is a native
 * button, and a navigation is a link, so this reuses the kit's class names
 * (`st-button`, documented as plain class names in the kit README).
 */
export function LinkButton({ href, variant = 'secondary', children }: LinkButtonProps) {
  return (
    <Link href={href} className={`st-button st-button--${variant} st-button--md app-link-button`}>
      {children}
    </Link>
  );
}
