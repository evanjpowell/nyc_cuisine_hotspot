// Borough-aware DBSCAN clustering — replicates run_dbscan_by_borough() from R code

const BASE_EPS = {
  "Manhattan": 350,
  "Brooklyn/Queens": 650,
  "Bronx": 600,
  "Staten Island": 700
};

const MIN_FLOOR = 4;
const PROP_FACTOR = 0.015;

/**
 * Map a boro name to its group key.
 */
function getBoroughGroup(boro) {
  if (boro === "Manhattan") return "Manhattan";
  if (boro === "Brooklyn" || boro === "Queens") return "Brooklyn/Queens";
  if (boro === "Bronx") return "Bronx";
  if (boro === "Staten Island") return "Staten Island";
  return "Other";
}

/**
 * Run borough-aware DBSCAN on restaurants of a single cuisine.
 *
 * @param {Object[]} restaurants - Array of restaurant objects with fields: lo, la, b (boro), n (name), c (camis)
 * @param {number} epsMultiplier - Slider multiplier for eps (1.0 = defaults)
 * @param {number} minPtsMultiplier - Slider multiplier for minPts (1.0 = defaults)
 * @returns {{ restaurants: Object[], params: Object }} Restaurants with `cluster` field added, plus params info
 */
function runBoroughClustering(restaurants, epsMultiplier, minPtsMultiplier) {
  const totalCount = restaurants.length;
  const baseMinPts = Math.max(MIN_FLOOR, Math.round(totalCount * PROP_FACTOR));
  const adjustedMinPts = Math.max(MIN_FLOOR, Math.round(baseMinPts * minPtsMultiplier));

  // Group restaurants by borough
  const groups = {};
  for (const r of restaurants) {
    const grp = getBoroughGroup(r.b);
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(r);
  }

  let clusterOffset = 0;
  const allResults = [];

  for (const grp of Object.keys(groups)) {
    const subset = groups[grp];
    const baseEps = BASE_EPS[grp] || 500; // fallback for "Other"
    const eps = baseEps * epsMultiplier;

    // Project all points to meters
    const projected = subset.map(r => projectToMeters(r.lo, r.la));

    // Run DBSCAN
    const labels = dbscan(projected, eps, adjustedMinPts);

    // Offset cluster IDs and attach to restaurants
    for (let i = 0; i < subset.length; i++) {
      const cluster = labels[i] === 0 ? 0 : labels[i] + clusterOffset;
      allResults.push({
        ...subset[i],
        cluster: cluster
      });
    }

    // Update offset: find max cluster ID in this group
    let maxLabel = 0;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] > maxLabel) maxLabel = labels[i];
    }
    if (maxLabel > 0) {
      clusterOffset += maxLabel;
    }
  }

  // Count clusters
  const clusterIds = new Set(allResults.map(r => r.cluster).filter(c => c > 0));

  return {
    restaurants: allResults,
    params: {
      totalCount,
      baseMinPts,
      adjustedMinPts,
      epsMultiplier,
      minPtsMultiplier,
      numClusters: clusterIds.size,
      epsValues: Object.fromEntries(
        Object.entries(BASE_EPS).map(([k, v]) => [k, Math.round(v * epsMultiplier)])
      )
    }
  };
}
