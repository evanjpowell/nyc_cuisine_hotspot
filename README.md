# NYC Cuisine Hotspots

A data visualization tool that identifies and maps restaurant clusters by cuisine across New York City using the DBSCAN clustering algorithm.

## Live Demo

**[View the application](<https://evanjpowell.github.io/nyc_cuisine_hotspot/>)**

## Overview

This project analyzes restaurant inspection data from the NYC Department of Health and Mental Hygiene to identify geographic hotspots of specific cuisines.

**Key features:**
- Interactive map of NYC restaurants
- Cluster visualization by cuisine type
- Borough-aware DBSCAN clustering with tunable parameters
- Diffusion analysis across cuisines
- Real-time filtering by cuisine selection

## How It Works

The application uses DBSCAN (Density-Based Spatial Clustering) to identify clusters:
- **Eps Multiplier**: Controls the neighborhood radius (0.5x = tighter clusters, 2.0x = looser clusters)
- **MinPts Multiplier**: Adjusts minimum number of restaurants needed to form a cluster
- Borough-specific thresholds ensure appropriate clustering for different population densities

## Data

Restaurant data sourced from:
- [NYC DOHMH Restaurant Inspection Results](https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j)

**Data pipeline:**
1. Raw inspection records filtered to active restaurants
2. Aggregated by cuisine category
3. Geocoded with latitude/longitude
4. Clustered using borough-aware DBSCAN

### Updating Data

To refresh the restaurant data with the latest from NYC Open Data:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run the data updater script
python update_data.py
```

The script will:
- Download the latest restaurant inspection data from NYC Open Data API
- Clean and deduplicate restaurants (following the same logic as the R analysis)
- Generate updated `docs/data/cuisines.json` and `docs/data/restaurants.json`

**Optional:** For faster API access, set these environment variables:
```bash
export SOCRATA_APP_TOKEN="your-token"
export SOCRATA_EMAIL="your-email"
export SOCRATA_PASSWORD="your-password"
```

Get an API token at: https://data.cityofnewyork.us/profile/app_tokens

## Technologies

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Mapping**: Leaflet.js
- **Clustering**: DBSCAN implementation in JavaScript
- **Geospatial**: Turf.js for polygon generation
- **Data Processing**: Proj4.js for coordinate transformations

## Project Structure

```
docs/
  ├── index.html           # Main application page
  ├── js/
  │   ├── app.js          # UI logic and orchestration
  │   ├── map.js          # Leaflet map setup and layers
  │   ├── clustering.js   # Borough-aware DBSCAN orchestration
  │   ├── dbscan.js       # Core DBSCAN algorithm
  │   ├── analysis.js     # Diffusion scoring and analysis modal
  │   ├── polygons.js     # Hotspot polygon generation
  │   ├── nta.js          # NTA neighborhood name assignment
  │   └── projection.js   # Coordinate system utilities
  ├── css/
  │   └── style.css       # Application styling
  └── data/
      ├── restaurants.json # Restaurant coordinates and metadata
      ├── cuisines.json    # Cuisine list and counts
      └── nta.geojson      # NYC NTA neighborhood boundaries
```

## Usage

1. Select a cuisine from the dropdown (or view all)
2. Adjust the **Eps Multiplier** slider to change cluster radius
3. Adjust the **MinPts Multiplier** slider to change minimum cluster size
4. Toggle restaurant dots and hotspot regions on/off
5. Click on any dot to see restaurant details and cluster info
6. Click "Which cuisines cluster the most?" to analyze clustering patterns
7. Click "What is DBSCAN?" to learn about the clustering algorithm

## Development

### Setup
```bash
cd docs/
# Serve locally (Python)
python -m http.server 8000

# Or use your preferred static server
```

### Building

All source code is in `/docs`, which is deployed directly as a static site to GitHub Pages.

### File Modification Guide

- **Add checkmarks to dropdown**: Edit `js/app.js` in `renderOptions()` function
- **Modify popup content**: Edit `js/map.js` in `updateDotsLayer()` function
- **Change clustering parameters**: Edit borough thresholds in `js/clustering.js`
- **Adjust styles**: Edit `css/style.css`

## Analysis Features

### Clustering Analysis Modal

Click "Which cuisines cluster the most?" to see:
- % of restaurants in clusters
- Number of clusters per cuisine
- Largest cluster percentage
- **Diffusion Score**: Normalized Shannon entropy where:
  - Lower scores = concentrated in hotspots (e.g., Polish in Greenpoint)
  - Higher scores = evenly distributed across NYC

### Interactive Table

The analysis table is sortable by clicking column headers. Diffusion scores are color-coded from green (concentrated) to red (diffuse).

## Borough-Aware Clustering

DBSCAN parameters are tuned differently for each borough to account for varying population densities:
- **Manhattan**: 350m radius (tighter clustering)
- **Brooklyn/Queens**: 650m radius (moderate clustering)
- **Bronx**: 600m radius
- **Staten Island**: 700m radius (wider clustering)

These base values are then scaled by the user's eps and minPts multipliers.

## Future Enhancements

- [ ] Compare clustering across different time periods
- [ ] Export cluster data to GeoJSON
- [ ] Custom borough weighting in DBSCAN
- [ ] Historical trend analysis
- [ ] Responsive mobile interface improvements

## License

[License information to be added]

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Author

[Your name/organization]

## Acknowledgments

- NYC DOHMH for restaurant inspection data
- Leaflet.js and Turf.js communities
- DBSCAN algorithm implementation
