// Main application — UI handlers, data loading, pipeline orchestration

let allRestaurants = [];
let cuisineList = [];
let selectedCuisines = [];
let currentEpsMultiplier = 1.0;
let currentMinPtsMultiplier = 1.0;
let debounceTimer = null;
let darkMode = false;

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

    // Build multi-select cuisine dropdown
    buildCuisineDropdown();

    // Apply dark/light mode from browser preference before map initializes
    darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (darkMode) document.documentElement.dataset.theme = "dark";

    // Initialize map and analysis modal
    initMap();

    // Load subway layer independently so a missing file doesn't break the rest of the app
    fetch("data/mta-subway.geojson")
      .then(res => res.json())
      .then(geojson => initSubwayLayer(geojson))
      .catch(e => console.warn("Subway layer unavailable:", e));

    initAnalysisModal();
    initDBSCANModal();
    initCuisineLabelModal();
    initEpsModal();
    initMinptsModal();
    initCollapsibles();
    initTheme();

    // Set up event listeners
    document.getElementById("eps-slider").addEventListener("input", onEpsSliderInput);
    document.getElementById("minpts-slider").addEventListener("input", onMinPtsSliderInput);

    document.getElementById("toggle-dots").addEventListener("change", function () {
      toggleDots(this.checked);
    });

    document.getElementById("toggle-polygons").addEventListener("change", function () {
      togglePolygons(this.checked);
    });

    // Explicitly reset all controls — browsers restore form state across reloads,
    // which causes visual state to diverge from JS state.
    document.getElementById("toggle-dots").checked = true;
    document.getElementById("toggle-polygons").checked = true;
    document.getElementById("toggle-subway").checked = false;
    document.getElementById("eps-slider").value = 1.0;
    document.getElementById("eps-value").textContent = "1.0x";
    currentEpsMultiplier = 1.0;
    document.getElementById("minpts-slider").value = 1.0;
    document.getElementById("minpts-value").textContent = "1.0x";
    currentMinPtsMultiplier = 1.0;
    document.getElementById("toggle-subway").addEventListener("change", function () {
      toggleSubway(this.checked);
    });

    // Start on a random cuisine with >100 restaurants, excluding generic "Other"
    showLoading(false);
    if (cuisineList.length > 0) {
      const candidates = cuisineList.filter(
        c => c.count > 100 && c.name.toLowerCase() !== "other"
      );
      const pool = candidates.length > 0 ? candidates : cuisineList;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setSelectedCuisines([pick.name]);
      runPipeline();
    }
  } catch (e) {
    console.error("Failed to initialize:", e);
    showLoading(false);
    showError("Failed to load data. Please try refreshing the page.");
  }
}

// --- Multi-select cuisine dropdown ---

let menuOpen = false;

function buildCuisineDropdown() {
  const toggle = document.getElementById("cuisine-toggle");
  const menu = document.getElementById("cuisine-menu");
  const optionsContainer = document.getElementById("cuisine-options");
  const searchInput = document.getElementById("cuisine-search");

  // Build option elements: "All" first, then each cuisine
  renderOptions(optionsContainer, "");

  // Toggle menu open/close
  toggle.addEventListener("click", function (e) {
    e.stopPropagation();
    menuOpen = !menuOpen;
    menu.style.display = menuOpen ? "block" : "none";
    if (menuOpen) {
      searchInput.value = "";
      renderOptions(optionsContainer, "");
      searchInput.focus();
    }
  });

  // Search filter
  searchInput.addEventListener("input", function () {
    renderOptions(optionsContainer, this.value.toLowerCase());
  });
  searchInput.addEventListener("click", function (e) { e.stopPropagation(); });

  // Close menu on outside click
  document.addEventListener("click", function () {
    if (menuOpen) {
      menuOpen = false;
      menu.style.display = "none";
    }
  });
  menu.addEventListener("click", function (e) { e.stopPropagation(); });
}

