import { GuideLayout, GuideSection } from "@/components/guide/GuideLayout";

export const metadata = {
  title: "How Scouting Works | NBA Front Office Simulator",
};

export default function ScoutingGuidePage() {
  return (
    <GuideLayout
      title="How scouting works"
      intro="Everyone can see a prospect's rating. What you're actually buying with a scouting assignment is the story around it - and the story is what turns out to matter."
      sections={[
        ["#scouting", "Scouting the Class"],
        ["#class-character", "Class Character"],
        ["#big-board", "The Big Board"],
        ["#delegation", "Letting Your Staff Handle It"],
        ["#resolution", "What Draft Night Actually Resolves"],
        ["#long-tail", "The Long Game"],
      ]}
    >
      <GuideSection id="scouting" title="Scouting the Class">
        <p>
          Once a champion is crowned, this season&apos;s draft class is revealed - before the
          lottery runs, so you&apos;re scouting without knowing where you&apos;ll actually pick.
          Every prospect&apos;s rating and potential are always visible; what&apos;s uncertain is
          the story around them - bust risk, development trajectory, work ethic, NBA readiness,
          injury outlook, and how wide a range their true ceiling could fall in.
        </p>
        <p>
          You have a limited pool of scouting assignments for the whole window, set by your Scouting
          department budget. Three ways to spend one:
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <span className="text-foreground">Focused Look</span> (1 assignment) - raises one
            prospect&apos;s Scouting Depth by one step (Unknown &rarr; Seen &rarr; Studied &rarr;
            Known). The more Depth on someone, the more reliable and precise your read on him
            becomes.
          </li>
          <li>
            <span className="text-foreground">Regional Sweep</span> (1 assignment) - picks a pathway
            (Power Conference, Mid-Major, International Professional, or Development Pathway) and
            gives shallow Depth to several Unknown prospects who share it. It finds names you
            weren&apos;t tracking - it doesn&apos;t confirm them.
          </li>
          <li>
            <span className="text-foreground">Private Workout</span> (2 assignments, once a prospect
            reaches Studied) - resolves his work ethic or injury outlook outright, no uncertainty.
            The one way to fully de-risk a specific bet.
          </li>
        </ul>
        <p>
          Spreading your assignments thin across the whole class gets you a vague read on everyone;
          concentrating them gets a handful of prospects Known instead of guessed at.
        </p>
      </GuideSection>

      <GuideSection id="class-character" title="Class Character">
        <p>
          Every class has a character, rolled once and visible from the moment it&apos;s revealed -
          a top-heavy class with a few real difference-makers and a steep drop-off, a deep-but-flat
          class where trading down or scouting broadly pays off, an international-heavy class where
          that pathway is unusually strong, an injury-riddled class where medical diligence matters
          more, a weak class where even the top of the board projects modestly, or an ordinary
          balanced year. Most classes are balanced - a real character is the exception, not the
          rule.
        </p>
        <p>
          This is deliberate: the right scouting strategy should change from year to year. A class
          that rewards concentrating your assignments on a handful of top names one year might
          reward spreading them wide the next - there&apos;s no single approach that stays correct
          forever.
        </p>
      </GuideSection>

      <GuideSection id="big-board" title="The Big Board">
        <p>
          Alongside your own scouting, the class gets a public ranking too - the Big Board.
          It&apos;s built entirely from things a real evaluator could actually see: how young a
          prospect is, whether he has a prototypical frame for his position, how visible his level
          of competition was, and a generated production line. It is never built from true rating,
          so it can be - and often is - wrong, and its mistakes are always traceable to a real cause
          rather than random luck. An international prospect from a small club will consistently
          rank lower than his ability deserves, simply because he&apos;s harder for the public to
          see.
        </p>
        <p>
          Partway through the window, once you&apos;ve actually spent some scouting effort, a
          tournament event fires publicly and reprices part of the class - a real, visible shift you
          can watch happen, not something scripted just for you.
        </p>
        <p>
          The Big Board is a second opinion, not a correction. When it disagrees with your own
          scouting - or with a prospect&apos;s plainly visible rating - that disagreement is the
          whole point: trust the crowd, or trust what you&apos;ve actually seen. Bookmark prospects
          to build <span className="text-foreground">My Board</span>, your own ranked list - drag to
          reorder it, and it&apos;s what leads Draft Night once you&apos;re on the clock, not the
          public consensus.
        </p>
      </GuideSection>

      <GuideSection id="delegation" title="Letting Your Staff Handle It">
        <p>
          Scouting is meant to reward attention, not demand it. Three levels of involvement, all
          running on the same underlying assignment pool:
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <span className="text-foreground">Manual</span> - assign every sweep, focused look, and
            workout by hand.
          </li>
          <li>
            <span className="text-foreground">Recommend</span> - your staff propose a full
            week&apos;s assignments; accept them, edit them, or override entirely. One click, still
            a real decision.
          </li>
          <li>
            <span className="text-foreground">Delegate window</span> - pick a strategy once (Best
            Player Available, Fill Our Needs, Find Sleepers, or Balanced) and let your staff run the
            entire Pre-Draft window against it.
          </li>
        </ul>
        <p>
          Even full delegation is a real strategic choice, not an opt-out - and it&apos;s
          deliberately competent. A player who always delegates should still enjoy Draft Night; a
          player who scouts by hand should reliably out-prepare them through precision, not because
          the alternative is rigged to be bad.
        </p>
      </GuideSection>

      <GuideSection id="resolution" title="What Draft Night Actually Resolves">
        <p>
          When your pick comes off the board, you get a recap of exactly what you knew going in -
          how deep your scouting on him actually reached, where your own board had him against where
          the Big Board had him, and which questions you resolved (a completed workout) versus left
          open (&quot;you never got a read on his health&quot;).
        </p>
        <p>
          It deliberately does <span className="text-foreground">not</span> reveal his true
          potential, and it never says &quot;steal&quot; or &quot;bust.&quot; Revealing that on the
          spot would turn the draft into a graded quiz instead of a bet. Whether the pick was
          actually right plays out over real seasons through ordinary player development, exactly
          like every other player on your roster. Scouting resolves what you knew; development
          resolves what was true.
        </p>
      </GuideSection>

      <GuideSection id="long-tail" title="The Long Game">
        <p>
          Some bets don&apos;t settle for years. If a player you barely scouted goes on to make an
          All-Star team, that shows up in the news the moment it happens, flagged against your old
          Depth record from draft night - and it plays out as one of two different stories, not one.
        </p>
        <p>
          If you passed on him and another team drafted him, it lands as regret - the one that got
          away, a name you had every chance to dig into and didn&apos;t. If you drafted him yourself
          despite barely scouting him, it lands as vindication - a gamble that paid off, proof your
          read was right even without the full workup. Neither story is about luck; both are about
          what your scouting effort actually bought you, or didn&apos;t, at the moment it mattered.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
