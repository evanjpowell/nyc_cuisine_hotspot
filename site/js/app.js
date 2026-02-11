// Main application — UI handlers, data loading, pipeline orchestration

let allRestaurants = [];
let cuisineList = [];
let currentCuisine = null;
let currentEpsMultiplier = 1.0;
let currentMinPtsMultiplier = 1.0;
let debounceTimer = null;

/**
 * Load data files and initialize the application.
 */
async function init() {
  showLoading(true);

  try {
    // Load all data files in parallel
    const [cuisineRes, restaurantRes, ntaRes] = await Promise.all([
      fetch("data/cuisines.json"),
      fetch("data/restaurants.json"),
      fetch("data/nta.geojson")
    ]);

    cuisineList = await cuisineRes.json();
    allRestaurants = await restaurantRes.json();
    const ntaData = await ntaRes.json();
    loadNTAData(ntaData);

    // Populate the cuisine dropdown
    const select = document.getElementById("cuisine-select");
    select.innerHTML = ""; // remove "Loading..." placeholder
    for (const c of cuisineList) {
      const option = document.createElement("option");
      option.value = c.name;
      option.textContent = `${c.name} (${c.count})`;
      select.appendChild(option);
    }

    // Initialize map
    initMap();

    // Set up event listeners
    select.addEventListener("change", onCuisineChange);

    document.getElementById("eps-slider").addEventListener("input", onEpsSliderInput);
    document.getElementById("minpts-slider").addEventListener("input", onMinPtsSliderInput);

    document.getElementById("toggle-dots").addEventListener("change", function () {
      toggleDots(this.checked);
    });

    document.getElementById("toggle-polygons").addEventListener("change", function () {
      togglePolygons(this.checked);
    });

    // Auto-select first cuisine — runPipeline handles its own loading state
    showLoading(false);
    if (cuisineList.length > 0) {
      select.value = cuisineList[0].name;
      onCuisineChange();
    }
  } catch (e) {
    console.error("Failed to initialize:", e);
    showLoading(false);
    showError("Failed to load data. Please try refreshing the page.");
  }
}

/**
 * Handle cuisine dropdown change.
 */
function onCuisineChange() {
  const select = document.getElementById("cuisine-select");
  currentCuisine = select.value;
  runPipeline();
}

/**
 * Handle eps slider input (debounced).
 */
function onEpsSliderInput() {
  currentEpsMultiplier = parseFloat(document.getElementById("eps-slider").value);
  document.getElementById("eps-value").textContent = currentEpsMultiplier.toFixed(1) + "x";

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runPipeline();
  }, 300);
}

/**
 * Handle minPts slider input (debounced).
 */
function onMinPtsSliderInput() {
  currentMinPtsMultiplier = parseFloat(document.getElementById("minpts-slider").value);
  document.getElementById("minpts-value").textContent = currentMinPtsMultiplier.toFixed(1) + "x";

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runPipeline();
  }, 300);
}

/**
 * Run the full clustering + polygon + map update pipeline.
 */
function runPipeline() {
  if (!currentCuisine || allRestaurants.length === 0) return;

  showLoading(true);

  // Use requestAnimationFrame to let the loading indicator render before blocking
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        // 1. Filter restaurants by cuisine
        const cuisineData = allRestaurants.filter(r => r.cu === currentCuisine);

        if (cuisineData.length === 0) {
          updateInfoPanel({ totalCount: 0, numClusters: 0, adjustedMinPts: 0, epsValues: {} });
          updateDotsLayer([]);
          updatePolygonLayer(null);
          showLoading(false);
          return;
        }

        // 2. Run borough-aware DBSCAN
        const { restaurants: clustered, params } = runBoroughClustering(cuisineData, currentEpsMultiplier, currentMinPtsMultiplier);

        // 2b. Assign NTA neighborhood names to clusters
        assignNTANames(clustered);

        // 3. Generate hotspot polygons
        const polygons = makeHotspotPolygons(clustered);

        // 4. Update map
        updateDotsLayer(clustered);
        updatePolygonLayer(polygons);
        fitMapToData(clustered);

        // 5. Update info panel
        updateInfoPanel(params);
      } catch (e) {
        console.error("Pipeline error:", e);
        showError("An error occurred during clustering. Try a different cuisine or multiplier.");
      }

      showLoading(false);
    }, 10);
  });
}

/**
 * Update the info panel with clustering parameters and results.
 */
function updateInfoPanel(params) {
  document.getElementById("info-total").textContent = params.totalCount || 0;
  document.getElementById("info-clusters").textContent = params.numClusters || 0;
  document.getElementById("info-minpts").textContent = params.adjustedMinPts || 0;

  const epsEl = document.getElementById("info-eps");
  if (params.epsValues) {
    const parts = Object.entries(params.epsValues)
      .map(([boro, val]) => `${boro}: ${val}m`);
    epsEl.textContent = parts.join(", ");
  } else {
    epsEl.textContent = "-";
  }
}

/**
 * Show/hide loading overlay.
 */
function showLoading(visible) {
  document.getElementById("loading").style.display = visible ? "flex" : "none";
}

/**
 * Show an error message (briefly).
 */
function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 5000);
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", init);
