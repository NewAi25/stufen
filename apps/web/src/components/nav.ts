// Navigation entries from docs/06-ui-ux.md section 2. Routes that are not
// built yet point at /coming-soon until their row in the build sequence lands.

export interface NavItem {
  label: string;
  /** Where the link goes today. */
  href: string;
  /** The route this entry will own once it exists. */
  route: string;
}

const COMING_SOON = '/coming-soon';

function soon(label: string, route: string): NavItem {
  return { label, href: COMING_SOON, route };
}

const home: NavItem = { label: 'Home', href: '/', route: '/' };
const review: NavItem = { label: 'Review', href: '/review', route: '/review' };
const tutor = soon('Tutor', '/tutor');
const write = soon('Write', '/write');
const progress: NavItem = { label: 'Progress', href: '/progress', route: '/progress' };
const settings: NavItem = { label: 'Settings', href: '/settings', route: '/settings' };
const feedback: NavItem = { label: 'Feedback', href: '/feedback', route: '/feedback' };

/** Left rail on wide screens. */
export const RAIL_ITEMS: readonly NavItem[] = [home, review, tutor, write, progress, settings];

/** Bottom bar on narrow screens. A More button follows these and opens a Sheet. */
export const BAR_ITEMS: readonly NavItem[] = [home, review, tutor, progress];

/** The links inside the More Sheet. */
export const MORE_ITEMS: readonly NavItem[] = [write, settings, feedback];
