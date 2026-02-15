// Polygon generation — one polygon per DBSCAN cluster (no merging)
// Uses Turf.js for convex hull and buffer operations

const BUFFER_DIST_KM = 0.1;      // 100 meters in km
const SMOOTH_FRAC = 0.5;          // smoothing distance as fraction of buffer

/**
 * Build hotspot polygons from clustered restaurant data.
 * Each cluster gets its own polygon (no union/merging), preserving DBSCAN's
 * arbitrary-shape groupings even when clusters overlap.
 *
 * Steps:
 *   1. Filter out noise (cluster === 0)
 *   2. Convex hull per cluster
 *   3. Buffer by 100m
 *   4. Smooth (buffer + un-buffer)
 *   5. Attach count, clusterId, ntaName
 *
 * @param {Object[]} clusteredRestaurants - Restaurants with `cluster`, `la`, `lo` fields
 * @returns {Object} GeoJSON FeatureCollection of hotspot polygons
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

  const smoothDist = BUFFER_DIST_KM * SMOOTH_FRAC;
  const features = [];

  for (const [clusterId, members] of Object.entries(clusterGroups)) {
    const points = members.map(r => turf.point([r.lo, r.la]));
    const fc = turf.featureCollection(points);

    // 2. Create convex hull
    let hull;
    if (members.length === 1) {
      hull = points[0];
    } else if (members.length === 2) {
      hull = turf.lineString(members.map(r => [r.lo, r.la]));
    } else {
      hull = turf.convex(fc);
      if (!hull) {
        hull = turf.lineString(members.map(r => [r.lo, r.la]));
      }
    }

    // 3. Buffer by 100m
    let poly;
    try {
      poly = turf.buffer(hull, BUFFER_DIST_KM, { units: "kilometers" });
      if (!poly) continue;
    } catch (e) {
      console.warn("Buffer failed for cluster", clusterId, e);
      continue;
    }

    // 4. Smooth: small positive buffer then negative buffer to round corners
    try {
      const expanded = turf.buffer(poly, smoothDist, { units: "kilometers" });
      if (expanded) {
        try {
          const contracted = turf.buffer(expanded, -smoothDist, { units: "kilometers" });
          poly = contracted || expanded;
        } catch (e2) {
          poly = expanded;
        }
      }
    } catch (e) {
      // keep original poly
    }

    // 5. Determine NTA name from cluster members
    const ntaName = members.find(r => r.ntaName)?.ntaName || null;

    poly.properties = {
      id: parseInt(clusterId),
      count: members.length,
      clusterId: parseInt(clusterId),
      ntaName: ntaName
    };
    features.push(poly);
  }

  return turf.featureCollection(features);
}
