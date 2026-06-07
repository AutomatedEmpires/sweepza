"use server";

import { redirect } from "next/navigation";
import { saveHostListingEdit } from "@/lib/db/host-dashboard";

export async function editHostListingAction(formData: FormData) {
  await saveHostListingEdit(formData);
  redirect("/host/listings");
}
