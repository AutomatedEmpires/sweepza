import { describe, expect, it } from "vitest";
import { winnerSubmissionSchema } from "@/lib/winner-submission-schema";

describe("winnerSubmissionSchema", () => {
  it("accepts a winner post without optional attachments", () => {
    expect(
      winnerSubmissionSchema.parse({
        listingId: "1a2b3c4d-1111-4222-8333-444455556666",
        caption: "I won a surprise prize!",
      }),
    ).toEqual({
      listingId: "1a2b3c4d-1111-4222-8333-444455556666",
      caption: "I won a surprise prize!",
    });
  });

  it("rejects external photo URLs until first-party uploads are available", () => {
    expect(
      winnerSubmissionSchema.safeParse({
        listingId: "1a2b3c4d-1111-4222-8333-444455556666",
        photoUrl: "https://tracking.example/pixel.gif",
        caption: "I won a surprise prize!",
      }).success,
    ).toBe(false);
  });

  it("rejects missing proof context and malformed attachment values", () => {
    expect(
      winnerSubmissionSchema.safeParse({
        listingId: "not-a-uuid",
        photoUrl: "not-a-url",
        caption: "short",
      }).success,
    ).toBe(false);
  });
});
