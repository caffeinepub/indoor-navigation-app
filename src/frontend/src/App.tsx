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

// Named campus locations
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

// Block polygons
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

function polygonCenter(coords: [number, number][]): [number, number] {
  const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lon = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lat, lon];
}

interface SearchResult {
  name: string;
  lat: number;
  lon: number;
}

interface Coords {
  lat: number;
  lon: number;
}

function createArrowDivIcon(heading: number) {
  return L.divIcon({
    className: "",
    html: `
      <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg)">
        <div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:22px solid #1E73BE;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))"></div>
      </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

async function searchPlaces(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  if (query.length < 2) return results;

  const q = query.toLowerCase().trim();

  // 1. Check MREM
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

  // 2. Check campus places (exact/partial match)
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

  // 3. Nominatim with Telangana/India bias
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=in&viewbox=78.0,17.0,79.0,18.5&bounded=0`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();

    // Prioritize Telangana results
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
      if (name.toLowerCase().includes("telangana")) {
        telangana.push(entry);
      } else {
        others.push(entry);
      }
    }
    results.push(...telangana, ...others);
  } catch {
    // silently ignore
  }

  return results;
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const gpsMarkerRef = useRef<any>(null);
  const mremMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const prevGpsRef = useRef<Coords | null>(null);
  const currentGpsRef = useRef<Coords | null>(null);
  const tileLayerRef = useRef<any>(null);

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

  // Auto-route when both coords are selected
  useEffect(() => {
    if (startCoords && destCoords) {
      handleStartNavigate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCoords, destCoords]);

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

    // MREM label marker
    const mremIcon = L.divIcon({
      className: "",
      html: `<div style="background:#D84B4B;color:white;font-size:10px;font-weight:700;padding:3px 7px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);border:2px solid white;font-family:Inter,sans-serif">MREM</div>`,
      iconSize: [52, 24],
      iconAnchor: [26, 12],
    });
    const mremMarker = L.marker([MREM_PLACE.lat, MREM_PLACE.lon], {
      icon: mremIcon,
    })
      .addTo(map)
      .bindPopup(
        `<strong style="font-family:Inter,sans-serif;font-size:12px">${MREM_PLACE.name}</strong>`,
      );
    mremMarkerRef.current = mremMarker;

    // Campus place markers
    for (const place of CAMPUS_PLACES) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:rgba(30,115,190,0.9);color:white;font-size:9px;font-weight:600;padding:2px 6px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.7);font-family:Inter,sans-serif">${place.name}</div>`,
        iconSize: [null as any, 18],
        iconAnchor: [0, 9],
      });
      L.marker([place.lat, place.lon], { icon })
        .addTo(map)
        .bindPopup(
          `<strong style="font-family:Inter,sans-serif;font-size:11px">${place.name}</strong><br/><span style="font-size:10px;color:#666">${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}</span>`,
        );
    }

    // APJ BLOCK polygon
    L.polygon(APJ_BLOCK_COORDS, {
      color: "#FFD700",
      weight: 2,
      fillColor: "#FFD700",
      fillOpacity: 0.15,
    }).addTo(map);

    const apjCenter = polygonCenter(APJ_BLOCK_COORDS);
    const apjLabel = L.divIcon({
      className: "",
      html: `<div style="color:#FFD700;font-size:13px;font-weight:900;font-family:Inter,sans-serif;text-shadow:0 0 4px #000,0 0 8px #000;white-space:nowrap;letter-spacing:1px">APJ BLOCK</div>`,
      iconAnchor: [36, 8],
    });
    L.marker(apjCenter, { icon: apjLabel, interactive: false }).addTo(map);

    // SRK BLOCK polygon
    L.polygon(SRK_BLOCK_COORDS, {
      color: "#FF6B35",
      weight: 2,
      fillColor: "#FF6B35",
      fillOpacity: 0.15,
    }).addTo(map);

    const srkCenter = polygonCenter(SRK_BLOCK_COORDS);
    const srkLabel = L.divIcon({
      className: "",
      html: `<div style="color:#FF6B35;font-size:13px;font-weight:900;font-family:Inter,sans-serif;text-shadow:0 0 4px #000,0 0 8px #000;white-space:nowrap;letter-spacing:1px">SRK BLOCK</div>`,
      iconAnchor: [40, 8],
    });
    L.marker(srkCenter, { icon: srkLabel, interactive: false }).addTo(map);

    mapRef.current = map;

    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Swap tile layer when mapMode changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    const config = TILE_LAYERS[mapMode];
    const newLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: MAX_ZOOM,
    }).addTo(mapRef.current);
    tileLayerRef.current = newLayer;
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

  const handleStartInput = useCallback((val: string) => {
    setStartInput(val);
    setStartCoords(null);
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
  }, []);

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
    let resolvedStart = startCoords;
    let startName = startInput.trim() || "My Location";

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
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 8000,
              });
            },
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

    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/foot/${resolvedStart.lon},${resolvedStart.lat};${resolvedDest.lon},${resolvedDest.lat}?overview=full&geometries=geojson`,
      );
      const data = await res.json();

      if (!data.routes || data.routes.length === 0) {
        toast.error("No route found between these locations");
        setIsLoading(false);
        return;
      }

      const coords = data.routes[0].geometry.coordinates.map(
        ([lon, lat]: [number, number]) => [lat, lon] as [number, number],
      );

      if (mapRef.current) {
        if (routeLayerRef.current) routeLayerRef.current.remove();
        const polyline = L.polyline(coords, {
          color: "#1E73BE",
          weight: 5,
          opacity: 0.9,
        }).addTo(mapRef.current);
        routeLayerRef.current = polyline;
        // Smooth animated flyToBounds (1.5s)
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
    } catch {
      toast.error("Failed to fetch route. Please try again.");
    }

    setIsLoading(false);
  }, [startCoords, destCoords, startInput, destInput]);

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
    if (mapRef.current.getZoom() >= MAX_ZOOM) {
      toast.info(`Maximum zoom reached (level ${MAX_ZOOM})`);
    } else {
      mapRef.current.zoomIn();
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const truncate = (s: string, n = 22) =>
    s.length > n ? `${s.slice(0, n)}\u2026` : s;

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div ref={mapContainerRef} className="map-container" />

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
                <MapPin size={14} style={{ color: "#1E73BE", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Current Location"
                  value={startInput}
                  onChange={(e) => handleStartInput(e.target.value)}
                  onFocus={() =>
                    startSuggestions.length > 0 && setShowStartSugg(true)
                  }
                  onBlur={() => setTimeout(() => setShowStartSugg(false), 150)}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "white", fontFamily: "Inter, sans-serif" }}
                />
                {startInput && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      setStartInput("");
                      setStartCoords(null);
                      setStartSuggestions([]);
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

            {/* Search button */}
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

      {/* Map Layer Toggle button */}
      <button
        type="button"
        onClick={() =>
          setMapMode((prev) => (prev === "satellite" ? "default" : "satellite"))
        }
        style={{
          position: "absolute",
          bottom: 88,
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

      {/* My Location button */}
      <button
        type="button"
        onClick={handleMyLocation}
        style={{
          position: "absolute",
          bottom: 24,
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
