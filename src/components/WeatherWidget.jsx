import React, { useEffect, useMemo, useState } from "react";

// Simple Open-Meteo based current-weather widget (no API key, CORS-friendly)
// Defaults to Manila, PH. You can override via props.
export default function WeatherWidget({
  latitude = 14.5995,
  longitude = 120.9842,
  label = "Manila",
  className = "",
  refreshMinutes = 15,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const url = useMemo(() => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current_weather: "true",
      wind_speed_unit: "kmh",
      timezone: "Asia/Manila",
    });
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  }, [latitude, longitude]);

  useEffect(() => {
    let timer;
    const fetchNow = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json?.current_weather || null);
      } catch (e) {
        setError(e?.message || String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchNow();
    if (refreshMinutes > 0) {
      timer = setInterval(fetchNow, refreshMinutes * 60 * 1000);
    }
    return () => timer && clearInterval(timer);
  }, [url, refreshMinutes]);

  const desc = useMemo(() => mapWeatherCodeToText(data?.weathercode), [data]);
  const icon = useMemo(() => mapWeatherCodeToEmoji(data?.weathercode), [data]);

  return (
    <div className={["flex flex-col gap-2", className].join(" ")}> 
      <div className="flex items-center justify-between">
        <div className="font-semibold">{`Local Weather${label ? ` · ${label}` : ""}`}</div>
        <div className="text-xs text-ink/60">
          {loading ? "Loading…" : error ? "Error" : "Updated"}
        </div>
      </div>
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : loading ? (
        <div className="text-ink/70">Fetching current weather…</div>
      ) : data ? (
        <div className="flex items-center gap-3">
          <div className="text-2xl" aria-hidden>{icon}</div>
          <div className="flex-1">
            <div className="text-lg font-semibold">
              {Math.round(Number(data.temperature))}°{data.units?.temperature || "C"}
            </div>
            <div className="text-sm text-ink/70">
              {desc} · Wind {Math.round(Number(data.windspeed))} {data.units?.windspeed || "km/h"}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-ink/70">No data</div>
      )}
      <div className="flex items-center justify-between text-xs text-ink/60 mt-1">
        <div>{data?.time ? new Date(data.time).toLocaleString() : ""}</div>
        <a
          className="underline hover:no-underline"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          title="Powered by Open‑Meteo"
        >
          Open‑Meteo
        </a>
      </div>
    </div>
  );
}

function mapWeatherCodeToText(code) {
  switch (Number(code)) {
    case 0:
      return "Clear sky";
    case 1:
    case 2:
      return "Mainly clear/Partly cloudy";
    case 3:
      return "Overcast";
    case 45:
    case 48:
      return "Fog";
    case 51:
    case 53:
    case 55:
      return "Drizzle";
    case 61:
    case 63:
    case 65:
      return "Rain";
    case 71:
    case 73:
    case 75:
      return "Snow";
    case 80:
    case 81:
    case 82:
      return "Rain showers";
    case 95:
      return "Thunderstorm";
    case 96:
    case 99:
      return "Thunderstorm with hail";
    default:
      return "—";
  }
}

function mapWeatherCodeToEmoji(code) {
  switch (Number(code)) {
    case 0:
      return "☀️";
    case 1:
    case 2:
      return "⛅";
    case 3:
      return "☁️";
    case 45:
    case 48:
      return "🌫️";
    case 51:
    case 53:
    case 55:
      return "🌦️";
    case 61:
    case 63:
    case 65:
      return "🌧️";
    case 71:
    case 73:
    case 75:
      return "🌨️";
    case 80:
    case 81:
    case 82:
      return "🌧️";
    case 95:
    case 96:
    case 99:
      return "⛈️";
    default:
      return "ℹ️";
  }
}
