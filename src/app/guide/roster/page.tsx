import { GuideLayout, GuideSection } from "@/components/guide/GuideLayout";
import { ROTATION_ROLE_LABEL } from "@/lib/rotation/roleLabel";
import { MORALE_LEVEL_LABEL, MORALE_LEVEL_DESCRIPTION } from "@/lib/morale/moraleLevel";
import { STAFF_ROLE_LABEL } from "@/lib/staff/labels";

export const metadata = {
  title: "How Your Roster Works | NBA Front Office Simulator",
};

export default function RosterGuidePage() {
  return (
    <GuideLayout
      title="How your roster works"
      intro="Minutes, morale, and your coaching staff - the day-to-day levers you're actually pulling between games."
      sections={[
        ["#rotation", "Rotation & Minutes"],
        ["#morale", "Player Morale & Trade Requests"],
        ["#staff", "Coaching Staff"],
      ]}
    >
      <GuideSection id="rotation" title="Rotation & Minutes">
        <p>
          You set a depth-chart order and a target-minutes number for each player - the simulation
          steers actual playing time toward those targets, with natural game-to-game variance from
          matchups, blowouts, and your coaching staff. A player left out of the rotation entirely
          falls to the bottom and won&apos;t play.
        </p>
        <p>
          Your depth-chart order also determines each player&apos;s labeled role, shown wherever
          they appear:
        </p>
        <div className="space-y-1">
          {(Object.keys(ROTATION_ROLE_LABEL) as (keyof typeof ROTATION_ROLE_LABEL)[]).map(
            (role) => (
              <p key={role}>
                <span className="text-ink">{ROTATION_ROLE_LABEL[role]}</span>
              </p>
            ),
          )}
        </div>
        <p>
          An injured player still occupying a rotation slot won&apos;t contribute anything while
          they&apos;re out - the Action Center will flag it, but it&apos;s worth checking your
          rotation yourself any time a key player goes down.
        </p>
      </GuideSection>

      <GuideSection id="morale" title="Player Morale & Trade Requests">
        <p>
          Every player has a morale score driven by real events - playing time relative to what they
          expect, winning, being traded, and more. It settles into one of five levels:
        </p>
        <div className="space-y-3">
          {(Object.keys(MORALE_LEVEL_LABEL) as (keyof typeof MORALE_LEVEL_LABEL)[]).map((level) => (
            <div key={level} className="rounded-[2px] border border-rule bg-field p-4">
              <p className="font-semibold text-ink">{MORALE_LEVEL_LABEL[level]}</p>
              <p className="mt-1">{MORALE_LEVEL_DESCRIPTION[level]}</p>
            </div>
          ))}
        </div>
        <p>
          A player who stays Disgruntled long enough can formally demand a trade - that&apos;s
          always the most urgent situation the Action Center will surface, since an unresolved
          demand keeps affecting the locker room the longer it sits.
        </p>
      </GuideSection>

      <GuideSection id="staff" title="Coaching Staff">
        <p>Three staff roles, each with a real effect on the court - none of them are cosmetic:</p>
        <div>
          <p className="font-semibold text-ink">{STAFF_ROLE_LABEL.HEAD_COACH}</p>
          <p className="mt-1">
            Nudges your win probability every game, and their coaching style (Pace &amp; Space,
            Balanced, Grind It Out) shifts how often your team shoots threes.
          </p>
        </div>
        <div>
          <p className="font-semibold text-ink">{STAFF_ROLE_LABEL.PLAYER_DEVELOPMENT_COACH}</p>
          <p className="mt-1">
            Affects how much young players grow and how gracefully veterans decline at each
            season&apos;s offseason development pass.
          </p>
        </div>
        <div>
          <p className="font-semibold text-ink">{STAFF_ROLE_LABEL.MEDICAL_STAFF}</p>
          <p className="mt-1">
            Lowers how often your players get hurt and shortens recovery time when they do.
          </p>
        </div>
        <p>
          Every new franchise starts with all three roles filled - a vacancy only happens if you
          fire someone and don&apos;t replace them, or a hire retires. The Action Center will flag
          an open role.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
