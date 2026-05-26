import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/react";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Memory Game",
  description: "Соревновательное запоминание последовательностей",
  icons: {
    icon: {
      type: "image/svg+xml",
      url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%234F46E5'/><text x='50' y='70' font-size='60' text-anchor='middle' fill='white'>🧠</text></svg>",
    },
    apple: {
      type: "image/svg+xml",
      url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%234F46E5'/><text x='50' y='70' font-size='60' text-anchor='middle' fill='white'>🧠</text></svg>",
    },
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <TRPCProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}