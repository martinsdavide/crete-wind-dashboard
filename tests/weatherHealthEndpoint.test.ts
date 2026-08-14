/**
 * weatherHealthEndpoint.test.ts
 *
 * Covers the GET /api/admin/weather-health auth contract:
 *   - 503 when ADMIN_SECRET is absent or is the known public default
 *   - 401 when credentials are wrong or supplied via query param (never accepted)
 *   - 200 when correct credentials are present via header
 *   - Response bodies must never contain the configured secret value
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/admin/weather-health/route";
import { NextRequest } from "next/server";
import { ProviderHealthMonitor } from "@/engine/observations/ProviderHealthMonitor";

vi.mock("@/engine/observations/ProviderHealthMonitor", () => ({
  ProviderHealthMonitor: {
    checkSystemHealth: vi.fn(),
  },
}));

const REAL_SECRET = "test-secret-abc123-xyz987";

const mockHealthReport = {
  generatedAt: "2026-08-12T16:45:00Z",
  status: "healthy",
  providers: [
    {
      provider: "meteotrentino",
      status: "healthy",
      responseTimeMs: 200,
      lastAttemptAt: "2026-08-12T16:44:58Z",
      lastSuccessAt: "2026-08-12T16:44:58Z",
      stations: [],
    },
  ],
  summary: {
    totalProviders: 1,
    healthyProviders: 1,
    totalStations: 0,
    freshStations: 0,
    eligibleForFusionCount: 0,
  },
};

const origSecret = process.env.ADMIN_SECRET;

function makeReq(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

describe("GET /api/admin/weather-health — 503 when not configured", () => {
  beforeEach(() => {
    delete process.env.ADMIN_SECRET;
  });
  afterEach(() => {
    if (origSecret !== undefined) process.env.ADMIN_SECRET = origSecret;
    else delete process.env.ADMIN_SECRET;
  });

  it("returns 503 when ADMIN_SECRET is absent", async () => {
    const res = await GET(makeReq("http://localhost/api/admin/weather-health"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ADMIN_AUTH_NOT_CONFIGURED");
    // Must not reveal the env var name or any configuration hint beyond the code
    expect(JSON.stringify(body)).not.toContain("ADMIN_SECRET");
  });

  it("returns 503 when ADMIN_SECRET is the known-default 'spotpilot-admin-secret'", async () => {
    process.env.ADMIN_SECRET = "spotpilot-admin-secret";
    const res = await GET(
      makeReq("http://localhost/api/admin/weather-health", {
        "x-admin-token": "spotpilot-admin-secret",
      })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ADMIN_AUTH_NOT_CONFIGURED");
  });

  it("returns 503 even with a valid-looking Bearer token when secret is not configured", async () => {
    const res = await GET(
      makeReq("http://localhost/api/admin/weather-health", {
        authorization: "Bearer some-token",
      })
    );
    expect(res.status).toBe(503);
  });
});

describe("GET /api/admin/weather-health — 401 for bad or disallowed credentials", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = REAL_SECRET;
  });
  afterEach(() => {
    if (origSecret !== undefined) process.env.ADMIN_SECRET = origSecret;
    else delete process.env.ADMIN_SECRET;
  });

  it("returns 401 when no credential header is present", async () => {
    const res = await GET(makeReq("http://localhost/api/admin/weather-health"));
    expect(res.status).toBe(401);
    const body = await res.json();
    // Must not expose the configured secret value
    expect(JSON.stringify(body)).not.toContain(REAL_SECRET);
  });

  it("returns 401 when secret is supplied as a query parameter (query auth removed)", async () => {
    const res = await GET(
      makeReq(`http://localhost/api/admin/weather-health?secret=${REAL_SECRET}`)
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when an incorrect token is supplied via x-admin-token", async () => {
    const res = await GET(
      makeReq("http://localhost/api/admin/weather-health", {
        "x-admin-token": "wrong-token",
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(REAL_SECRET);
  });

  it("returns 401 when an incorrect Bearer token is supplied", async () => {
    const res = await GET(
      makeReq("http://localhost/api/admin/weather-health", {
        authorization: "Bearer totally-wrong",
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/weather-health — 200 for authorized requests", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = REAL_SECRET;
    vi.mocked(ProviderHealthMonitor.checkSystemHealth).mockResolvedValue(mockHealthReport as any);
  });
  afterEach(() => {
    if (origSecret !== undefined) process.env.ADMIN_SECRET = origSecret;
    else delete process.env.ADMIN_SECRET;
    vi.clearAllMocks();
  });

  it("returns 200 with health report when correct token is sent via x-admin-token", async () => {
    const res = await GET(
      makeReq("http://localhost/api/admin/weather-health", {
        "x-admin-token": REAL_SECRET,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.providers[0].provider).toBe("meteotrentino");
    // Response body must not echo the secret
    expect(JSON.stringify(body)).not.toContain(REAL_SECRET);
  });

  it("returns 200 with health report when correct token is sent via Authorization: Bearer", async () => {
    const res = await GET(
      makeReq("http://localhost/api/admin/weather-health", {
        authorization: `Bearer ${REAL_SECRET}`,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(JSON.stringify(body)).not.toContain(REAL_SECRET);
  });

  it("gracefully returns degraded status without throwing 500 when checkSystemHealth fails", async () => {
    vi.mocked(ProviderHealthMonitor.checkSystemHealth).mockRejectedValueOnce(
      new Error("Database offline")
    );
    const res = await GET(
      makeReq("http://localhost/api/admin/weather-health", {
        "x-admin-token": REAL_SECRET,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("unavailable");
    expect(body.error).toBe("Database offline");
  });
});

