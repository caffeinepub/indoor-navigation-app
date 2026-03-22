// Leaflet loaded via CDN in index.html
declare const L: any;

import { Toaster } from "@/components/ui/sonner";
import {
  ChevronDown,
  ChevronUp,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const CENTER_LAT = 17.63314;
const CENTER_LON = 78.506311;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 17;
const BLOCK_LABEL_MIN_ZOOM = 18;
const CAMPUS_ROUTE_THRESHOLD = 120;

const TILE_LAYERS = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  default: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

const MREM_PLACE = {
  name: "MALLA REDDY ENGINEERING COLLEGE AND MANAGEMENT SCIENCES",
  aliases: [
    "MREM",
    "Malla Reddy",
    "MREM College",
    "Malla Reddy Engineering",
    "MRECMS",
  ],
  lat: 17.633047,
  lon: 78.505966,
};

const CAMPUS_PLACES = [
  {
    name: "Entrance Gate",
    aliases: ["entrance gate", "gate", "main gate", "entrance"],
    lat: 17.632536,
    lon: 78.506794,
  },
  {
    name: "MREM Canteen",
    aliases: ["mrem canteen", "canteen", "food"],
    lat: 17.632755,
    lon: 78.506438,
  },
  {
    name: "APJ Entrance",
    aliases: ["apj entrance", "apj gate", "apj"],
    lat: 17.632699,
    lon: 78.506135,
  },
  {
    name: "SRK Entrance",
    aliases: ["srk entrance", "srk gate", "srk"],
    lat: 17.632954,
    lon: 78.505814,
  },
  {
    name: "Sports / Gym",
    aliases: ["sports", "gym", "sports ground", "gymnasium"],
    lat: 17.633454,
    lon: 78.505998,
  },
  {
    name: "Parking",
    aliases: ["parking", "car park", "parking area"],
    lat: 17.633094,
    lon: 78.506767,
  },
  {
    name: "Ground",
    aliases: ["ground", "field", "playground", "play ground"],
    lat: 17.633886,
    lon: 78.50641,
  },
  {
    name: "Exit Gate",
    aliases: ["exit gate", "exit", "back gate"],
    lat: 17.634346,
    lon: 78.506923,
  },
];

const APJ_BLOCK_COORDS: [number, number][] = [
  [17.632619, 78.505749],
  [17.632428, 78.505756],
  [17.632463, 78.506518],
  [17.632648, 78.50651],
];

const SRK_BLOCK_COORDS: [number, number][] = [
  [17.632429, 78.505735],
  [17.632422, 78.505479],
  [17.633253, 78.505449],
  [17.633263, 78.505709],
];

// Campus internal path nodes (backbone route)
const CAMPUS_ROUTE_NODES: [number, number][] = [
  [17.632525, 78.506805], // 0 – entrance side
  [17.632784, 78.506799], // 1 – junction B
  [17.632739, 78.505822], // 2 – junction C
  [17.63341, 78.505797], // 3 – junction D
  [17.633439, 78.506837], // 4 – junction E
  [17.634347, 78.506933], // 5 – exit side
];

const CAMPUS_ROUTE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [1, 4],
];

// Campus bounding rectangle
const CAMPUS_RECT: [number, number][] = [
  [17.632509, 78.506869],
  [17.632414, 78.505447],
  [17.634656, 78.505377],
  [17.634488, 78.506983],
];

// ── helpers ─────────────────────────────────────────────────────────────────

function polygonCenter(coords: [number, number][]): [number, number] {
  const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lon = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lat, lon];
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}

function computeRouteDistance(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(coords[i - 1], coords[i]);
  }
  return total;
}

function isPointInCampusRect(pt: [number, number]): boolean {
  const lats = CAMPUS_RECT.map((c) => c[0]);
  const lons = CAMPUS_RECT.map((c) => c[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return (
    pt[0] >= minLat && pt[0] <= maxLat && pt[1] >= minLon && pt[1] <= maxLon
  );
}

// Closest point on a line segment to pt
function closestPointOnSegment(
  pt: [number, number],
  a: [number, number],
  b: [number, number],
): { point: [number, number]; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, t: 0 };
  const t = Math.max(
    0,
    Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq),
  );
  return { point: [a[0] + t * dx, a[1] + t * dy], t };
}

