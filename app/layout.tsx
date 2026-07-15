import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "AI-квалификатор входящих лидов",
  description:
    "Бриф для оценки сценария, интеграций, экономики и требований к пилотному запуску голосового помощника.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f1e9",
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
