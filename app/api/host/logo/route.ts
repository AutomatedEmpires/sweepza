import { NextResponse } from "next/server";
import { HostAccessError, uploadHostLogo } from "@/lib/db/host-dashboard";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    const logoUrl = await uploadHostLogo(file);
    return NextResponse.json({ logoUrl });
  } catch (error) {
    if (error instanceof HostAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected error uploading logo." }, { status: 500 });
  }
}
