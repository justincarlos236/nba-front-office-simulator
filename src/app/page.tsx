import { Hero } from "@/components/marketing/Hero";
import { RulesLedger } from "@/components/marketing/RulesLedger";
import { SeasonArc } from "@/components/marketing/SeasonArc";
import { FinalCta } from "@/components/marketing/FinalCta";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-ground">
      <Hero />
      <RulesLedger />
      <SeasonArc />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}
