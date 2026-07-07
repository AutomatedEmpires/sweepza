import { permanentRedirect } from "next/navigation";

// Legacy route — the seeker dashboard is now My Sweeps.
export default function SavedPage() {
  permanentRedirect("/my-sweeps");
}
