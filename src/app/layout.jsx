import { Roboto } from 'next/font/google';
import './globals.css';
import './vdp.css';
import './pfm-login.css';
import './pfm-dashboard.css';
import { ThemeProvider, NO_FLASH_SCRIPT } from '@/components/ui/ThemeProvider';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-roboto',
});

export const metadata = {
  title: 'Pure for Men — Page Views',
  description: 'Pure for Men GA4 page views reporting.',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F6FB' },
    { media: '(prefers-color-scheme: dark)',  color: '#14171C' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={roboto.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <div className="ambient-bg" aria-hidden="true" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
