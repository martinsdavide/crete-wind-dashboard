import { NextRequest, NextResponse } from "next/server";
import { ProviderHealthMonitor } from "@/engine/observations/ProviderHealthMonitor";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

// Tokens that are explicitly rejected as unconfigured (the shipped default was a known public value)
const REJECTED_SECRETS = new Set(["spotpilot-admin-secret", ""]);

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.ADMIN_SECRET;

  // Fail closed: if the secret is absent or is the known-default placeholder, the endpoint
  // is not considered configured. Return 503 with a generic code only.
  if (!configuredSecret || REJECTED_SECRETS.has(configuredSecret)) {
    return NextResponse.json(
      { error: "ADMIN_AUTH_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  // Accept credentials only via request headers — never via query parameters.
  const authHeader = request.headers.get("authorization");
  const adminTokenHeader = request.headers.get("x-admin-token");

  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : null;
  const headerToken = adminTokenHeader?.trim() ?? null;
  const provided = bearerToken ?? headerToken;

  // Reject immediately if no credential was supplied via headers
  if (!provided) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid admin token required in Authorization or x-admin-token header." },
      { status: 401 }
    );
  }

  // Timing-safe comparison to prevent secret-length oracle attacks
  let isAuthorized = false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(configuredSecret);
    isAuthorized = a.byteLength === b.byteLength && timingSafeEqual(a, b);
  } catch {
    isAuthorized = false;
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid admin token." },
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

