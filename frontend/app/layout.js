import './globals.css';
import { Poppins } from 'next/font/google';
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from '@vercel/speed-insights/next';
import NextAuthSessionProvider from './provider';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'TrimTadka - Smart Barber Queue System',
  description: 'TrimTadka lets you book and manage salon queues online. Avoid waiting and get trimmed on your schedule.',
  keywords: ['TrimTadka', 'Barber', 'Salon Queue', 'Haircut App', 'Online Booking'],
  robots: 'index, follow',
  authors: [{ name: 'Sourjya Saha' }],
  creator: 'Sourjya Saha',
  openGraph: {
    title: 'TrimTadka - Smart Barber Queue System',
    description: 'Book your next grooming appointment or manage your salon with ease.',
    url: 'https://trim-tadka.vercel.app',
    siteName: 'TrimTadka',
    locale: 'en_US',
    type: 'website',
  },
  metadataBase: new URL('https://trim-tadka.vercel.app'),
  themeColor: '#cb3a1e', // Needed for manifest as well
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* 🔥 Required for PWA install and iOS Add to Home Screen */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#cb3a1e" />
        <link rel="apple-touch-icon" href="/trimtadka.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TrimTadka" />
      </head>
      <body className={poppins.className}>
        <NextAuthSessionProvider>
          {children}
        </NextAuthSessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
