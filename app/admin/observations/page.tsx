"use client";

import React, { useState, useEffect } from "react";

export default function AdminObservationsPage() {
  const [passcode, setPasscode] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeSecret, setActiveSecret] = useState(""); // Retained in-memory only (no sessionStorage to avoid XSS exposure)
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      // Security: Passcode is sent strictly via Authorization header to prevent leakage in URLs
      const res = await fetch("/api/admin/weather-health", {
        headers: {
          Authorization: `Bearer ${code}`,
        },
      });
      if (res.status === 401) {
        setError("Invalid passcode. Access Denied.");
        setIsAuthorized(false);
        setActiveSecret("");
      } else if (!res.ok) {
        setError("Failed to fetch system health status.");
      } else {
        const data = await res.json();
        setHealthData(data);
        setIsAuthorized(true);
        setActiveSecret(code);
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;
    fetchHealth(passcode);
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    setHealthData(null);
    setPasscode("");
    setActiveSecret("");
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 font-sans p-6 text-white">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">
              SpotPilot Back-Office
            </h1>
            <p className="text-sm text-slate-400">
              Enter Administrator secret to access weather diagnostics
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Admin Secret Key
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter secret passcode..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white placeholder-slate-600 transition"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-500 font-semibold bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-sm font-semibold py-3 rounded-xl transition shadow-lg shadow-cyan-600/25"
            >
              {loading ? "Authorizing..." : "Access Diagnostics"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const getSystemStatusColor = (status: string) => {
    if (status === "healthy") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "degraded") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  };

  const getStationStatusBadge = (status: string) => {
    if (status === "fresh") return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    if (status === "suspect") return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
    if (status === "stale") return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
    if (status === "invalid") return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-white p-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800 mb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">
            Live Weather Observations Dashboard
          </h1>
          <p className="text-slate-400 text-sm">
            Operational provider health status, test levels, and real-time fusion validation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchHealth(activeSecret)}
            disabled={loading}
            className="bg-slate-900 border border-slate-800 hover:bg-slate-800 px-4 py-2 rounded-xl text-sm font-semibold transition"
          >
            {loading ? "Refreshing..." : "Refresh Data"}
          </button>
          <button
            onClick={handleLogout}
            className="bg-rose-950/40 border border-rose-900/30 text-rose-400 hover:bg-rose-950/60 px-4 py-2 rounded-xl text-sm font-semibold transition"
          >
            Lock Dashboard
          </button>
        </div>
      </header>

      {healthData && (
        <div className="space-y-8">
          {/* Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">System State</span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold capitalize">{healthData.status}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getSystemStatusColor(healthData.status)}`}>
                  {healthData.status}
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Providers</span>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold">{healthData.summary.healthyProviders}</span>
                <span className="text-sm text-slate-500">/ {healthData.summary.totalProviders} healthy</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Stations</span>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold">{healthData.summary.freshStations}</span>
                <span className="text-sm text-slate-500">/ {healthData.summary.totalStations} fresh</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fusion Coverage</span>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold">{healthData.summary.eligibleForFusionCount}</span>
                <span className="text-sm text-slate-500">stations eligible</span>
              </div>
            </div>
          </div>

          {/* Providers Grid */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Weather Providers</h2>
            <div className="grid grid-cols-1 gap-6">
              {healthData.providers.map((prov: any) => (
                <div key={prov.provider} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  {/* Provider Header */}
                  <div className="bg-slate-900/50 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-bold text-lg">{prov.displayName}</h3>
                      <p className="text-xs text-slate-500">Provider Key: {prov.provider}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">Response: {prov.responseTimeMs}ms</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getSystemStatusColor(prov.status)}`}>
                        {prov.status}
                      </span>
                    </div>
                  </div>

                  {/* Stations list */}
                  <div className="p-6">
                    {prov.stations.length === 0 ? (
                      <p className="text-sm text-slate-500">No stations registered for this provider.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="pb-3 font-semibold">Station</th>
                              <th className="pb-3 font-semibold">Status</th>
                              <th className="pb-3 font-semibold">Age</th>
                              <th className="pb-3 font-semibold">Latest Values</th>
                              <th className="pb-3 font-semibold">QC Score</th>
                              <th className="pb-3 font-semibold">Fusion Eligibility</th>
                              <th className="pb-3 font-semibold">Test Levels</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prov.stations.map((st: any) => {
                              const isMountain = st.allowedEffects.length === 0 || (!st.allowedEffects.includes("speed-bias") && !st.allowedEffects.includes("current-condition"));
                              return (
                                <tr key={st.stationId} className="border-b border-slate-800/40 hover:bg-slate-800/10 transition">
                                  <td className="py-4">
                                    <div className="font-semibold">{st.name}</div>
                                    <div className="text-xs text-slate-500">ID: {st.stationId}</div>
                                    {isMountain && (
                                      <span className="mt-1 inline-block bg-indigo-950/40 border border-indigo-950 text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold">
                                        CONTEXT / GRADIENT
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-4">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStationStatusBadge(st.status)}`}>
                                      {st.status}
                                    </span>
                                  </td>
                                  <td className="py-4 text-slate-300">
                                    {st.ageMinutes !== null ? `${st.ageMinutes} min` : "N/A"}
                                  </td>
                                  <td className="py-4 text-xs font-mono text-slate-300">
                                    {st.latestValues ? (
                                      <div className="space-y-0.5">
                                        <div>Wind: {st.latestValues.windSpeedKt !== null ? `${st.latestValues.windSpeedKt} kt` : "—"}</div>
                                        <div>Gust: {st.latestValues.windGustKt !== null ? `${st.latestValues.windGustKt} kt` : "—"}</div>
                                        <div>Dir: {st.latestValues.windDirectionDeg !== null ? `${st.latestValues.windDirectionDeg}°` : "—"}</div>
                                        <div>Temp: {st.latestValues.temperatureC !== null ? `${st.latestValues.temperatureC}°C` : "—"}</div>
                                      </div>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="py-4 font-semibold">
                                    <span className={st.qualityScore >= 0.8 ? "text-emerald-400" : st.qualityScore >= 0.5 ? "text-yellow-400" : "text-rose-400"}>
                                      {st.qualityScore * 100}%
                                    </span>
                                    <div className="text-[10px] text-slate-500 capitalize">{st.qualityStatus}</div>
                                  </td>
                                  <td className="py-4">
                                    {st.eligibleForFusion ? (
                                      <span className="text-emerald-400 font-semibold">✓ Yes</span>
                                    ) : (
                                      <span className="text-slate-500">No</span>
                                    )}
                                    <div className="text-[10px] text-slate-500">{st.boundSpotsCount} bound spots</div>
                                  </td>
                                  <td className="py-4">
                                    <div className="flex gap-1.5">
                                      <span
                                        title="L1 Connection"
                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                                          st.testLevels.level1_connectivity ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                                        }`}
                                      >
                                        L1
                                      </span>
                                      <span
                                        title="L2 Parsing"
                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                                          st.testLevels.level2_parsing ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                                        }`}
                                      >
                                        L2
                                      </span>
                                      <span
                                        title="L3 Quality"
                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                                          st.testLevels.level3_quality ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                                        }`}
                                      >
                                        L3
                                      </span>
                                      <span
                                        title="L4 Fusion"
                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                                          st.testLevels.level4_fusionEligibility ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                                        }`}
                                      >
                                        L4
                                      </span>
                                      <span
                                        title="L5 Engine"
                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                                          st.testLevels.level5_engineConsumption ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                                        }`}
                                      >
                                        L5
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
