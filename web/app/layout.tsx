import type { Metadata } from 'next';
import { Inter, Manrope, Source_Code_Pro } from 'next/font/google';

import { ThemeProvider } from '@/components/theme/theme-provider';
import '@/styles/globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], display: 'swap' });
const sourceCodePro = Source_Code_Pro({
  variable: '--font-source-code-pro',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Digital Brain',
  description: 'A team knowledge base with a chat interface.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${manrope.variable} ${sourceCodePro.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
