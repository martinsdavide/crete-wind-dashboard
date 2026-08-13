import { NextRequest, NextResponse } from "next/server";
import { ProviderHealthMonitor } from "@/engine/observations/ProviderHealthMonitor";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secretKey = process.env.ADMIN_SECRET || "spotpilot-admin-secret";

  // Check auth via header or query param
  const authHeader = request.headers.get("authorization");
  const adminTokenHeader = request.headers.get("x-admin-token");
  const urlSecret = request.nextUrl.searchParams.get("secret");

  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

  const isAuthorized =
    adminTokenHeader === secretKey ||
    bearerToken === secretKey ||
    urlSecret === secretKey;

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Protected back-office endpoint. Valid admin token required.",
      },
      { status: 401 }
    );
  }

  try {
    const healthReport = await ProviderHealthMonitor.checkSystemHealth(new Date());

    return NextResponse.json(healthReport, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: any) {
    // Graceful fallback without throwing unhandled 500
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        status: "unavailable",
        error: e?.message || "Health check failed",
        providers: [],
      },
      { status: 200 }
    );
  }
}
