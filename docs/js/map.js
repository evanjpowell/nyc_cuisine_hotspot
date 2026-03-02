// Leaflet map setup and layer management

// Color palette matching R's brewer.pal("Set1") for cluster dots
const CLUSTER_COLORS = [
  "#E41A1C", "#377EB8", "#4DAF4A", "#984EA3", "#FF7F00",
  "#FFFF33", "#A65628", "#F781BF", "#999999", "#66C2A5",
  "#FC8D62", "#8DA0CB"
];

const NOISE_COLOR = "#AAAAAA";
const NOISE_OPACITY = 0.3;
const CLUSTER_OPACITY = 0.7;
const DOT_RADIUS = 5;

// YlOrRd color scale for polygon fill (matching R's sequential palette)
const POLYGON_COLORS = [
  "#FFFFB2", "#FED976", "#FEB24C", "#FD8D3C",
  "#FC4E2A", "#E31A1C", "#B10026"
];
const POLYGON_OPACITY = 0.5;

const SUBWAY_COLOR = "#7f7f7f";

let map;
let dotsLayer = null;
let polygonLayer = null;
let subwayLayer = null;
let showDots = true;
let showPolygons = true;
let showSubway = false;

/**
 * Initialize the Leaflet map.
 */
function initMap() {
  map = L.map("map", {
    center: [40.7128, -73.96],
    zoom: 11,
    zoomControl: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);
}

/**
 * Get a color for a cluster ID.
 */
function getClusterColor(clusterId) {
  if (clusterId === 0) return NOISE_COLOR;
  return CLUSTER_COLORS[(clusterId - 1) % CLUSTER_COLORS.length];
}

/**
 * Interpolate into the YlOrRd palette based on a 0-1 value.
 */
function getPolygonColor(value) {
  const idx = Math.min(
    Math.floor(value * POLYGON_COLORS.length),
    POLYGON_COLORS.length - 1
  );
  return POLYGON_COLORS[idx];
}

/**
 * Update the dots layer on the map.
 * @param {Object[]} restaurants - Clustered restaurant data with cluster, la, lo, n fields
 */
function updateDotsLayer(restaurants) {
  if (dotsLayer) {
    map.removeLayer(dotsLayer);
    dotsLayer = null;
  }

  const markers = [];
  for (const r of restaurants) {
    const color = getClusterColor(r.cluster);
    const opacity = r.cluster === 0 ? NOISE_OPACITY : CLUSTER_OPACITY;
    const marker = L.circleMarker([r.la, r.lo], {
      radius: DOT_RADIUS,
      fillColor: color,
      fillOpacity: opacity,
      color: color,
      weight: 0.5,
      opacity: opacity
    });
    let label;
    if (r.cluster === 0) {
      label = "Not in a cluster";
    } else {
      label = r.ntaName ? `Cluster ${r.cluster} (${r.ntaName})` : `Cluster ${r.cluster}`;
    }
    const cuisineInfo = r.cu ? `<br><em>${r.cu}</em>` : "";
    marker.bindPopup(`<strong>${r.n}</strong>${cuisineInfo}<br>${label}`);
    markers.push(marker);
  }

  dotsLayer = L.layerGroup(markers);
  if (showDots) {
    dotsLayer.addTo(map);
  }
}

/**
 * Get the style for a polygon feature based on current layer visibility.
 * When both dots and polygons are visible, use cluster colors to match dots.
 * When only polygons are visible, use the YlOrRd heat scale by restaurant count.
 */
function getPolygonStyle(feature, maxCount) {
  const count = feature.properties.count || 0;
  const clusterId = feature.properties.clusterId || 1;

  if (showDots) {
    // Match cluster dot colors
    const clusterColor = getClusterColor(clusterId);
    return {
      fillColor: clusterColor,
      fillOpacity: POLYGON_OPACITY,
      color: clusterColor,
      weight: 1.5,
      opacity: 0.7
    };
  } else {
    // Heat-map style by restaurant count
    const normalized = maxCount > 0 ? count / maxCount : 0;
    return {
      fillColor: getPolygonColor(normalized),
      fillOpacity: POLYGON_OPACITY,
      color: "#E31A1C",
      weight: 1.5,
      opacity: 0.7
    };
  }
}

/** Cached geojson for re-styling when toggling layers */
let currentPolygonGeojson = null;

/**
 * Update the polygon layer on the map.
 * @param {Object} geojson - GeoJSON FeatureCollection of hotspot polygons
 */
function updatePolygonLayer(geojson) {
  if (polygonLayer) {
    map.removeLayer(polygonLayer);
    polygonLayer = null;
  }

  currentPolygonGeojson = geojson;

  if (!geojson || !geojson.features || geojson.features.length === 0) return;

  // Find max count for color scaling
  const maxCount = Math.max(...geojson.features.map(f => f.properties.count || 0));

  polygonLayer = L.geoJSON(geojson, {
    style: function (feature) {
      return getPolygonStyle(feature, maxCount);
    },
    onEachFeature: function (feature, layer) {
      const count = feature.properties.count || 0;
      const ntaName = feature.properties.ntaName;
      const title = ntaName ? `Hotspot — ${ntaName}` : "Hotspot Region";
      layer.bindPopup(`<strong>${title}</strong><br>${count} restaurants`);
    }
  });

  if (showPolygons) {
    polygonLayer.addTo(map);
  }
}

/**
 * Re-style polygon layer (e.g. when dot visibility changes).
 */
function restylePolygons() {
  if (!polygonLayer || !currentPolygonGeojson) return;
  const maxCount = Math.max(...currentPolygonGeojson.features.map(f => f.properties.count || 0));
  polygonLayer.eachLayer(function (layer) {
    if (layer.feature) {
      layer.setStyle(getPolygonStyle(layer.feature, maxCount));
    }
  });
}

/**
 * Fit the map view to show all restaurants.
 */
function fitMapToData(restaurants) {
  if (restaurants.length === 0) return;
  const bounds = L.latLngBounds(restaurants.map(r => [r.la, r.lo]));
  map.fitBounds(bounds, { padding: [30, 30] });
}

/**
 * Toggle dots layer visibility.
 */
function toggleDots(visible) {
  showDots = visible;
  if (dotsLayer) {
    if (visible) {
      dotsLayer.addTo(map);
    } else {
      map.removeLayer(dotsLayer);
    }
  }
  // Re-style polygons since their color depends on whether dots are visible
  restylePolygons();
}

/**
 * Toggle polygon layer visibility.
 */
function togglePolygons(visible) {
  showPolygons = visible;
  if (polygonLayer) {
    if (visible) {
      polygonLayer.addTo(map);
    } else {
      map.removeLayer(polygonLayer);
    }
  }
}

/**
 * Initialize the subway lines layer from a GeoJSON FeatureCollection.
 * The layer is added to the map only if the toggle is on, and always
 * kept behind restaurant layers via bringToBack().
 */
function initSubwayLayer(geojson) {
  subwayLayer = L.geoJSON(geojson, {
    style: {
      color: SUBWAY_COLOR,
      weight: 1.5,
      opacity: 0.7
    }
  });

  if (showSubway) {
    subwayLayer.addTo(map);
    subwayLayer.bringToBack();
  }
}

/**
 * Toggle subway layer visibility.
 */
function toggleSubway(visible) {
  showSubway = visible;
  if (subwayLayer) {
    if (visible) {
      subwayLayer.addTo(map);
      subwayLayer.bringToBack();
    } else {
      map.removeLayer(subwayLayer);
    }
  }
}
