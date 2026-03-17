import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "./sidebar";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPaletteProvider } from "@/components/command-palette";
import { StudioGlobalWrapper } from "@/components/chat";

export const metadata: Metadata = {
  title: "Nexus Suite",
  description: "AI-powered social media management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <Providers>
            <CommandPaletteProvider>
              <ToastProvider>
                <div className="flex min-h-screen">
                  <Sidebar />
                  <main className="flex-1">{children}</main>
                </div>
              </ToastProvider>
            </CommandPaletteProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
