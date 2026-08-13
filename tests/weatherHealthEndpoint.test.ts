import { describe, it, expect, vi } from "vitest";
import { GET } from "@/app/api/admin/weather-health/route";
import { NextRequest } from "next/server";
import { ProviderHealthMonitor } from "@/engine/observations/ProviderHealthMonitor";

vi.mock("@/engine/observations/ProviderHealthMonitor", () => ({
  ProviderHealthMonitor: {
    checkSystemHealth: vi.fn(),
  },
}));

describe("Protected Health Endpoint GET /api/admin/weather-health", () => {
  it("returns 401 Unauthorized when no admin secret is provided", async () => {
    const req = new NextRequest("http://localhost/api/admin/weather-health");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 OK and reports system health status when correct secret is provided via query parameter", async () => {
    const mockReport = {
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

    vi.mocked(ProviderHealthMonitor.checkSystemHealth).mockResolvedValueOnce(mockReport as any);

    const req = new NextRequest("http://localhost/api/admin/weather-health?secret=spotpilot-admin-secret");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.providers[0].provider).toBe("meteotrentino");
  });

  it("gracefully returns degraded status without throwing 500 when checkSystemHealth fails", async () => {
    vi.mocked(ProviderHealthMonitor.checkSystemHealth).mockRejectedValueOnce(new Error("Database offline"));

    const req = new NextRequest("http://localhost/api/admin/weather-health?secret=spotpilot-admin-secret");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("unavailable");
    expect(body.error).toBe("Database offline");
  });
});
