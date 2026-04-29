import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/react";

export const metadata: Metadata = {
  title: "Memory Game",
  description: "Соревновательное запоминание последовательностей",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <TRPCProvider>
          {children}
        </TRPCProvider>
      </body>
    </html>
  );
}