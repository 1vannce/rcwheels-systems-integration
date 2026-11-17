import type { Metadata } from "next";
import "./globals.css";
import { IBM_Plex_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

// One variable family. Body text uses the normal width; page titles and
// document numbers use the condensed end of the width axis (see globals.css).
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "RCWheels",
  description: "RCWheels Business Management System (prototype)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", plexSans.variable)}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
