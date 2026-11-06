import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../components/AppShell';
import { FeedbackWidget } from '../components/FeedbackWidget';
import { ToastProvider } from '../components/kit';
import { ThemeProvider } from '../components/ThemeProvider';
import { themeInitScript } from '../components/theme-script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stufen',
  description: 'Learn German step by step, from zero to C2.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a href="#main" className="app-skip">
          Skip to content
        </a>
        <ThemeProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
            <FeedbackWidget />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
