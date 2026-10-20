import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';
import localFont from 'next/font/local';

const display = localFont({
  src: '../../../shared/fonts/manrope.ttf',
  weight: '200 800',
  variable: '--font-manrope',
  display: 'swap',
});
const body = localFont({
  src: '../../../shared/fonts/source-sans-3.ttf',
  weight: '200 900',
  variable: '--font-source',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ETE Conectada | ETE Advogado José David Gil Rodrigues',
  description: 'Espaço digital da ETE Advogado José David Gil Rodrigues.',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Cada resposta precisa do seu próprio nonce; não compartilhar HTML entre requisições.
  await connection();
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