function renderOptions(container, filter) {
  container.innerHTML = "";
  const allSelected = selectedCuisines.length === 0 ||
    (selectedCuisines.length === 1 && selectedCuisines[0] === "__ALL__");

  // "All" option — checkbox and name both select all
  const allDiv = document.createElement("div");
  allDiv.className = "multi-select-option" + (allSelected ? " selected" : "");

  const allCheck = document.createElement("input");
  allCheck.type = "checkbox";
  allCheck.className = "cuisine-checkbox";
  allCheck.checked = allSelected;
  allCheck.addEventListener("change", function () {
    setSelectedCuisines(["__ALL__"]);
    runPipeline();
    renderOptions(container, filter);
  });

  const allName = document.createElement("span");
  allName.className = "cuisine-name";
  allName.textContent = "All cuisines";
  allName.addEventListener("click", function () {
    setSelectedCuisines(["__ALL__"]);
    runPipeline();
    renderOptions(container, filter);
  });

  allDiv.appendChild(allCheck);
  allDiv.appendChild(allName);
  container.appendChild(allDiv);

  // Individual cuisines
  for (const c of cuisineList) {
    if (filter && !c.name.toLowerCase().includes(filter)) continue;
    const div = document.createElement("div");
    const isSelected = !allSelected && selectedCuisines.includes(c.name);
    div.className = "multi-select-option" + (isSelected ? " selected" : "");

    // Checkbox: toggles this cuisine into/out of a multi-selection
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "cuisine-checkbox";
    check.checked = isSelected;
    check.addEventListener("change", function () {
      toggleCuisineSelection(c.name);
      runPipeline();
      renderOptions(container, filter);
    });

    // Name: solo-selects normally; Cmd/Ctrl+click toggles into multi-selection
    const nameSpan = document.createElement("span");
    nameSpan.className = "cuisine-name";
    nameSpan.textContent = `${c.name} (${c.count})`;
    nameSpan.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey) {
        toggleCuisineSelection(c.name);
      } else {
        setSelectedCuisines([c.name]);
      }
      runPipeline();
      renderOptions(container, filter);
    });

    div.appendChild(check);
    div.appendChild(nameSpan);
    container.appendChild(div);
  }
}

function toggleCuisineSelection(name) {
  // If currently "All", switch to just this one
  if (selectedCuisines.length === 1 && selectedCuisines[0] === "__ALL__") {
    setSelectedCuisines([name]);
    return;
  }
  const idx = selectedCuisines.indexOf(name);
  if (idx >= 0) {
    selectedCuisines.splice(idx, 1);
    if (selectedCuisines.length === 0) {
      setSelectedCuisines(["__ALL__"]);
    } else {
      updateToggleLabel();
    }
  } else {
    selectedCuisines.push(name);
    updateToggleLabel();
  }
}

function setSelectedCuisines(cuisines) {
  selectedCuisines = cuisines;
  updateToggleLabel();
}

function updateToggleLabel() {
  const toggle = document.getElementById("cuisine-toggle");
  if (selectedCuisines.length === 0 || (selectedCuisines.length === 1 && selectedCuisines[0] === "__ALL__")) {
    toggle.textContent = "All cuisines";
  } else if (selectedCuisines.length === 1) {
    toggle.textContent = selectedCuisines[0];
  } else {
    toggle.textContent = selectedCuisines.length + " cuisines selected";
  }
}

// --- Sliders ---

function onEpsSliderInput() {
  currentEpsMultiplier = parseFloat(document.getElementById("eps-slider").value);
  document.getElementById("eps-value").textContent = currentEpsMultiplier.toFixed(1) + "x";

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runPipeline();
  }, 300);
}

function onMinPtsSliderInput() {
  currentMinPtsMultiplier = parseFloat(document.getElementById("minpts-slider").value);
  document.getElementById("minpts-value").textContent = currentMinPtsMultiplier.toFixed(1) + "x";

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runPipeline();
  }, 300);
}

// --- Pipeline ---

function runPipeline() {
  if (allRestaurants.length === 0) return;

  const isAll = selectedCuisines.length === 0 ||
    (selectedCuisines.length === 1 && selectedCuisines[0] === "__ALL__");

  showLoading(true);

  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        // 1. Filter restaurants by selected cuisines
        let cuisineData;
        if (isAll) {
          cuisineData = allRestaurants.slice(); // all restaurants
        } else {
          const cuisineSet = new Set(selectedCuisines);
          cuisineData = allRestaurants.filter(r => cuisineSet.has(r.cu));
        }

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

/**
 * Wire up all collapsible section toggles.
 * Sections start open (^). Clicking closes them (v) and vice versa.
 */
function initCollapsibles() {
  document.querySelectorAll(".collapse-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const content = document.getElementById(btn.dataset.target);
      const isOpen = content.style.display !== "none";
      content.style.display = isOpen ? "none" : "";
      btn.textContent = isOpen ? "v" : "^";
    });
  });
}

/**
 * Set up the dark/light mode toggle button.
 * Icon: 🌙 in light mode (click to go dark), ☀️ in dark mode (click to go light).
 */
function initTheme() {
  const btn = document.getElementById("theme-toggle");
  btn.textContent = darkMode ? "☀️" : "🌙";
  btn.addEventListener("click", toggleTheme);
}

function toggleTheme() {
  darkMode = !darkMode;
  document.documentElement.dataset.theme = darkMode ? "dark" : "";
  document.getElementById("theme-toggle").textContent = darkMode ? "☀️" : "🌙";
  setMapTheme(darkMode);
  restyleSubway();
  restylePolygons();
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", init);
