// Leaflet map setup and layer management

// Color palette matching R's brewer.pal("Set1") for cluster dots
const CLUSTER_COLORS = [
  "#E41A1C", "#377EB8", "#399136", "#984EA3", "#FF7F00",
   "#F781BF", "#66C2A5", "#FC8D62", "#8DA0CB", 
   "#FFFF33", "#A65628",
];

const NOISE_COLOR = "#AAAAAA";
const NOISE_OPACITY = 0.3;
const CLUSTER_OPACITY = 0.7;
const DOT_RADIUS = 5;

// YlOrRd color scale for polygon fill — light mode: pale yellow (low) → dark red (high)
const POLYGON_COLORS = [
  "#FFFFB2", "#FED976", "#FEB24C", "#FD8D3C",
  "#FC4E2A", "#E31A1C", "#B10026"
];
// Dark mode: dark red (low) → bright yellow-white (high)
const POLYGON_COLORS_DARK = [
  "#B10026", "#E31A1C", "#FC4E2A", "#FD8D3C",
  "#FEB24C", "#FED976", "#FFFFB2"
];
const POLYGON_OPACITY = 0.5;

// Radial animation origin — Herald Square, used for the "rain" entrance effect
const HERALD_SQ = { lat: 40.7487, lng: -73.9882 };

const SUBWAY_COLOR = "#7f7f7f";
const SUBWAY_COLOR_DARK = "#888888";

const TILE_URL_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_URL_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

let map;
let tileLayer = null;
let dotsLayer = null;
let polygonLayer = null;
let subwayLayer = null;
let showDots = true;
let showPolygons = true;
let showSubway = true;
let subwayRetractTimer = null;

/**
 * Initialize the Leaflet map.
 */
