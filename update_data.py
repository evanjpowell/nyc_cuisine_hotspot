#!/usr/bin/env python3
"""
Download and process NYC restaurant inspection data for the cuisine hotspot web app.

This script:
1. Downloads data from NYC Open Data API (same source as R analysis)
2. Cleans and deduplicates following the same logic as the R markdown file
3. Generates JSON files for the web application

Usage:
    python update_data.py

Environment variables (optional):
    SOCRATA_APP_TOKEN - NYC Open Data API token
    SOCRATA_EMAIL - Email for authentication
    SOCRATA_PASSWORD - Password for authentication

If not provided, the script will fetch data without authentication (slower rate limits).
"""

import os
import json
import sys
from typing import List, Dict, Any
from collections import Counter

try:
    from sodapy import Socrata
except ImportError:
    print("Error: sodapy library not found.")
    print("Install it with: pip install sodapy")
    sys.exit(1)


# Configuration
API_DOMAIN = "data.cityofnewyork.us"
DATASET_ID = "43nn-pn8j"
OUTPUT_DIR = "docs/data"
CUISINES_FILE = f"{OUTPUT_DIR}/cuisines.json"
RESTAURANTS_FILE = f"{OUTPUT_DIR}/restaurants.json"


def fetch_restaurant_data(client: Socrata) -> List[Dict[str, Any]]:
    """
    Fetch all restaurant inspection data from NYC Open Data.

    Returns list of restaurant records.
    """
    print("Fetching data from NYC Open Data API...")
    print(f"Dataset: https://{API_DOMAIN}/resource/{DATASET_ID}")

    # Fetch data with pagination (API returns max 50k rows per request)
    # We'll fetch in chunks and combine
    all_data = []
    limit = 50000
    offset = 0

    while True:
        print(f"  Fetching records {offset} to {offset + limit}...")
        results = client.get(
            DATASET_ID,
            limit=limit,
            offset=offset,
            select="camis,dba,boro,cuisine_description,latitude,longitude"
        )

        if not results:
            break

        all_data.extend(results)

        if len(results) < limit:
            break

        offset += limit

    print(f"✓ Fetched {len(all_data)} total records")
    return all_data


def clean_and_process_data(raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Clean and deduplicate restaurant data following R markdown logic.

    Steps:
    1. Convert lat/long to numeric
    2. Remove rows without valid coordinates or cuisine description
    3. Deduplicate by camis (restaurant ID)
    """
    print("\nCleaning and processing data...")

    cleaned = []
    seen_camis = set()
    skipped_invalid = 0
    skipped_duplicate = 0

    for record in raw_data:
        # Check required fields exist
        if not all(k in record for k in ['camis', 'dba', 'boro', 'cuisine_description', 'latitude', 'longitude']):
            skipped_invalid += 1
            continue

        camis = record['camis']
        cuisine = record.get('cuisine_description')

        # Skip if missing cuisine
        if not cuisine:
            skipped_invalid += 1
            continue

        # Try to convert lat/long to float
        try:
            lat = float(record['latitude'])
            lon = float(record['longitude'])
        except (ValueError, TypeError):
            skipped_invalid += 1
            continue

        # Skip if invalid coordinates (0, 0 is "Null Island")
        if lat == 0 or lon == 0:
            skipped_invalid += 1
            continue

        # Deduplicate by camis (keep first occurrence)
        if camis in seen_camis:
            skipped_duplicate += 1
            continue

        seen_camis.add(camis)

        # Keep cleaned record
        cleaned.append({
            'camis': camis,
            'dba': record['dba'],
            'boro': record['boro'],
            'cuisine_description': cuisine,
            'latitude': lat,
            'longitude': lon
        })

    print(f"✓ Cleaned data:")
    print(f"  - Valid restaurants: {len(cleaned)}")
    print(f"  - Skipped (invalid coords/missing data): {skipped_invalid}")
    print(f"  - Skipped (duplicates): {skipped_duplicate}")

    return cleaned


def generate_cuisine_list(restaurants: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate list of cuisines with counts, sorted by count descending.
    """
    cuisine_counts = Counter(r['cuisine_description'] for r in restaurants)

    cuisine_list = [
        {'name': cuisine, 'count': count}
        for cuisine, count in cuisine_counts.most_common()
    ]

    print(f"\n✓ Found {len(cuisine_list)} unique cuisines")
    return cuisine_list


def generate_restaurant_list(restaurants: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate restaurant list with abbreviated keys for smaller file size.

    Abbreviations:
    - c: camis
    - n: name (dba)
    - b: boro
    - cu: cuisine
    - la: latitude
    - lo: longitude
    """
    return [
        {
            'c': r['camis'],
            'n': r['dba'],
            'b': r['boro'],
            'cu': r['cuisine_description'],
            'la': round(r['latitude'], 4),  # Round to 4 decimal places (~11m precision)
            'lo': round(r['longitude'], 4)
        }
        for r in restaurants
    ]


def save_json(data: Any, filepath: str) -> None:
    """Save data as JSON file."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)

    # Get file size
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"✓ Saved {filepath} ({size_mb:.2f} MB)")


def main():
    """Main execution function."""
    print("=" * 60)
    print("NYC Cuisine Hotspot Data Updater")
    print("=" * 60)

    # Get credentials from environment (optional)
    app_token = os.getenv('SOCRATA_APP_TOKEN')
    email = os.getenv('SOCRATA_EMAIL')
    password = os.getenv('SOCRATA_PASSWORD')

    # Initialize Socrata client
    if app_token and email and password:
        print("✓ Using authenticated API access")
        client = Socrata(
            API_DOMAIN,
            app_token,
            username=email,
            password=password
        )
    else:
        print("⚠ Using unauthenticated API access (slower rate limits)")
        print("  Set SOCRATA_APP_TOKEN, SOCRATA_EMAIL, SOCRATA_PASSWORD for faster access")
        client = Socrata(API_DOMAIN, None)

    try:
        # 1. Fetch data from API
        raw_data = fetch_restaurant_data(client)

        # 2. Clean and process
        restaurants = clean_and_process_data(raw_data)

        if not restaurants:
            print("\n❌ Error: No valid restaurants found!")
            return 1

        # 3. Generate output files
        print("\nGenerating output files...")

        cuisines = generate_cuisine_list(restaurants)
        save_json(cuisines, CUISINES_FILE)

        restaurant_list = generate_restaurant_list(restaurants)
        save_json(restaurant_list, RESTAURANTS_FILE)

        print("\n" + "=" * 60)
        print("✓ Data update complete!")
        print("=" * 60)
        print(f"Total restaurants: {len(restaurants)}")
        print(f"Total cuisines: {len(cuisines)}")
        print(f"\nOutput files:")
        print(f"  - {CUISINES_FILE}")
        print(f"  - {RESTAURANTS_FILE}")

        return 0

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1

    finally:
        client.close()


if __name__ == '__main__':
    sys.exit(main())
