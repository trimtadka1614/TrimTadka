import './globals.css';
import { Poppins } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import NextAuthSessionProvider from './provider'; // Import the new Client Component wrapper

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
};


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={poppins.className}>
        {/* Use the new Client Component wrapper here */}
        <NextAuthSessionProvider>
          {children}
        </NextAuthSessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
