import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Короткий бриф — AI-квалификатор",
  description:
    "Короткий бриф для первичной оценки AI-квалификатора и пилотного запуска.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230b2748'/%3E%3Ctext x='32' y='40' text-anchor='middle' font-family='Arial' font-size='24' font-weight='700' fill='white'%3EAI%3C/text%3E%3C/svg%3E",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f6f5f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
