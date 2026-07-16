// FAQ content — one source of truth for the /faq page and its FAQPage
// structured data, so the visible answers always match the markup Google reads.
// Answers are canon-aligned: free for seekers, no purchase necessary, directory
// (not sponsor), host-funded, never sell data.

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is Sweepza free?",
    answer:
      "Yes. Sweepza is always free for seekers — there's no fee to browse, save, enter, or track sweepstakes. The platform is funded by hosts, never by you.",
  },
  {
    question: "Are these sweepstakes legitimate?",
    answer:
      "Sweepza is a directory. We link to each sponsor's official page and official rules, surface verification signals, and list only free, no-purchase-necessary sweepstakes. We are not the sponsor and we don't run the drawings — always read the official rules linked on each listing.",
  },
  {
    question: "Do I have to buy anything to enter?",
    answer:
      "No. No purchase is ever necessary on the sweepstakes we list, and buying something never improves your odds of winning.",
  },
  {
    question: "How does Sweepza make money?",
    answer:
      "Hosts pay to list and promote their sweepstakes. Seekers never pay, and we never sell your data to advertisers.",
  },
  {
    question: "Who picks the winners?",
    answer:
      "The sponsor selects winners according to their official rules — not Sweepza. Each listing links to the sponsor's official rules with the full details.",
  },
  {
    question: "What are daily entries?",
    answer:
      "Many sweepstakes let you enter once per day. Sweepza remembers when your entry window re-opens and can remind you, so you don't miss a day.",
  },
  {
    question: "How do you find these sweepstakes?",
    answer:
      "Some are submitted by the hosts running them; others are found by Sweepza and checked against the official rules before they're listed.",
  },
  {
    question: "Is my information safe?",
    answer:
      "We never sell your entry data. See our Privacy Policy for exactly how your information is handled.",
  },
  {
    question: "A listing looks expired or the link is broken — what do I do?",
    answer:
      "Report it from the listing. We review reports and remove or fix listings that have ended or changed.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. You can browse and track sweepstakes on your device without one. Signing in syncs your activity, streak, and reminders across your devices.",
  },
];
