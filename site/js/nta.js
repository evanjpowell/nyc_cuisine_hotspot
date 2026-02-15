// NTA (Neighborhood Tabulation Area) lookup — maps cluster centroids to neighborhood names

let ntaFeatures = [];

/**
 * Load and store NTA boundary data.
 * @param {Object} geojson - GeoJSON FeatureCollection of NTA polygons with `ntaname` property
 */
function loadNTAData(geojson) {
  ntaFeatures = geojson.features || [];
}

/**
 * Find the NTA name for a given [lng, lat] point.
 * Uses Turf.js booleanPointInPolygon for hit-testing.
 *
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @returns {string|null} The NTAName, or null if not found
 */
function getNTAName(lng, lat) {
  const pt = turf.point([lng, lat]);
  for (const feature of ntaFeatures) {
    try {
      if (turf.booleanPointInPolygon(pt, feature)) {
        return feature.properties.ntaname;
      }
    } catch (e) {
      // Skip features with invalid geometry
    }
  }
  return null;
}

/**
 * Assign NTA names to clustered restaurants based on each cluster's centroid.
 * Adds `ntaName` property to every restaurant in the array (same for all members of a cluster).
 *
 * @param {Object[]} clusteredRestaurants - Restaurants with `cluster`, `la`, `lo` fields
 * @returns {Object[]} Same array with `ntaName` added to each restaurant
 */
function assignNTANames(clusteredRestaurants) {
  // Group by cluster to compute centroids
  const clusterGroups = {};
  for (const r of clusteredRestaurants) {
    if (r.cluster === 0) continue; // skip noise
    if (!clusterGroups[r.cluster]) clusterGroups[r.cluster] = [];
    clusterGroups[r.cluster].push(r);
  }

  // Compute centroid and look up NTA for each cluster
  const clusterNTA = {};
  for (const [clusterId, members] of Object.entries(clusterGroups)) {
    const avgLng = members.reduce((s, r) => s + r.lo, 0) / members.length;
    const avgLat = members.reduce((s, r) => s + r.la, 0) / members.length;
    const ntaName = getNTAName(avgLng, avgLat);
    clusterNTA[clusterId] = ntaName;
  }

  // Attach NTA name to every restaurant
  for (const r of clusteredRestaurants) {
    if (r.cluster === 0) {
      r.ntaName = null;
    } else {
      r.ntaName = clusterNTA[r.cluster] || null;
    }
  }

  return clusteredRestaurants;
}
