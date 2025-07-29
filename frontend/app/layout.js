import './globals.css';
import { Poppins } from 'next/font/google';
import NextAuthSessionProvider from './provider'; // Import the new Client Component wrapper

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'TrimTadka - Trim your style. Spice your vibe.',
  description: 'Book your next grooming appointment or manage your shop!',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={poppins.className}>
        {/* Use the new Client Component wrapper here */}
        <NextAuthSessionProvider>
          {children}
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}