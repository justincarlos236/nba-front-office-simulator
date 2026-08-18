import { Hero } from "@/components/marketing/Hero";
import { GameplayShowcase } from "@/components/marketing/GameplayShowcase";
import { FinalCta } from "@/components/marketing/FinalCta";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-ground">
      <Hero />
      <GameplayShowcase />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}