function nearestEdgePoint(pt: [number, number]): {
  point: [number, number];
  edgeA: number;
  edgeB: number;
  t: number;
  dist: number;
} {
  let best = {
    point: CAMPUS_ROUTE_NODES[0] as [number, number],
    edgeA: 0,
    edgeB: 1,
    t: 0,
    dist: Number.POSITIVE_INFINITY,
  };
  for (const [a, b] of CAMPUS_ROUTE_EDGES) {
    const { point, t } = closestPointOnSegment(
      pt,
      CAMPUS_ROUTE_NODES[a],
      CAMPUS_ROUTE_NODES[b],
    );
    const d = haversine(pt, point);
    if (d < best.dist) best = { point, edgeA: a, edgeB: b, t, dist: d };
  }
  return best;
}

function bearingDeg(from: [number, number], to: [number, number]): number {
  const dLon = ((to[1] - from[1]) * Math.PI) / 180;
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Fetch OSRM walking route – returns [lat, lon][] or null
async function fetchOsrmRoute(
  start: [number, number],
  dest: [number, number],
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${start[1]},${start[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    return data.routes[0].geometry.coordinates.map(
      ([lon, lat]: [number, number]) => [lat, lon] as [number, number],
    );
  } catch {
    return null;
  }
}

// Fetch Mapbox walking route – returns [lat, lon][] or null
async function fetchMapboxRoute(
  start: [number, number],
  dest: [number, number],
): Promise<[number, number][] | null> {
  try {
    const MAPBOX_TOKEN =
      "pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw";
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${start[1]},${start[0]};${dest[1]},${dest[0]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    return data.routes[0].geometry.coordinates.map(
      ([lon, lat]: [number, number]) => [lat, lon] as [number, number],
    );
  } catch {
    return null;
  }
}

// Build campus backbone route between two points using Dijkstra over all edges
function buildBackboneRoute(
  startPt: [number, number],
  destPt: [number, number],
): [number, number][] {
  const snapStart = nearestEdgePoint(startPt);
  const snapDest = nearestEdgePoint(destPt);

  const VIRTUAL_START = CAMPUS_ROUTE_NODES.length; // 6
  const VIRTUAL_DEST = CAMPUS_ROUTE_NODES.length + 1; // 7

  type AdjEntry = { to: number; dist: number };
  const adj = new Map<number, AdjEntry[]>();
  const allNodes = CAMPUS_ROUTE_NODES.map((_, i) => i);
  allNodes.push(VIRTUAL_START, VIRTUAL_DEST);
  for (const n of allNodes) adj.set(n, []);

  // Original edges (bidirectional)
  for (const [a, b] of CAMPUS_ROUTE_EDGES) {
    const d = haversine(CAMPUS_ROUTE_NODES[a], CAMPUS_ROUTE_NODES[b]);
    adj.get(a)!.push({ to: b, dist: d });
    adj.get(b)!.push({ to: a, dist: d });
  }

  // Virtual start connects to both endpoints of its edge
  const dSA = haversine(snapStart.point, CAMPUS_ROUTE_NODES[snapStart.edgeA]);
  const dSB = haversine(snapStart.point, CAMPUS_ROUTE_NODES[snapStart.edgeB]);
  adj.get(VIRTUAL_START)!.push({ to: snapStart.edgeA, dist: dSA });
  adj.get(VIRTUAL_START)!.push({ to: snapStart.edgeB, dist: dSB });
  adj.get(snapStart.edgeA)!.push({ to: VIRTUAL_START, dist: dSA });
  adj.get(snapStart.edgeB)!.push({ to: VIRTUAL_START, dist: dSB });

  // Virtual dest connects to both endpoints of its edge
  const dDA = haversine(snapDest.point, CAMPUS_ROUTE_NODES[snapDest.edgeA]);
  const dDB = haversine(snapDest.point, CAMPUS_ROUTE_NODES[snapDest.edgeB]);
  adj.get(VIRTUAL_DEST)!.push({ to: snapDest.edgeA, dist: dDA });
  adj.get(VIRTUAL_DEST)!.push({ to: snapDest.edgeB, dist: dDB });
  adj.get(snapDest.edgeA)!.push({ to: VIRTUAL_DEST, dist: dDA });
  adj.get(snapDest.edgeB)!.push({ to: VIRTUAL_DEST, dist: dDB });

  // Dijkstra
  const INF = Number.POSITIVE_INFINITY;
  const distMap = new Map<number, number>();
  const prev = new Map<number, number>();
  const visited = new Set<number>();
  for (const n of allNodes) distMap.set(n, INF);
  distMap.set(VIRTUAL_START, 0);

  while (true) {
    let u = -1;
    let minD = INF;
    for (const n of allNodes) {
      if (!visited.has(n)) {
        const d = distMap.get(n) ?? INF;
        if (d < minD) {
          minD = d;
          u = n;
        }
      }
    }
    if (u === -1 || u === VIRTUAL_DEST) break;
    visited.add(u);
    for (const { to, dist: d } of adj.get(u) ?? []) {
      const nd = (distMap.get(u) ?? INF) + d;
      if (nd < (distMap.get(to) ?? INF)) {
        distMap.set(to, nd);
        prev.set(to, u);
      }
    }
  }

  // Reconstruct path of node indices
  const nodePath: number[] = [];
  let cur: number | undefined = VIRTUAL_DEST;
  while (cur !== undefined) {
    nodePath.unshift(cur);
    cur = prev.get(cur);
  }

  const nodeCoord = (n: number): [number, number] => {
    if (n === VIRTUAL_START) return snapStart.point;
    if (n === VIRTUAL_DEST) return snapDest.point;
    return CAMPUS_ROUTE_NODES[n];
  };

  const route: [number, number][] = [startPt];
  for (const n of nodePath) route.push(nodeCoord(n));
  route.push(destPt);
  return route;
}

// ── icon factories ───────────────────────────────────────────────────────────

function createArrowDivIcon(heading: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg)"><div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:22px solid #1E73BE;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createCustomStartIcon(bearing: number) {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center">
        <div style="width:20px;height:20px;background:#E53935;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.6);position:absolute"></div>
        <div style="position:absolute;transform:rotate(${bearing}deg);transform-origin:center center">
          <svg width="24" height="24" viewBox="0 0 24 24" style="display:block;margin:auto">
            <polygon points="12,2 18,18 12,14 6,18" fill="#E53935" stroke="white" stroke-width="1.5"/>
          </svg>
        </div>
      </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// ── search ───────────────────────────────────────────────────────────────────

interface SearchResult {
  name: string;
  lat: number;
  lon: number;
}

interface Coords {
  lat: number;
  lon: number;
}

async function searchPlaces(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  if (query.length < 2) return results;
  const q = query.toLowerCase().trim();

  if (
    MREM_PLACE.name.toLowerCase().includes(q) ||
    MREM_PLACE.aliases.some((a) => a.toLowerCase().includes(q))
  ) {
    results.push({
      name: MREM_PLACE.name,
      lat: MREM_PLACE.lat,
      lon: MREM_PLACE.lon,
    });
  }

  for (const place of CAMPUS_PLACES) {
    const match =
      place.name.toLowerCase().includes(q) ||
      place.aliases.some((a) => a.toLowerCase().includes(q));
    if (match) {
      results.push({
        name: `${place.name} – MREM Campus`,
        lat: place.lat,
        lon: place.lon,
      });
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=in&viewbox=78.0,17.0,79.0,18.5&bounded=0`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    const telangana: SearchResult[] = [];
    const others: SearchResult[] = [];
    for (const item of data) {
      const name = item.display_name as string;
      if (
        results.find(
          (r) =>
            r.lat === Number.parseFloat(item.lat) &&
            r.lon === Number.parseFloat(item.lon),
        )
      )
        continue;
      const entry: SearchResult = {
        name,
        lat: Number.parseFloat(item.lat),
        lon: Number.parseFloat(item.lon),
      };
      if (name.toLowerCase().includes("telangana")) telangana.push(entry);
      else others.push(entry);
    }
    results.push(...telangana, ...others);
  } catch {
    /* silently ignore */
  }

  return results;
}

// ── component ────────────────────────────────────────────────────────────────

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const gpsMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const prevGpsRef = useRef<Coords | null>(null);
  const currentGpsRef = useRef<Coords | null>(null);
  const tileLayerRef = useRef<any>(null);
  const apjLabelRef = useRef<any>(null);
  const srkLabelRef = useRef<any>(null);
  const customStartMarkerRef = useRef<any>(null);

  const [startInput, setStartInput] = useState("");
  const [destInput, setDestInput] = useState("");
  const [startCoords, setStartCoords] = useState<Coords | null>(null);
  const [destCoords, setDestCoords] = useState<Coords | null>(null);
  const [startSuggestions, setStartSuggestions] = useState<SearchResult[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<SearchResult[]>([]);
  const [showStartSugg, setShowStartSugg] = useState(false);
  const [showDestSugg, setShowDestSugg] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [startPreview, setStartPreview] = useState<{
    name: string;
    coords: Coords;
  } | null>(null);
  const [destPreview, setDestPreview] = useState<{
    name: string;
    coords: Coords;
  } | null>(null);
  const [mapMode, setMapMode] = useState<"satellite" | "default">("satellite");
  const [customStartCoords, setCustomStartCoords] = useState<Coords | null>(
    null,
  );
  const [routeInfo, setRouteInfo] = useState<{
    distanceM: number;
    timeMin: number;
  } | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    (L.Icon.Default.prototype as any)._getIconUrl = undefined;
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(mapContainerRef.current, {
      center: [CENTER_LAT, CENTER_LON],
      zoom: DEFAULT_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomControl: false,
    });

    const tileLayer = L.tileLayer(TILE_LAYERS.satellite.url, {
      attribution: TILE_LAYERS.satellite.attribution,
      maxZoom: MAX_ZOOM,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Campus backbone route – thin dashed light-black line (always visible)
    for (const [a, b] of CAMPUS_ROUTE_EDGES) {
      L.polyline([CAMPUS_ROUTE_NODES[a], CAMPUS_ROUTE_NODES[b]], {
        color: "#555555",
        weight: 2.5,
        opacity: 0.55,
        dashArray: "6, 5",
      }).addTo(map);
    }

    // APJ BLOCK label
    const apjCenter = polygonCenter(APJ_BLOCK_COORDS);
    const apjIcon = L.divIcon({
      className: "",
      html: `<div style="color:#FFD700;font-size:13px;font-weight:900;font-family:Inter,sans-serif;text-shadow:0 0 4px #000,0 0 8px #000;white-space:nowrap;letter-spacing:1px">APJ BLOCK</div>`,
      iconAnchor: [36, 8],
    });
    apjLabelRef.current = L.marker(apjCenter, {
      icon: apjIcon,
      interactive: false,
    });

    // SRK BLOCK label
    const srkCenter = polygonCenter(SRK_BLOCK_COORDS);
    const srkIcon = L.divIcon({
      className: "",
      html: `<div style="color:#FF6B35;font-size:13px;font-weight:900;font-family:Inter,sans-serif;text-shadow:0 0 4px #000,0 0 8px #000;white-space:nowrap;letter-spacing:1px">SRK BLOCK</div>`,
      iconAnchor: [40, 8],
    });
    srkLabelRef.current = L.marker(srkCenter, {
      icon: srkIcon,
      interactive: false,
    });

    const updateBlockLabels = () => {
      const zoom = map.getZoom();
      const apj = apjLabelRef.current;
      const srk = srkLabelRef.current;
      if (zoom >= BLOCK_LABEL_MIN_ZOOM) {
        if (apj && !map.hasLayer(apj)) apj.addTo(map);
        if (srk && !map.hasLayer(srk)) srk.addTo(map);
      } else {
        if (apj && map.hasLayer(apj)) map.removeLayer(apj);
        if (srk && map.hasLayer(srk)) map.removeLayer(srk);
      }
    };
    map.on("zoomend", updateBlockLabels);
    updateBlockLabels();

    // Long-press detection
    let lpTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelLP = () => {
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
    };
    const triggerLP = (latlng: any) => {
      cancelLP();
      lpTimer = setTimeout(() => {
        lpTimer = null;
        window.dispatchEvent(
          new CustomEvent("map-long-press", {
            detail: { lat: latlng.lat, lon: latlng.lng },
          }),
        );
      }, 650);
    };

    map.on("mousedown", (e: any) => triggerLP(e.latlng));
    map.on("mouseup mousemove", cancelLP);
    map.on("touchstart", (e: any) => {
      if (e.originalEvent.touches.length === 1) triggerLP(e.latlng);
    });
    map.on("touchend touchmove", cancelLP);

    mapRef.current = map;

    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Long-press handler
  useEffect(() => {
    const handler = (e: Event) => {
      const { lat, lon } = (e as CustomEvent).detail as {
        lat: number;
        lon: number;
      };

      if (customStartMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(customStartMarkerRef.current);
        customStartMarkerRef.current = null;
      }
      if (routeLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }

      const bearing = destCoords
        ? bearingDeg([lat, lon], [destCoords.lat, destCoords.lon])
        : 0;

      if (mapRef.current) {
        customStartMarkerRef.current = L.marker([lat, lon], {
          icon: createCustomStartIcon(bearing),
          zIndexOffset: 900,
        }).addTo(mapRef.current);
      }

      setCustomStartCoords({ lat, lon });
    };

    window.addEventListener("map-long-press", handler);
    return () => window.removeEventListener("map-long-press", handler);
  }, [destCoords]);

  // Swap tile layer
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    const config = TILE_LAYERS[mapMode];
    tileLayerRef.current = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: MAX_ZOOM,
    }).addTo(mapRef.current);
  }, [mapMode]);

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading } = pos.coords;
        const newCoords = { lat: latitude, lon: longitude };
        let computedHeading = heading || 0;
        if (!heading && prevGpsRef.current) {
          const dlat = latitude - prevGpsRef.current.lat;
          const dlon = longitude - prevGpsRef.current.lon;
          computedHeading = (Math.atan2(dlon, dlat) * 180) / Math.PI;
        }
        prevGpsRef.current = currentGpsRef.current;
        currentGpsRef.current = newCoords;
        if (mapRef.current) {
          if (!gpsMarkerRef.current) {
            gpsMarkerRef.current = L.marker([latitude, longitude], {
              icon: createArrowDivIcon(computedHeading),
              zIndexOffset: 1000,
            }).addTo(mapRef.current);
          } else {
            gpsMarkerRef.current.setLatLng([latitude, longitude]);
            gpsMarkerRef.current.setIcon(createArrowDivIcon(computedHeading));
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000 },
    );
    watchIdRef.current = watchId;
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const startDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCustomStart = useCallback(() => {
    if (customStartMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(customStartMarkerRef.current);
      customStartMarkerRef.current = null;
    }
    setCustomStartCoords(null);
  }, []);

  const handleStartInput = useCallback(
    (val: string) => {
      setStartInput(val);
      setStartCoords(null);
      if (val !== "") clearCustomStart();
      if (startDebounceRef.current) clearTimeout(startDebounceRef.current);
      if (val.length < 2) {
        setStartSuggestions([]);
        return;
      }
      startDebounceRef.current = setTimeout(async () => {
        const results = await searchPlaces(val);
        setStartSuggestions(results);
        setShowStartSugg(results.length > 0);
      }, 300);
    },
    [clearCustomStart],
  );

  const handleDestInput = useCallback((val: string) => {
    setDestInput(val);
    setDestCoords(null);
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    if (val.length < 2) {
      setDestSuggestions([]);
      return;
    }
    destDebounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(val);
      setDestSuggestions(results);
      setShowDestSugg(results.length > 0);
    }, 300);
  }, []);

  const handleStartNavigate = useCallback(async () => {
    if (!destInput.trim() && !destCoords) {
      toast.error("Please enter a destination");
      return;
    }
    setIsLoading(true);
    setRouteInfo(null);

    // Resolve start: long-press custom > typed > GPS
    let resolvedStart: Coords | null = customStartCoords ?? startCoords ?? null;
    let startName = customStartCoords
      ? "Custom Location"
      : startInput.trim() || "My Location";

    if (!resolvedStart) {
      if (startInput.trim()) {
        const results = await searchPlaces(startInput);
        if (results.length === 0) {
          toast.error("Start location not found");
          setIsLoading(false);
          return;
        }
        resolvedStart = { lat: results[0].lat, lon: results[0].lon };
        startName = results[0].name;
      } else {
        try {
          const pos = await new Promise<GeolocationPosition>(
            (resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 8000,
              }),
          );
          resolvedStart = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          };
          startName = "My Location";
        } catch {
          toast.error("Could not get GPS location");
          setIsLoading(false);
          return;
        }
      }
    }

    let resolvedDest = destCoords;
    let destName = destInput.trim();
    if (!resolvedDest) {
      const results = await searchPlaces(destInput);
      if (results.length === 0) {
        toast.error("Destination not found");
        setIsLoading(false);
        return;
      }
      resolvedDest = { lat: results[0].lat, lon: results[0].lon };
      destName = results[0].name;
    }

    const startPt: [number, number] = [resolvedStart.lat, resolvedStart.lon];
    const destPt: [number, number] = [resolvedDest.lat, resolvedDest.lon];

    const startInCampus = isPointInCampusRect(startPt);
    const destInCampus = isPointInCampusRect(destPt);

    let routeCoords: [number, number][] | null = null;

    if (startInCampus && destInCampus) {
      // Both inside campus: use backbone walking path
      routeCoords = buildBackboneRoute(startPt, destPt);
    } else {
      // At least one point is outside campus: fetch real walking route from OSRM
      // Try OSRM and Mapbox in parallel
      const [osrmRoute, mapboxRoute] = await Promise.all([
        fetchOsrmRoute(startPt, destPt),
        fetchMapboxRoute(startPt, destPt),
      ]);

      if (osrmRoute && osrmRoute.length > 2) {
        routeCoords = osrmRoute;
      } else if (mapboxRoute && mapboxRoute.length > 2) {
        routeCoords = mapboxRoute;
      } else {
        // Fallback: backbone route (at least follows campus paths)
        const nearDest = nearestEdgePoint(destPt);
        if (nearDest.dist < CAMPUS_ROUTE_THRESHOLD) {
          routeCoords = buildBackboneRoute(startPt, destPt);
        } else {
          toast.error(
            "No walking route found. Check your connection and try again.",
          );
          setIsLoading(false);
          return;
        }
      }
    }

    // Compute and set distance/time info
    if (routeCoords) {
      const distM = computeRouteDistance(routeCoords);
      const timeMin = Math.ceil(distM / 83.3); // walking ~5 km/h
      setRouteInfo({ distanceM: distM, timeMin });
    }

    if (mapRef.current && routeCoords) {
      if (routeLayerRef.current) routeLayerRef.current.remove();

      // Draw single deep-blue walking route
      const polyline = L.polyline(routeCoords, {
        color: "#1565C0",
        weight: 6,
        opacity: 0.95,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(mapRef.current);

      routeLayerRef.current = polyline;
      mapRef.current.flyToBounds(polyline.getBounds(), {
        padding: [60, 60],
        duration: 1.5,
        easeLinearity: 0.25,
      });
    }

    setStartPreview({ name: startName, coords: resolvedStart });
    setDestPreview({ name: destName, coords: resolvedDest });
    setIsNavigating(true);
    setPanelCollapsed(true);
    setIsLoading(false);
  }, [startCoords, destCoords, startInput, destInput, customStartCoords]);

  const handleMyLocation = useCallback(() => {
    if (currentGpsRef.current && mapRef.current) {
      mapRef.current.flyTo(
        [currentGpsRef.current.lat, currentGpsRef.current.lon],
        mapRef.current.getZoom(),
        { duration: 1 },
      );
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          mapRef.current?.flyTo(
            [pos.coords.latitude, pos.coords.longitude],
            mapRef.current.getZoom(),
            { duration: 1 },
          ),
        () => toast.error("Could not get GPS location"),
      );
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!mapRef.current) return;
    if (mapRef.current.getZoom() >= MAX_ZOOM)
      toast.info(`Maximum zoom reached (level ${MAX_ZOOM})`);
    else mapRef.current.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const truncate = (s: string, n = 22) =>
    s.length > n ? `${s.slice(0, n)}\u2026` : s;

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div ref={mapContainerRef} className="map-container" />

      {/* Long-press hint */}
      {customStartCoords && (
        <div
          style={{
            position: "absolute",
            bottom: routeInfo ? 80 : 140,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(229,57,53,0.92)",
            color: "white",
            fontSize: "11px",
            fontWeight: 600,
            padding: "5px 14px",
            borderRadius: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            fontFamily: "Inter, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          Custom start set – enter destination to route
        </div>
      )}

      {/* Navigation Panel */}
      <div
        className="nav-panel absolute top-3 left-1/2 z-[1000] w-[min(92vw,420px)]"
        style={{ transform: "translateX(-50%)" }}
      >
        {panelCollapsed ? (
          <button
            type="button"
            onClick={() => setPanelCollapsed(false)}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
            style={{
              background: "#243040",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "white",
            }}
          >
            <MapPin size={14} style={{ color: "#1E73BE", flexShrink: 0 }} />
            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              {truncate(startPreview?.name || "Start")}
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{"\u2192"}</span>
            <Search size={14} style={{ color: "#D84B4B", flexShrink: 0 }} />
            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              {truncate(destPreview?.name || "Destination")}
            </span>
            <ChevronDown
              size={14}
              style={{
                color: "rgba(255,255,255,0.5)",
                marginLeft: "auto",
                flexShrink: 0,
              }}
            />
          </button>
        ) : (
          <div
            style={{
              background: "#243040",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "16px",
              padding: "12px",
            }}
          >
            {isNavigating && (
              <div className="flex justify-end mb-1">
                <button
                  type="button"
                  onClick={() => setPanelCollapsed(true)}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                  }}
                >
                  <ChevronUp size={16} />
                </button>
              </div>
            )}

            {/* Start row */}
            <div className="relative mb-2">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "#2D3A4B" }}
              >
                <MapPin
                  size={14}
                  style={{
                    color: customStartCoords ? "#E53935" : "#1E73BE",
                    flexShrink: 0,
                  }}
                />
                <input
                  type="text"
                  placeholder={
                    customStartCoords
                      ? "Custom location (long-pressed)"
                      : "Current Location"
                  }
                  value={startInput}
                  onChange={(e) => handleStartInput(e.target.value)}
                  onFocus={() =>
                    startSuggestions.length > 0 && setShowStartSugg(true)
                  }
                  onBlur={() => setTimeout(() => setShowStartSugg(false), 150)}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "white", fontFamily: "Inter, sans-serif" }}
                />
                {(startInput || customStartCoords) && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      setStartInput("");
                      setStartCoords(null);
                      setStartSuggestions([]);
                      clearCustomStart();
                    }}
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "16px",
                      lineHeight: 1,
                    }}
                  >
                    {"\u00d7"}
                  </button>
                )}
              </div>
              {showStartSugg && startSuggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-10"
                  style={{
                    background: "#1B2533",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  {startSuggestions.map((s) => (
                    <button
                      type="button"
                      key={`start-${s.lat}-${s.lon}`}
                      className="suggestion-item w-full text-left px-3 py-2 text-xs"
                      style={{
                        color: "rgba(255,255,255,0.85)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "block",
                        fontFamily: "Inter, sans-serif",
                      }}
                      onMouseDown={() => {
                        setStartInput(s.name);
                        setStartCoords({ lat: s.lat, lon: s.lon });
                        clearCustomStart();
                        setShowStartSugg(false);
                      }}
                    >
                      <span style={{ color: "#1E73BE", marginRight: "6px" }}>
                        {"\u2299"}
                      </span>
                      {s.name.length > 60
                        ? `${s.name.slice(0, 60)}\u2026`
                        : s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Destination row */}
            <div className="relative mb-3">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "#2D3A4B" }}
              >
                <Search size={14} style={{ color: "#D84B4B", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Destination"
                  value={destInput}
                  onChange={(e) => handleDestInput(e.target.value)}
                  onFocus={() =>
                    destSuggestions.length > 0 && setShowDestSugg(true)
                  }
                  onBlur={() => setTimeout(() => setShowDestSugg(false), 150)}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "white", fontFamily: "Inter, sans-serif" }}
                />
                {destInput && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      setDestInput("");
                      setDestCoords(null);
                      setDestSuggestions([]);
                    }}
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "16px",
                      lineHeight: 1,
                    }}
                  >
                    {"\u00d7"}
                  </button>
                )}
              </div>
              {showDestSugg && destSuggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-10"
                  style={{
                    background: "#1B2533",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  {destSuggestions.map((s) => (
                    <button
                      type="button"
                      key={`dest-${s.lat}-${s.lon}`}
                      className="suggestion-item w-full text-left px-3 py-2 text-xs"
                      style={{
                        color: "rgba(255,255,255,0.85)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "block",
                        fontFamily: "Inter, sans-serif",
                      }}
                      onMouseDown={() => {
                        setDestInput(s.name);
                        setDestCoords({ lat: s.lat, lon: s.lon });
                        setShowDestSugg(false);
                      }}
                    >
                      <span style={{ color: "#D84B4B", marginRight: "6px" }}>
                        {"\u2299"}
                      </span>
                      {s.name.length > 60
                        ? `${s.name.slice(0, 60)}\u2026`
                        : s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Start Navigation button */}
            <button
              type="button"
              onClick={handleStartNavigate}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{
                background: isLoading ? "#1a5c9a" : "#1E73BE",
                color: "white",
                border: "none",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontFamily: "Inter, sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isLoading ? (
                <>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid white",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span>Finding route\u2026</span>
                </>
              ) : (
                <>
                  <Navigation size={14} /> Start Navigation
                </>
              )}
            </button>
          </div>
        )}

        {/* Preview strip */}
        {isNavigating && startPreview && destPreview && (
          <div
            className="mt-2 flex gap-2"
            style={{
              opacity: panelCollapsed ? 1 : 0.95,
              pointerEvents: panelCollapsed ? "auto" : "none",
            }}
          >
            <PreviewCard
              label="Start"
              name={startPreview.name}
              coords={startPreview.coords}
            />
            <PreviewCard
              label="Destination"
              name={destPreview.name}
              coords={destPreview.coords}
            />
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div
        className="absolute right-3 z-[1000] flex flex-col gap-1"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      >
        <button
          type="button"
          onClick={handleZoomIn}
          style={{
            width: 36,
            height: 36,
            borderRadius: "10px",
            background: "white",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            color: "#333",
          }}
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          style={{
            width: 36,
            height: 36,
            borderRadius: "10px",
            background: "white",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            color: "#333",
          }}
        >
          <Minus size={18} />
        </button>
      </div>

      {/* Map Layer Toggle */}
      <button
        type="button"
        onClick={() =>
          setMapMode((prev) => (prev === "satellite" ? "default" : "satellite"))
        }
        style={{
          position: "absolute",
          bottom: routeInfo ? 104 : 88,
          right: 16,
          zIndex: 1000,
          borderRadius: "20px",
          padding: "8px 14px",
          background: "white",
          border: "none",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 600,
          color: "#333",
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
          fontFamily: "Inter, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {mapMode === "satellite"
          ? "\uD83D\uDDFA Map"
          : "\uD83D\uDEF0 Satellite"}
      </button>

      {/* My Location */}
      <button
        type="button"
        onClick={handleMyLocation}
        style={{
          position: "absolute",
          bottom: routeInfo ? 40 : 24,
          right: 16,
          zIndex: 1000,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "#1E73BE",
          border: "3px solid white",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          color: "white",
        }}
      >
        <LocateFixed size={20} />
      </button>

      {/* Route Info Bar */}
      {routeInfo && (
        <div
          data-ocid="route.panel"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            background: "#1B2533",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "28px",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Distance
            </span>
            <span style={{ color: "white", fontSize: "18px", fontWeight: 700 }}>
              {routeInfo.distanceM >= 1000
                ? `${(routeInfo.distanceM / 1000).toFixed(1)} km`
                : `${Math.round(routeInfo.distanceM)} m`}
            </span>
          </div>
          <div
            style={{
              width: 1,
              height: 36,
              background: "rgba(255,255,255,0.15)",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Walking Time
            </span>
            <span style={{ color: "white", fontSize: "18px", fontWeight: 700 }}>
              {routeInfo.timeMin < 60
                ? `${routeInfo.timeMin} min`
                : `${Math.floor(routeInfo.timeMin / 60)}h ${routeInfo.timeMin % 60}m`}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .leaflet-container { font-family: Inter, sans-serif; }
        input::placeholder { color: rgba(255,255,255,0.4); }
        .map-container { width: 100%; height: 100%; }
        .suggestion-item:hover { background: rgba(255,255,255,0.07) !important; }
      `}</style>

      <Toaster position="top-center" theme="dark" />
    </div>
  );
}

function PreviewCard({
  label,
  name,
  coords,
}: { label: string; name: string; coords: Coords }) {
  const [imgError, setImgError] = useState(false);
  const thumbUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${coords.lat},${coords.lon}&zoom=17&size=150x100&markers=${coords.lat},${coords.lon},red-pushpin`;
  const shortName = name.length > 30 ? `${name.slice(0, 30)}\u2026` : name;
  const isStart = label === "Start";

  return (
    <div
      style={{
        flex: 1,
        background: "white",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        fontSize: "11px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ position: "relative", height: 80 }}>
        {!imgError ? (
          <img
            src={thumbUrl}
            alt={label}
            onError={() => setImgError(true)}
            style={{
              width: "100%",
              height: "80px",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "80px",
              background: isStart ? "#1E73BE" : "#D84B4B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "24px",
            }}
          >
            {isStart ? "\uD83D\uDCCD" : "\uD83C\uDFC1"}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            background: isStart ? "#1E73BE" : "#D84B4B",
            color: "white",
            fontSize: "9px",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          padding: "6px 8px",
          color: "#333",
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        {shortName}
      </div>
    </div>
  );
}
