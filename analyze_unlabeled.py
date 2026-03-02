#!/usr/bin/env python3
"""
One-off analysis: how many unique restaurants (CAMIS) have NO labeled cuisine
entry anywhere in the inspection dataset?

A restaurant "has a label" if at least one of its inspection rows has a
non-null, non-empty cuisine_description. Restaurants where every row is
unlabeled are the ones truly missing cuisine data.

Usage:
    python analyze_unlabeled.py

Optional env vars (avoids throttling):
    SOCRATA_APP_TOKEN, SOCRATA_EMAIL, SOCRATA_PASSWORD
"""

import os
import sys

try:
    from sodapy import Socrata
except ImportError:
    print("Error: sodapy not found. Install with: pip install sodapy")
    sys.exit(1)

API_DOMAIN = "data.cityofnewyork.us"
DATASET_ID = "43nn-pn8j"

def fetch_all(client, query, description):
    """Paginate through a SoQL query and return all results."""
    results = []
    limit = 50000
    offset = 0
    while True:
        print(f"  {description}: fetching rows {offset}–{offset + limit}...")
        batch = client.get(DATASET_ID, query=query, limit=limit, offset=offset)
        results.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return results

def main():
    app_token = os.getenv("SOCRATA_APP_TOKEN")
    email     = os.getenv("SOCRATA_EMAIL")
    password  = os.getenv("SOCRATA_PASSWORD")

    if app_token and email and password:
        client = Socrata(API_DOMAIN, app_token, username=email, password=password)
        print("Using authenticated API access.")
    else:
        client = Socrata(API_DOMAIN, None)
        print("Using unauthenticated access (may be slow).")

    try:
        # 1. All unique CAMIS IDs that have at least one LABELED entry
        print("\nFetching CAMIS IDs with at least one labeled cuisine entry...")
        labeled_rows = fetch_all(
            client,
            "SELECT DISTINCT camis WHERE cuisine_description IS NOT NULL",
            "labeled"
        )
        labeled_camis = {r["camis"] for r in labeled_rows}
        print(f"  → {len(labeled_camis):,} unique restaurants have a cuisine label somewhere")

        # 2. All unique CAMIS IDs that appear in at least one UNLABELED entry
        print("\nFetching CAMIS IDs that appear in at least one unlabeled entry...")
        unlabeled_rows = fetch_all(
            client,
            "SELECT DISTINCT camis WHERE cuisine_description IS NULL",
            "unlabeled"
        )
        unlabeled_camis = {r["camis"] for r in unlabeled_rows}
        print(f"  → {len(unlabeled_camis):,} unique restaurants appear in at least one unlabeled entry")

        # 3. CAMIS IDs with NO labeled entry anywhere
        truly_unlabeled = unlabeled_camis - labeled_camis
        also_labeled    = unlabeled_camis & labeled_camis

        print("\n" + "=" * 55)
        print("Results")
        print("=" * 55)
        print(f"  Restaurants with ≥1 unlabeled entry:      {len(unlabeled_camis):>7,}")
        print(f"    ...of which also have a labeled entry:  {len(also_labeled):>7,}")
        print(f"    ...of which have NO labeled entry:      {len(truly_unlabeled):>7,}")
        print("=" * 55)
        print(f"\n→ {len(truly_unlabeled):,} restaurants are permanently unlabeled "
              f"(no cuisine label on any of their inspection records).")

    finally:
        client.close()

if __name__ == "__main__":
    main()
