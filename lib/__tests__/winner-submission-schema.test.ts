import { describe, expect, it } from "vitest";
import { winnerSubmissionSchema } from "@/lib/winner-submission-schema";

describe("winnerSubmissionSchema", () => {
  it("accepts a winner post without optional attachments", () => {
    expect(
      winnerSubmissionSchema.parse({ caption: "A surprise win" }),
    ).toEqual({ caption: "A surprise win" });
  });

  it("normalizes blank attachment fields before validation", () => {
    expect(
      winnerSubmissionSchema.parse({
        listingId: "  ",
        photoUrl: "",
        caption: "",
      }),
    ).toEqual({
      listingId: undefined,
      photoUrl: undefined,
      caption: undefined,
    });
  });

  it("still rejects malformed non-empty attachment values", () => {
    expect(
      winnerSubmissionSchema.safeParse({
        listingId: "not-a-uuid",
        photoUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });
});
