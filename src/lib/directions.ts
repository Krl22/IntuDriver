export type Coordinates = { lat: number; lng: number };

export interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteResult {
  geometry: GeoJSON.LineString;
  summary: RouteSummary;
}

export async function getDrivingRoute(
  origin: Coordinates,
  destination: Coordinates,
  token: string
): Promise<RouteResult> {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&geometries=geojson&overview=full`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Directions request failed");
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No route found");

  return {
    geometry: route.geometry as GeoJSON.LineString,
    summary: {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    },
  };
}

export function lineBounds(line: GeoJSON.LineString) {
  const [minLng, minLat, maxLng, maxLat] = line.coordinates.reduce(
    (acc, [lng, lat]) => {
      return [
        Math.min(acc[0], lng),
        Math.min(acc[1], lat),
        Math.max(acc[2], lng),
        Math.max(acc[3], lat),
      ];
    },
    [Infinity, Infinity, -Infinity, -Infinity] as [
      number,
      number,
      number,
      number
    ]
  );
  return { minLng, minLat, maxLng, maxLat };
}
