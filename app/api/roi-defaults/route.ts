import { NextResponse } from "next/server";
import { resolveRoiMarketDefaults } from "@/lib/zip-to-market";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip") ?? "";
  const rvClass = searchParams.get("rvClass");

  const result = await resolveRoiMarketDefaults(zip, rvClass);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
