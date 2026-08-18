import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { NavBar } from "@/components/layout/NavBar";
import { TextureDefs } from "@/components/environment/textures";
import { PlayerProfileProvider } from "@/components/players/PlayerProfileProvider";
import "./globals.css";

// THE WIRE - a grotesque with structural presence for signage and document
// headings, and a mono whose figures stay unambiguous at 11px in a dense
// table, which is where most of this product's numbers live.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const DESCRIPTION =
  "Run an NBA franchise as its GM: build a roster, negotiate trades against " +
  "the real 2026 CBA salary-cap rules, scout a draft class, and simulate " +
  "seasons from a real snapshot of the league.";

export const metadata: Metadata = {
  title: "NBA Front Office Simulator",
  description: DESCRIPTION,
  openGraph: {
    title: "NBA Front Office Simulator",
    description: DESCRIPTION,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* SVG filter definitions for the Phase D material layer. Mounted once
            at the root because filter ids are document-global. */}
        <TextureDefs />
        <PlayerProfileProvider>
          <NavBar />
          {children}
        </PlayerProfileProvider>
      </body>
    </html>
  );
}
