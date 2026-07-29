import { describe, expect, it, vi } from "vitest";
import { openOfficialSource } from "@/lib/open-official-source";

function fakeTab({ failNavigation = false } = {}) {
  const meta = { name: "", content: "" };
  const append = vi.fn();
  const replace = failNavigation
    ? vi.fn(() => {
        throw new Error("navigation failed");
      })
    : vi.fn();
  const close = vi.fn();
  const tab = {
    opener: {} as unknown,
    document: {
      title: "",
      createElement: vi.fn(() => meta),
      head: { append },
    },
    location: { replace },
    close,
  };

  return {
    tab: tab as unknown as Window,
    raw: tab,
    meta,
    append,
    replace,
    close,
  };
}

describe("openOfficialSource", () => {
  it("reports a blocked tab without mutating entry state", () => {
    expect(openOfficialSource("https://official.example/entry", () => null)).toBe(false);
  });

  it("severs the opener, blocks referrers, and navigates the new tab", () => {
    const fixture = fakeTab();

    expect(
      openOfficialSource("https://official.example/entry", () => fixture.tab),
    ).toBe(true);
    expect(fixture.raw.opener).toBeNull();
    expect(fixture.raw.document.title).toBe("Opening official entry…");
    expect(fixture.meta).toEqual({
      name: "referrer",
      content: "no-referrer",
    });
    expect(fixture.append).toHaveBeenCalledWith(fixture.meta);
    expect(fixture.replace).toHaveBeenCalledWith(
      "https://official.example/entry",
    );
    expect(fixture.close).not.toHaveBeenCalled();
  });

  it("closes the tab and reports failure when navigation throws", () => {
    const fixture = fakeTab({ failNavigation: true });

    expect(
      openOfficialSource("https://official.example/entry", () => fixture.tab),
    ).toBe(false);
    expect(fixture.close).toHaveBeenCalledOnce();
  });
});
