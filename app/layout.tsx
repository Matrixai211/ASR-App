import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ASRPlayerProvider } from '../components/ASRPlayer';
import './globals.css';

export const metadata: Metadata = {
  title: 'ASR — African Sound & Releases',
  description: 'Discover African music, independent releases, artist exclusives, streaming and merch on ASR.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ASRPlayerProvider>{children}</ASRPlayerProvider>
      </body>
    </html>
  );
}
