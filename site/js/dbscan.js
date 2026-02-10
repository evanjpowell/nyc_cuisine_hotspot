// Core DBSCAN algorithm operating on flat [x, y] coordinates (meters).
// Matches R's dbscan::dbscan() with Euclidean distance.

/**
 * Run DBSCAN on an array of [x, y] points.
 * @param {number[][]} points - Array of [x, y] coordinates in meters
 * @param {number} eps - Neighborhood radius in meters
 * @param {number} minPts - Minimum points to form a dense region
 * @returns {number[]} Cluster labels (0 = noise, 1+ = cluster ID)
 */
function dbscan(points, eps, minPts) {
  const n = points.length;
  const labels = new Int32Array(n); // 0 = unvisited initially
  const NOISE = -1;
  const UNVISITED = 0;
  let clusterId = 0;

  // Pre-compute squared eps to avoid sqrt in distance checks
  const eps2 = eps * eps;

  function rangeQuery(idx) {
    const neighbors = [];
    const px = points[idx][0];
    const py = points[idx][1];
    for (let i = 0; i < n; i++) {
      const dx = points[i][0] - px;
      const dy = points[i][1] - py;
      if (dx * dx + dy * dy <= eps2) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;

    const neighbors = rangeQuery(i);

    if (neighbors.length < minPts) {
      labels[i] = NOISE;
      continue;
    }

    clusterId++;
    labels[i] = clusterId;

    // Use a queue for BFS expansion
    const queue = [];
    for (const nb of neighbors) {
      if (nb !== i) queue.push(nb);
    }

    let qi = 0;
    while (qi < queue.length) {
      const q = queue[qi++];

      if (labels[q] === NOISE) {
        // Border point: was noise, now belongs to this cluster
        labels[q] = clusterId;
        continue;
      }

      if (labels[q] !== UNVISITED) continue;

      labels[q] = clusterId;

      const qNeighbors = rangeQuery(q);
      if (qNeighbors.length >= minPts) {
        for (const nb of qNeighbors) {
          if (labels[nb] <= 0) { // UNVISITED or NOISE
            queue.push(nb);
          }
        }
      }
    }
  }

  // Convert NOISE from -1 to 0 to match R convention
  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = labels[i] === NOISE ? 0 : labels[i];
  }

  return result;
}
