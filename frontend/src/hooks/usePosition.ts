"use client";

/**
 * The phone's live GPS position while a map is open (the browser asks for permission once).
 * Stops watching when the component unmounts.
 */
import { useEffect, useState } from "react";

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

const supported = () => typeof navigator !== "undefined" && "geolocation" in navigator;

export function usePosition(enabled = true) {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !supported()) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
        setError(null);
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? "Location is turned off for this site. Allow it to see where you are." : "Your location could not be found yet."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { position, error: enabled && !supported() ? "This device can't share its location." : error };
}
