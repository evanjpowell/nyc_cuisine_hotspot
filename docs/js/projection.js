// Coordinate projection: WGS84 (EPSG:4326) → NY State Plane (EPSG:2263) → meters
// Matches the R code's projection pipeline exactly

const NYC_CRS_DEF = "+proj=lcc +lat_0=40.1666666666667 +lon_0=-74 " +
  "+lat_1=41.0333333333333 +lat_2=40.6666666666667 " +
  "+x_0=300000 +y_0=0 +ellps=GRS80 +units=us-ft +no_defs";

const FEET_TO_METERS = 0.3048006096;

// Register the CRS with proj4
proj4.defs("EPSG:2263", NYC_CRS_DEF);

/**
 * Project a WGS84 lon/lat pair to meters in NY State Plane.
 * Returns [x_meters, y_meters].
 */
function projectToMeters(lon, lat) {
  const [xFeet, yFeet] = proj4("EPSG:4326", "EPSG:2263", [lon, lat]);
  return [xFeet * FEET_TO_METERS, yFeet * FEET_TO_METERS];
}
