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
const review = soon('Review', '/review');
const tutor = soon('Tutor', '/tutor');
const write = soon('Write', '/write');
const progress = soon('Progress', '/progress');
const settings = soon('Settings', '/settings');
const more = soon('More', '/more');

/** Left rail on wide screens. */
export const RAIL_ITEMS: readonly NavItem[] = [home, review, tutor, write, progress, settings];

/** Bottom bar on narrow screens. More will open a Sheet once the Sheet ships. */
export const BAR_ITEMS: readonly NavItem[] = [home, review, tutor, progress, more];
