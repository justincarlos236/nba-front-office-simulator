import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PlayerAvatar } from "./PlayerAvatar";

describe("PlayerAvatar", () => {
  it("renders the photo when a photoUrl is given", () => {
    const { container } = render(
      <PlayerAvatar photoUrl="https://example.com/photo.png" fullName="Jayson Tatum" />,
    );
    // The image is intentionally decorative (alt="", same as team logos
    // elsewhere in this app - the name is rendered as adjacent text), so
    // its computed role is "presentation," not "img" - a container query
    // is the right tool here, not an accessible role query.
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/photo.png");
  });

  it("falls back to initials when no photoUrl is given", () => {
    const { container } = render(<PlayerAvatar photoUrl={null} fullName="Jayson Tatum" />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("JT")).toBeInTheDocument();
  });

  it("falls back to initials if the photo fails to load", async () => {
    const { container } = render(
      <PlayerAvatar photoUrl="https://example.com/broken.png" fullName="Jayson Tatum" />,
    );
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    await waitFor(() => expect(container.querySelector("img")).not.toBeInTheDocument());
    expect(screen.getByText("JT")).toBeInTheDocument();
  });

  it("computes initials from a single-word name", () => {
    render(<PlayerAvatar photoUrl={null} fullName="Nene" />);
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  it("computes initials from first and last name, ignoring a middle/suffix", () => {
    render(<PlayerAvatar photoUrl={null} fullName="Kenyon Martin Jr." />);
    expect(screen.getByText("KJ")).toBeInTheDocument();
  });

  it("uses a team-tinted gradient when a team color is provided", () => {
    render(<PlayerAvatar photoUrl={null} fullName="Jayson Tatum" teamPrimaryColor="#007A33" />);
    const fallback = screen.getByText("JT");
    // jsdom re-serializes hex-with-alpha colors as rgba() in the style
    // attribute, so check for the RGB components rather than the literal hex.
    expect(fallback.getAttribute("style")).toContain("0, 122, 51");
  });
});
