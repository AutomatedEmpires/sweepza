import { redirect } from "next/navigation";

// Legacy route — the bare Browse grid folded into the unified Discover system.
export default function ListingsPage() {
  redirect("/discover");
}
