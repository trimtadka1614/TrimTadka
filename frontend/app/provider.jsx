'use client'; // This directive makes this component a Client Component

import { SessionProvider } from 'next-auth/react';

export default function NextAuthSessionProvider({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}