import { GuideLayout, GuideSection } from "@/components/guide/GuideLayout";

export const metadata = {
  title: "How a Season Plays Out | NBA Front Office Simulator",
};

export default function SeasonFlowGuidePage() {
  return (
    <GuideLayout
      title="How a season plays out"
      intro="The regular season is the calm part. Here's what changes once it ends."
      sections={[
        ["#playoffs", "The Playoffs"],
        ["#all-star", "All-Star Weekend"],
        ["#draft-lottery", "The Draft Lottery"],
        ["#offseason", "The Offseason"],
      ]}
    >
      <GuideSection id="playoffs" title="The Playoffs">
        <p>
          The top teams in each conference make the playoffs; a play-in stretch decides the final
          seeds. From there it&apos;s single-elimination best-of-seven series - miss the cut and
          your season simply ends at the regular season&apos;s final game, no consolation bracket.
        </p>
        <p>
          You can watch each playoff game live, series by series, and see how each result shifts the
          matchup&apos;s momentum in real time.
        </p>
      </GuideSection>

      <GuideSection id="all-star" title="All-Star Weekend">
        <p>
          Partway through the season, the league pauses for All-Star Weekend - rosters are announced
          from the league&apos;s actual best performers so far, and the weekend&apos;s events play
          out before the regular season resumes. It&apos;s a checkpoint on who&apos;s having a big
          year, not something you manage.
        </p>
      </GuideSection>

      <GuideSection id="draft-lottery" title="The Draft Lottery">
        <p>
          Once a champion is crowned, this season&apos;s draft class is revealed and a Pre-Draft
          scouting window opens - before the lottery runs, so you&apos;re scouting without knowing
          where you&apos;ll actually pick. See{" "}
          <a href="/guide/scouting" className="text-foreground underline hover:text-accent">
            How Scouting Works
          </a>{" "}
          for how that window plays out.
        </p>
        <p>
          Every non-playoff team gets lottery odds at the top picks - the worse your record, the
          better your odds, but nothing is guaranteed. The three worst records in the league are
          deliberately given identical odds at the very top pick, so bottoming out to be the single
          worst team doesn&apos;t meaningfully help versus finishing 2nd- or 3rd-worst.
        </p>
        <p>
          Losing games late in a lost season isn&apos;t cheating the system - it&apos;s a real,
          intended tradeoff you can lean into once you know a season isn&apos;t going anywhere.
        </p>
      </GuideSection>

      <GuideSection id="offseason" title="The Offseason">
        <p>
          Once the draft concludes, your team enters the offseason: players age, develop or decline,
          and sometimes retire; expired contracts become free agents; the salary cap grows for next
          season. This is also when ownership evaluates how your season went against their
          expectation - see{" "}
          <a
            href="/guide/finances#owner-confidence"
            className="text-foreground underline hover:text-accent"
          >
            Owner Confidence &amp; Job Security
          </a>{" "}
          for exactly how that&apos;s judged.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
