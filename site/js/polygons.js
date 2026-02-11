// Polygon generation — replicates make_hotspot_polygons() from R code
// Uses Turf.js for convex hull, buffer, union operations

const BUFFER_DIST_KM = 0.1;      // 100 meters in km
const SMOOTH_FRAC = 0.5;          // smoothing distance as fraction of buffer

/**
 * Build hotspot polygons from clustered restaurant data.
 * Steps (matching R code):
 *   1. Filter out noise (cluster === 0)
 *   2. Convex hull per cluster
 *   3. Buffer by 100m
 *   4. Union overlapping polygons
 *   5. Smooth (buffer + un-buffer)
 *   6. Count restaurants per merged polygon
 *
 * @param {Object[]} clusteredRestaurants - Restaurants with `cluster`, `la`, `lo` fields
 * @returns {Object} GeoJSON FeatureCollection of hotspot polygons with `count` property
 */
function makeHotspotPolygons(clusteredRestaurants) {
  // 1. Filter to clustered points only (exclude noise)
  const clustered = clusteredRestaurants.filter(r => r.cluster > 0);
  if (clustered.length === 0) {
    return turf.featureCollection([]);
  }

  // Group by cluster ID
  const clusterGroups = {};
  for (const r of clustered) {
    if (!clusterGroups[r.cluster]) clusterGroups[r.cluster] = [];
    clusterGroups[r.cluster].push(r);
  }

  // 2. Create convex hull per cluster
  const bufferedHulls = [];
  for (const [clusterId, members] of Object.entries(clusterGroups)) {
    const points = members.map(r => turf.point([r.lo, r.la]));
    const fc = turf.featureCollection(points);

    let hull;
    if (members.length === 1) {
      // Single point: just use the point itself (buffer will make it a circle)
      hull = points[0];
    } else if (members.length === 2) {
      // Two points: create a line, buffer will make it a capsule
      hull = turf.lineString(members.map(r => [r.lo, r.la]));
    } else {
      hull = turf.convex(fc);
      if (!hull) {
        // Collinear points: fall back to line
        hull = turf.lineString(members.map(r => [r.lo, r.la]));
      }
    }

    // 3. Buffer by 100m
    try {
      const buffered = turf.buffer(hull, BUFFER_DIST_KM, { units: "kilometers" });
      if (buffered) {
        buffered.properties = { clusterId: parseInt(clusterId), count: members.length };
        bufferedHulls.push(buffered);
      }
    } catch (e) {
      // Skip clusters that fail to buffer
      console.warn("Buffer failed for cluster", clusterId, e);
    }
  }

  if (bufferedHulls.length === 0) {
    return turf.featureCollection([]);
  }

  // 4. Union overlapping polygons
  let merged;
  try {
    merged = unionPolygons(bufferedHulls);
  } catch (e) {
    console.warn("Union failed, using individual polygons:", e);
    merged = bufferedHulls;
  }

  // 5. Smooth: small positive buffer then negative buffer to round corners
  // Note: negative buffer may not be supported in all Turf versions,
  // so we fall back gracefully to just the positive buffer or the original polygon.
  const smoothDist = BUFFER_DIST_KM * SMOOTH_FRAC;
  const smoothed = [];
  for (const poly of merged) {
    try {
      const expanded = turf.buffer(poly, smoothDist, { units: "kilometers" });
      if (!expanded) {
        smoothed.push(poly);
        continue;
      }
      try {
        const contracted = turf.buffer(expanded, -smoothDist, { units: "kilometers" });
        smoothed.push(contracted || expanded);
      } catch (e2) {
        // Negative buffer not supported or failed — use expanded version
        smoothed.push(expanded);
      }
    } catch (e) {
      smoothed.push(poly);
    }
  }

  // 6. Count restaurants per merged polygon and determine dominant cluster
  const allPointsWithCluster = clustered.map(r => {
    const pt = turf.point([r.lo, r.la]);
    pt.properties = { cluster: r.cluster };
    return pt;
  });
  const allPointsFc = turf.featureCollection(allPointsWithCluster);

  const features = smoothed.map((poly, i) => {
    let count;
    let dominantCluster = poly.properties?.clusterId || 1;
    try {
      const within = turf.pointsWithinPolygon(allPointsFc, poly);
      count = within.features.length;
      // Find which cluster has the most points in this polygon
      const clusterCounts = {};
      for (const pt of within.features) {
        const cid = pt.properties.cluster;
        clusterCounts[cid] = (clusterCounts[cid] || 0) + 1;
      }
      let maxCount = 0;
      for (const [cid, cnt] of Object.entries(clusterCounts)) {
        if (cnt > maxCount) {
          maxCount = cnt;
          dominantCluster = parseInt(cid);
        }
      }
    } catch (e) {
      count = poly.properties?.count || 0;
    }
    return {
      ...poly,
      properties: {
        id: i + 1,
        count: count,
        clusterId: dominantCluster
      }
    };
  });

  return turf.featureCollection(features);
}

/**
 * Union an array of polygon features, merging overlapping ones.
 * Returns an array of individual polygon features.
 */
function unionPolygons(polygons) {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons;

  // Iteratively union all polygons
  let combined = polygons[0];
  for (let i = 1; i < polygons.length; i++) {
    try {
      const result = turf.union(turf.featureCollection([combined, polygons[i]]));
      if (result) {
        combined = result;
      }
    } catch (e) {
      // If union fails for a pair, skip and continue
      console.warn("Union step failed at index", i, e);
    }
  }

  // Explode multi-polygons into individual polygons
  const result = [];
  if (combined.geometry.type === "MultiPolygon") {
    for (const coords of combined.geometry.coordinates) {
      result.push(turf.polygon(coords));
    }
  } else if (combined.geometry.type === "Polygon") {
    result.push(combined);
  }

  return result;
}
