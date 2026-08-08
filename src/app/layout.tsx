import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { NavBar } from "@/components/layout/NavBar";
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

export const metadata: Metadata = {
  title: "NBA Front Office Simulator",
  description:
    "Run an NBA franchise: manage the salary cap, negotiate trades against real CBA rules, and lean on an AI GM assistant grounded in real quantitative analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PlayerProfileProvider>
          <NavBar />
          {children}
        </PlayerProfileProvider>
      </body>
    </html>
  );
}