function initMap() {
  map = L.map("map", {
    center: [40.7128, -73.96],
    zoom: 11,
    zoomControl: true
  });

  // Custom pane for restaurant dots — sits above the default overlayPane (z 400)
  // so dots always render on top of hotspot polygons regardless of add order.
  map.createPane('dotsPane');
  map.getPane('dotsPane').style.zIndex = 450;

  const dark = document.documentElement.dataset.theme === "dark";
  tileLayer = L.tileLayer(dark ? TILE_URL_DARK : TILE_URL_LIGHT, {
    attribution: TILE_ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);
}

/**
 * Swap the basemap tile layer when toggling dark/light mode.
 */
function setMapTheme(dark) {
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(dark ? TILE_URL_DARK : TILE_URL_LIGHT, {
    attribution: TILE_ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);
  if (subwayLayer) subwayLayer.bringToBack();
}

/**
 * Get a color for a cluster ID.
 */
function getClusterColor(clusterId) {
  if (clusterId === 0) return NOISE_COLOR;
  const color = CLUSTER_COLORS[(clusterId - 1) % CLUSTER_COLORS.length];
  // Yellow (#FFFF33) is invisible on white — swap for amber in light mode
  if (color === '#FFFF33' && document.documentElement.dataset.theme !== 'dark') {
    return '#C9A500';
  }
  return color;
}

/**
 * Interpolate into the YlOrRd palette based on a 0-1 value.
 * Uses the dark palette when dark mode is active.
 */
function getPolygonColor(value) {
  const dark = document.documentElement.dataset.theme === "dark";
  const palette = dark ? POLYGON_COLORS_DARK : POLYGON_COLORS;
  const idx = Math.min(Math.floor(value * palette.length), palette.length - 1);
  return palette[idx];
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
      opacity: opacity,
      pane: 'dotsPane'
    });

    // Hover: scale dot up and reveal nameplate
    marker.on('mouseover', function () {
      this.setRadius(DOT_RADIUS * 1.7);
      this.setStyle({ weight: 1.5 });
    });
    marker.on('mouseout', function () {
      this.setRadius(DOT_RADIUS);
      this.setStyle({ weight: 0.5 });
    });

    // Nameplate tooltip on hover
    marker.bindTooltip(r.n, {
      permanent: false,
      direction: 'top',
      className: 'dot-nameplate',
      offset: [0, -3]
    });

    // Ripple ring on click — expands outward from the tapped dot
    marker.on('click', function () {
      const rippleIcon = L.divIcon({
        className: '',
        html: `<div class="ripple-ring" style="border-color:${color}"></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      const ring = L.marker(marker.getLatLng(), { icon: rippleIcon, interactive: false }).addTo(map);
      setTimeout(() => map.removeLayer(ring), 700);
    });

    // Custom popup
    let label;
    if (r.cluster === 0) {
      label = "Unclustered";
    } else {
      label = r.ntaName ? `Cluster ${r.cluster} — ${r.ntaName}` : `Cluster ${r.cluster}`;
    }
    const cuisineTag = r.cu ? `<span class="rp-tag rp-cuisine">${r.cu}</span>` : '';
    const clusterOnclick = r.cluster !== 0 ? ` onclick="focusCluster(${r.cluster})"` : '';
    const clusterTag = `<span class="rp-tag rp-cluster" style="background:${color}22;color:${color}"${clusterOnclick}>${label}</span>`;
    const popupHtml =
      `<div class="rp-inner">` +
        `<div class="rp-accent" style="background:${color}"></div>` +
        `<div class="rp-body">` +
          `<div class="rp-name">${r.n}</div>` +
          `<div class="rp-tags">${cuisineTag}${clusterTag}</div>` +
        `</div>` +
      `</div>`;
    marker.bindPopup(popupHtml, { className: 'restaurant-popup-wrap', maxWidth: 260 });

    markers.push(marker);
  }

  dotsLayer = L.layerGroup(markers);
  if (showDots) {
    dotsLayer.addTo(map);
    rainDotsIn(dotsLayer.getLayers());
  }
}

/**
 * Staggered north→south dot entrance — each dot scales up from 0 and fades in
 * with a delay proportional to its latitude rank. Respects prefers-reduced-motion.
 */
function rainDotsIn(layers) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Sort by distance from Herald Square — closest appears first
  const sorted = layers.slice().sort(function (a, b) {
    const la = a.getLatLng(), lb = b.getLatLng();
    const da = Math.hypot(la.lat - HERALD_SQ.lat, la.lng - HERALD_SQ.lng);
    const db = Math.hypot(lb.lat - HERALD_SQ.lat, lb.lng - HERALD_SQ.lng);
    return da - db;
  });

  const count = sorted.length;
  const totalSpread = 900; // ms between first and last dot starting

  sorted.forEach(function (layer, i) {
    const path = layer._path;
    if (!path) return;

    const delay = (i / count) * totalSpread;

    path.style.transformBox = 'fill-box';
    path.style.transformOrigin = 'center';
    path.style.transform = 'scale(0)';
    path.style.opacity = '0';
    path.style.transition =
      `opacity 0.35s ease-out ${delay}ms, ` +
      `transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`;

    // Double rAF ensures the browser paints the hidden state before transitioning
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        path.style.transform = 'scale(1)';
        path.style.opacity = '';
      });
    });
  });
}

/**
 * Staggered radial entrance for hotspot polygons, expanding outward from Herald Square.
 * Each polygon scales up from its own centroid with a delay proportional to its distance.
 * Respects prefers-reduced-motion.
 */
function rainPolygonsIn(geoJsonLayer) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layers = [];
  geoJsonLayer.eachLayer(function (layer) { layers.push(layer); });

  const sorted = layers.slice().sort(function (a, b) {
    const ca = a.getBounds().getCenter(), cb = b.getBounds().getCenter();
    const da = Math.hypot(ca.lat - HERALD_SQ.lat, ca.lng - HERALD_SQ.lng);
    const db = Math.hypot(cb.lat - HERALD_SQ.lat, cb.lng - HERALD_SQ.lng);
    return da - db;
  });

  const count = sorted.length;
  const totalSpread = 900;

  sorted.forEach(function (layer, i) {
    const path = layer._path;
    if (!path) return;

    const delay = (i / count) * totalSpread;

    path.style.transformBox = 'fill-box';
    path.style.transformOrigin = 'center';
    path.style.transform = 'scale(0)';
    path.style.opacity = '0';
    path.style.transition =
      `opacity 0.45s ease-out ${delay}ms, ` +
      `transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`;

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        path.style.transform = 'scale(1)';
        path.style.opacity = '';
      });
    });
  });
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
    const fillColor = getPolygonColor(normalized);
    const dark = document.documentElement.dataset.theme === "dark";
    return {
      fillColor: fillColor,
      fillOpacity: POLYGON_OPACITY,
      color: dark ? fillColor : "#E31A1C",
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
      const clusterId = feature.properties.clusterId || 1;
      const accentColor = getClusterColor(clusterId);
      const title = ntaName ? ntaName : "Hotspot Region";
      const countTag = `<span class="rp-tag rp-cuisine">${count} restaurant${count !== 1 ? 's' : ''}</span>`;
      const popupHtml =
        `<div class="rp-inner">` +
          `<div class="rp-accent" style="background:${accentColor}"></div>` +
          `<div class="rp-body">` +
            `<div class="rp-name">${title}</div>` +
            `<div class="rp-tags">${countTag}</div>` +
          `</div>` +
        `</div>`;
      // Ripple ring on click
      layer.on('click', function () {
        const rippleIcon = L.divIcon({
          className: '',
          html: `<div class="ripple-ring-lg" style="border-color:${accentColor}"></div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });
        const ring = L.marker(layer.getBounds().getCenter(), { icon: rippleIcon, interactive: false }).addTo(map);
        setTimeout(() => map.removeLayer(ring), 850);
      });
      layer.bindPopup(popupHtml, { className: 'restaurant-popup-wrap', maxWidth: 260 });
    }
  });

  if (showPolygons) {
    polygonLayer.addTo(map);
    rainPolygonsIn(polygonLayer);
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
 * Flatten MultiLineString features into individual LineString features so that
 * each segment gets its own SVG <path> element and the draw-on animation works
 * correctly for every line (including SIR and Rockaway branches).
 */
function flattenMultiLineStrings(geojson) {
  const features = [];
  for (const f of geojson.features) {
    if (f.geometry && f.geometry.type === 'MultiLineString') {
      for (const coords of f.geometry.coordinates) {
        features.push({
          type: 'Feature',
          properties: f.properties,
          geometry: { type: 'LineString', coordinates: coords }
        });
      }
    } else {
      features.push(f);
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Initialize the subway lines layer from a GeoJSON FeatureCollection.
 * The layer is added to the map only if the toggle is on, and always
 * kept behind restaurant layers via bringToBack().
 */
function initSubwayLayer(geojson) {
  geojson = flattenMultiLineStrings(geojson);
  const dark = document.documentElement.dataset.theme === "dark";
  subwayLayer = L.geoJSON(geojson, {
    style: {
      color: dark ? SUBWAY_COLOR_DARK : SUBWAY_COLOR,
      weight: 1.5,
      opacity: 0.7
    }
  });

  if (showSubway) {
    subwayLayer.addTo(map);
    subwayLayer.bringToBack();
    animateSubwayDraw();
  }
}

/**
 * Toggle subway layer visibility.
 */
function toggleSubway(visible) {
  showSubway = visible;
  if (subwayLayer) {
    if (visible) {
      // Cancel any in-progress retract and snap paths back to clean state
      if (subwayRetractTimer !== null) {
        clearTimeout(subwayRetractTimer);
        subwayRetractTimer = null;
        subwayLayer.eachLayer(function (layer) {
          if (layer._path) {
            layer._path.style.transition = 'none';
            layer._path.style.strokeDasharray = '';
            layer._path.style.strokeDashoffset = '';
          }
        });
      }
      if (!map.hasLayer(subwayLayer)) {
        subwayLayer.addTo(map);
        subwayLayer.bringToBack();
      }
      animateSubwayDraw();
    } else {
      subwayRetractTimer = animateSubwayRetract(function () {
        subwayRetractTimer = null;
        map.removeLayer(subwayLayer);
      });
    }
  }
}

/**
 * Draw-on animation for subway lines: stroke traces from dashoffset=len → 0.
 * Replays every time the layer is toggled on.
 */
function animateSubwayDraw() {
  subwayLayer.eachLayer(function (layer) {
    const path = layer._path;
    if (path && path.getTotalLength) {
      const len = path.getTotalLength();
      path.style.transition = 'none';
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(function () {
        path.style.transition = 'stroke-dashoffset 1.2s ease-out';
        path.style.strokeDashoffset = '0';
      });
      // Clear dash properties after animation so zoom in Firefox doesn't
      // produce missing segments (dasharray measured at original scale becomes wrong)
      setTimeout(function () {
        path.style.transition = 'none';
        path.style.strokeDasharray = '';
        path.style.strokeDashoffset = '';
      }, 1350);
    }
  });
}

/**
 * Retract animation for subway lines: stroke traces from 0 → dashoffset=len,
 * then calls callback (to remove the layer) once complete.
 */
function animateSubwayRetract(callback) {
  const duration = 1000;
  subwayLayer.eachLayer(function (layer) {
    const path = layer._path;
    if (path && path.getTotalLength) {
      const len = path.getTotalLength();
      // Establish fully-drawn dash state with no transition, then animate back
      path.style.transition = 'none';
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = '0';
      requestAnimationFrame(function () {
        path.style.transition = `stroke-dashoffset ${duration}ms ease-in`;
        path.style.strokeDashoffset = len;
      });
    }
  });
  return setTimeout(callback, duration + 50);
}

/**
 * Close any open popup and open the hotspot polygon popup for the given cluster.
 * Called when the user clicks the cluster tag in a restaurant popup.
 */
function focusCluster(clusterId) {
  map.closePopup();
  if (!polygonLayer) return;
  polygonLayer.eachLayer(function (layer) {
    if (layer.feature && layer.feature.properties.clusterId === clusterId) {
      layer.openPopup(layer.getBounds().getCenter());
    }
  });
}

/**
 * Re-color subway lines to match the current theme.
 * Called when toggling dark/light mode.
 */
function restyleSubway() {
  if (!subwayLayer) return;
  const dark = document.documentElement.dataset.theme === "dark";
  subwayLayer.setStyle({ color: dark ? SUBWAY_COLOR_DARK : SUBWAY_COLOR });
}
