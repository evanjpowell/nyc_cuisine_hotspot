// Clustering analysis — computes diffusion scores for all cuisines
// Replicates calc_cluster_concentration() from R code

/**
 * Compute clustering concentration metrics for a set of clustered restaurants.
 * Mirrors the R function calc_cluster_concentration().
 *
 * @param {Object[]} clusteredData - Restaurants with `cluster` field (0 = noise)
 * @returns {Object} { pctClustered, largestShare, diffusion, nClusters, pctNoise }
 */
function calcConcentration(clusteredData) {
  const N = clusteredData.length;
  if (N === 0) {
    return { pctClustered: 0, largestShare: 0, diffusion: 1, nClusters: 0, pctNoise: 1 };
  }

  let noiseCount = 0;
  const clusterCounts = {};

  for (const r of clusteredData) {
    if (r.cluster === 0) {
      noiseCount++;
    } else {
      clusterCounts[r.cluster] = (clusterCounts[r.cluster] || 0) + 1;
    }
  }

  const clusterSizes = Object.values(clusterCounts);
  const nClusters = clusterSizes.length;
  const clusteredCount = N - noiseCount;
  const pctClustered = clusteredCount / N;
  const largestShare = nClusters > 0 ? Math.max(...clusterSizes) / N : 0;

  // Shannon entropy (normalized), including noise as its own bin
  const bins = [...clusterSizes];
  if (noiseCount > 0) bins.push(noiseCount);

  let H = 0;
  for (const b of bins) {
    const p = b / N;
    if (p > 0) H -= p * Math.log(p);
  }
  const m = bins.length;
  const Hn = m <= 1 ? 0 : H / Math.log(m);

  return {
    pctClustered,
    largestShare,
    diffusion: Hn,
    nClusters,
    pctNoise: noiseCount / N
  };
}

/**
 * Run DBSCAN for every cuisine and compute diffusion scores.
 * Uses the same borough-aware clustering as the main pipeline with default multipliers.
 *
 * @param {Object[]} allRestaurants - Full restaurant dataset
 * @param {Object[]} cuisineList - Array of { name, count }
 * @returns {Object[]} Array of { cuisine, count, pctClustered, nClusters, largestShare, diffusion }
 */
function computeAllDiffusionScores(allRestaurants, cuisineList) {
  const results = [];
  for (const c of cuisineList) {
    const cuisineData = allRestaurants.filter(r => r.cu === c.name);
    if (cuisineData.length === 0) continue;

    // Run clustering with default multipliers (1.0)
    const { restaurants: clustered } = runBoroughClustering(cuisineData, 1.0, 1.0);
    const metrics = calcConcentration(clustered);

    results.push({
      cuisine: c.name,
      count: cuisineData.length,
      pctClustered: metrics.pctClustered,
      nClusters: metrics.nClusters,
      largestShare: metrics.largestShare,
      diffusion: metrics.diffusion
    });
  }
  return results;
}

// --- Modal UI ---

let analysisData = null;
let currentSort = { col: "diffusion", asc: true };

function initAnalysisModal() {
  const link = document.getElementById("analysis-link");
  const overlay = document.getElementById("analysis-overlay");
  const closeBtn = document.getElementById("analysis-close");

  link.addEventListener("click", function (e) {
    e.preventDefault();
    overlay.style.display = "flex";
    if (!analysisData) {
      runAnalysis();
    }
  });

  closeBtn.addEventListener("click", function () {
    overlay.style.display = "none";
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      overlay.style.display = "none";
    }
  });

  // Sortable headers
  const headers = document.querySelectorAll("#analysis-table th");
  for (const th of headers) {
    th.addEventListener("click", function () {
      const col = this.dataset.col;
      if (currentSort.col === col) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.col = col;
        currentSort.asc = col === "cuisine"; // alpha ascending by default, numeric descending
      }
      // Update header indicators
      for (const h of headers) h.classList.remove("sort-asc", "sort-desc");
      this.classList.add(currentSort.asc ? "sort-asc" : "sort-desc");
      renderAnalysisTable();
    });
  }
}

function initDBSCANModal() {
  const link = document.getElementById("dbscan-link");
  const overlay = document.getElementById("dbscan-overlay");
  const closeBtn = document.getElementById("dbscan-close");

  link.addEventListener("click", function (e) {
    e.preventDefault();
    overlay.style.display = "flex";
  });

  closeBtn.addEventListener("click", function () {
    overlay.style.display = "none";
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      overlay.style.display = "none";
    }
  });
}

function initEpsModal() {
  const link = document.getElementById("eps-link");
  const overlay = document.getElementById("eps-overlay");
  const closeBtn = document.getElementById("eps-close");

  link.addEventListener("click", function (e) {
    e.preventDefault();
    overlay.style.display = "flex";
  });

  closeBtn.addEventListener("click", function () {
    overlay.style.display = "none";
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      overlay.style.display = "none";
    }
  });
}

function initMinptsModal() {
  const link = document.getElementById("minpts-link");
  const overlay = document.getElementById("minpts-overlay");
  const closeBtn = document.getElementById("minpts-close");

  link.addEventListener("click", function (e) {
    e.preventDefault();
    overlay.style.display = "flex";
  });

  closeBtn.addEventListener("click", function () {
    overlay.style.display = "none";
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      overlay.style.display = "none";
    }
  });
}

function runAnalysis() {
  const status = document.getElementById("analysis-status");
  status.textContent = "Computing diffusion scores for all cuisines...";

  // Use rAF + setTimeout to let the status message render before blocking
  requestAnimationFrame(() => {
    setTimeout(() => {
      analysisData = computeAllDiffusionScores(allRestaurants, cuisineList);
      status.textContent = "Click a column header to sort.";
      renderAnalysisTable();
    }, 10);
  });
}

function renderAnalysisTable() {
  if (!analysisData) return;

  const sorted = [...analysisData];
  const col = currentSort.col;
  const dir = currentSort.asc ? 1 : -1;

  sorted.sort((a, b) => {
    const av = a[col], bv = b[col];
    if (typeof av === "string") return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });

  const tbody = document.getElementById("analysis-tbody");
  tbody.innerHTML = "";

  for (const row of sorted) {
    const tr = document.createElement("tr");

    // Color the diffusion cell
    const diffColor = diffusionToColor(row.diffusion);

    tr.innerHTML =
      `<td>${row.cuisine}</td>` +
      `<td>${row.count}</td>` +
      `<td>${(row.pctClustered * 100).toFixed(1)}%</td>` +
      `<td>${row.nClusters}</td>` +
      `<td>${(row.largestShare * 100).toFixed(1)}%</td>` +
      `<td style="background:${diffColor};font-weight:600">${row.diffusion.toFixed(3)}</td>`;

    tbody.appendChild(tr);
  }
}

/**
 * Map a diffusion score (0-1) to a color from green (concentrated) to yellow to red (diffuse).
 */
function diffusionToColor(value) {
  // Clamp
  const v = Math.max(0, Math.min(1, value));
  // Green (low diffusion / concentrated) -> Yellow -> Red (high diffusion / spread out)
  const r = Math.round(v < 0.5 ? v * 2 * 255 : 255);
  const g = Math.round(v < 0.5 ? 255 : (1 - v) * 2 * 255);
  return `rgba(${r}, ${g}, 60, 0.3)`;
}
