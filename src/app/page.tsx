import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Hero } from "@/components/marketing/Hero";
import { RoadmapSection } from "@/components/marketing/RoadmapSection";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { TechStrip } from "@/components/marketing/TechStrip";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <Hero />
      <TechStrip />
      <FeatureGrid />
      <RoadmapSection />
      <SiteFooter />
    </main>
  );
}
