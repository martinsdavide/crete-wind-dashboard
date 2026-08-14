/**
 * adminDashboardLogin.test.ts
 *
 * End-to-end integration test verifying the frontend dashboard login flow
 * against the real backend /api/admin/weather-health route handler.
 *
 * Verifies that:
 * 1. Frontend fetch request signature (using Authorization: Bearer <passcode>) is accepted.
 * 2. Old query-param authentication (?secret=...) is rejected with 401.
 * 3. Correct passcode yields 200, invalid passcode yields 401, and missing configuration yields 503.
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

describe("Admin Dashboard Login & Route Handler Integration", () => {
  const BACKEND_SECRET = "secure-test-passcode-777";
  const origSecret = process.env.ADMIN_SECRET;

  beforeEach(() => {
    process.env.ADMIN_SECRET = BACKEND_SECRET;
  });

  afterEach(() => {
    if (origSecret !== undefined) {
      process.env.ADMIN_SECRET = origSecret;
    } else {
      delete process.env.ADMIN_SECRET;
    }
    vi.restoreAllMocks();
  });

  /**
   * Helper simulating the exact fetch request structure used by the frontend dashboard component
   */
  const clientFetchHealth = async (passcode: string, useQueryParam = false) => {
    const headers = new Headers();
    let url = "http://localhost/api/admin/weather-health";

    if (useQueryParam) {
      url += `?secret=${encodeURIComponent(passcode)}`;
    } else if (passcode !== undefined) {
      headers.set("Authorization", `Bearer ${passcode}`);
    }

    const request = new NextRequest(url, {
      method: "GET",
      headers,
    });

    return await GET(request);
  };

  it("succeeds with 200 when client sends the correct passcode via Authorization: Bearer header", async () => {
    const mockReport = { status: "healthy", providers: [], summary: {} };
    vi.mocked(ProviderHealthMonitor.checkSystemHealth).mockResolvedValueOnce(mockReport as any);

    const response = await clientFetchHealth(BACKEND_SECRET);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("healthy");
    // Ensure response doesn't leak the passcode anywhere in the body
    expect(JSON.stringify(body)).not.toContain(BACKEND_SECRET);
  });

  it("fails with 401 when client sends the passcode in query param (URL auth rejected)", async () => {
    const response = await clientFetchHealth(BACKEND_SECRET, true);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("fails with 401 when client sends an incorrect passcode", async () => {
    const response = await clientFetchHealth("wrong-passcode-abc");
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toContain("Invalid admin token");
  });

  it("fails with 401 when client sends no passcode / empty credentials", async () => {
    const response = await clientFetchHealth("");
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toContain("Valid admin token required");
  });

  it("fails with 503 when the backend admin secret is unconfigured", async () => {
    delete process.env.ADMIN_SECRET;

    const response = await clientFetchHealth(BACKEND_SECRET);
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.error).toBe("ADMIN_AUTH_NOT_CONFIGURED");
  });
});
