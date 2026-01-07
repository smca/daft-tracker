#!/usr/bin/env python3
"""
MyHome.ie Dublin Houses Scraper
Uses Playwright with your Chrome profile to bypass any protection
"""

import json
import csv
import time
import random
from pathlib import Path
from datetime import datetime

# Use your Chrome profile for cookies
CHROME_USER_DATA = str(Path.home() / "Library/Application Support/Google/Chrome")

from playwright.sync_api import sync_playwright

BASE_URL = "https://www.myhome.ie"
SEARCH_URL = "https://www.myhome.ie/residential/dublin/property-for-sale"
SCRIPT_DIR = Path(__file__).parent.parent
OUTPUT_CSV = str(SCRIPT_DIR / "data/myhome_listings.csv")
OUTPUT_JSON = str(SCRIPT_DIR / "data/myhome_listings.json")
TIMESTAMP_FILE = str(SCRIPT_DIR / "data/myhome_scrape_timestamp.txt")

# User agents
USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]

def extract_listings_from_page(page, page_num):
    """Extract listings from ng-state JSON"""
    try:
        script = page.query_selector('script#ng-state')
        if not script:
            print(f"  No ng-state found on page {page_num}")
            return [], 0, 0

        data = json.loads(script.inner_text())

        # Find the search resolver key - it changes per page
        search_key = None
        for key in data.keys():
            if key.startswith('SEARCH_RESOLVER:') and '/residential/dublin/property-for-sale' in key:
                search_key = key
                break

        if not search_key:
            # Try any SEARCH_RESOLVER key
            for key in data.keys():
                if key.startswith('SEARCH_RESOLVER:'):
                    search_key = key
                    break

        if not search_key:
            print(f"  No SEARCH_RESOLVER found on page {page_num}")
            return [], 0, 0

        search_data = data[search_key]
        total_count = search_data.get('ResultCount', 0)
        page_size = search_data.get('PageSize', 20)
        total_pages = (total_count + page_size - 1) // page_size

        results = search_data.get('SearchResults', []) or search_data.get('Results', [])

        listings = []
        for item in results:

            # Skip apartments
            property_type = item.get('PropertyType', '')
            if property_type.lower() == 'apartment':
                # print(f"\nSkipping apartment")
                continue

            # Parse price - handle ranges like "€1,275,000 to €1,350,000"
            price_str = item.get('PriceAsString', '')
            price_num = 0
            if price_str:
                # If it's a range, take the lower value
                if ' to ' in price_str.lower():
                    first_price = price_str.lower().split(' to ')[0]
                    price_num = int(''.join(c for c in first_price if c.isdigit()) or 0)
                else:
                    price_num = int(''.join(c for c in price_str if c.isdigit()) or 0)

            # Parse date listed
            created = item.get('CreatedOnDate', '')
            date_listed = ''
            days_on_market = ''
            if created:
                try:
                    dt = datetime.fromisoformat(created.replace('+00:00', ''))
                    date_listed = dt.strftime('%Y-%m-%d')
                    days_on_market = (datetime.now() - dt).days
                except:
                    pass

            # Get coordinates
            location = item.get('Location', {}) or {}
            lat = location.get('lat', 0)
            lng = location.get('lon', 0)
            # Skip if coordinates are 0,0 (not mapped)
            if lat == 0 and lng == 0:
                lat = ''
                lng = ''

            # Get BrochureMap coordinates as fallback
            brochure_map = item.get('BrochureMap', {}) or {}
            brochure_lat = brochure_map.get('latitude', 0) if brochure_map else 0
            brochure_lng = brochure_map.get('longitude', 0) if brochure_map else 0
            if brochure_lat == 0 and brochure_lng == 0:
                brochure_lat = ''
                brochure_lng = ''

            # Build URL
            brochure_url = item.get('BrochureUrl', '')
            if brochure_url and not brochure_url.startswith('http'):
                brochure_url = BASE_URL + brochure_url

            listings.append({
                'listing_id': str(item.get('PropertyId', '')),
                'source': 'myhome',
                'url': brochure_url,
                'address': item.get('DisplayAddress', ''),
                'price': price_str,
                'price_num': price_num,
                'beds': item.get('NumberOfBeds', ''),
                'baths': item.get('NumberOfBathrooms', ''),
                'size_sqm': item.get('SizeStringMeters', ''),
                'property_type': property_type,
                'ber': item.get('BerRating', ''),
                'latitude': str(lat) if lat else '',
                'longitude': str(lng) if lng else '',
                'brochure_latitude': str(brochure_lat) if brochure_lat else '',
                'brochure_longitude': str(brochure_lng) if brochure_lng else '',
                'date_listed': date_listed,
                'days_on_market': str(days_on_market) if days_on_market != '' else '',
                'agent': item.get('GroupName', ''),
                'is_new': item.get('IsNew', False),
                'is_sale_agreed': item.get('IsSaleAgreed', False),
            })

        return listings, total_count, total_pages

    except Exception as e:
        print(f"  Error extracting page {page_num}: {e}")
        import traceback
        traceback.print_exc()
        return [], 0, 1


def main():
    print("=" * 60)
    print("MyHome.ie Dublin Houses Scraper")
    print("=" * 60)

    all_listings = []
    start_time = time.time()
    scrape_timestamp = datetime.now().isoformat()

    with sync_playwright() as p:
        print("\nLaunching Chrome with your profile...")

        user_agent = random.choice(USER_AGENTS)

        try:
            context = p.chromium.launch_persistent_context(
                user_data_dir=CHROME_USER_DATA + "/Default",
                channel='chrome',
                headless=False,
                user_agent=user_agent,
                args=['--disable-blink-features=AutomationControlled'],
            )
            print("✓ Using your Chrome profile")
        except Exception as e:
            print(f"Could not use Chrome profile: {e}")
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(user_agent=user_agent)
            print("⚠ Using fresh browser")

        page = context.pages[0] if context.pages else context.new_page()

        # First page
        print(f"\nLoading search page...")
        page.goto(SEARCH_URL, wait_until='networkidle', timeout=30000)
        page.wait_for_selector('script#ng-state', state='attached', timeout=15000)
        time.sleep(0.5)  # Let Angular hydrate

        listings, total_count, total_pages = extract_listings_from_page(page, 1)
        all_listings.extend(listings)

        print(f"✓ Found {total_count} listings across {total_pages} pages")
        print(f"  Page 1/{total_pages}: {len(listings)} listings")

        # Scrape remaining pages
        consecutive_errors = 0
        for page_num in range(2, total_pages + 1):
            url = f"{SEARCH_URL}?page={page_num}"

            for attempt in range(3):
                try:
                    if consecutive_errors > 0:
                        time.sleep(3)

                    page.goto(url, wait_until='networkidle', timeout=30000)
                    page.wait_for_selector('script#ng-state', state='attached', timeout=10000)
                    time.sleep(0.5)  # Let Angular hydrate

                    listings, *_ = extract_listings_from_page(page, page_num)
                    all_listings.extend(listings)

                    elapsed = time.time() - start_time
                    rate = len(all_listings) / elapsed * 60
                    print(f"  Page {page_num}/{total_pages}: {len(listings)} listings "
                          f"(total: {len(all_listings)}, {rate:.0f}/min)")

                    consecutive_errors = 0

                    # Random delay
                    delay = random.uniform(0.5, 1.5)
                    time.sleep(delay)

                    # Save progress every 20 pages
                    if page_num % 20 == 0:
                        with open(OUTPUT_JSON + '.partial', 'w') as f:
                            json.dump(all_listings, f)

                    break

                except Exception as e:
                    consecutive_errors += 1
                    if attempt < 2:
                        wait_time = 5 * (attempt + 1)
                        print(f"  Page {page_num}: Retry {attempt + 1}/3 (waiting {wait_time}s)...")
                        time.sleep(wait_time)
                    else:
                        print(f"  Page {page_num}: Failed after 3 attempts - {e}")

            if consecutive_errors >= 5:
                print("  ⚠ Too many errors - stopping early")
                break

        context.close()

    # Remove duplicates
    seen = set()
    unique_listings = []
    for l in all_listings:
        if l['listing_id'] not in seen:
            seen.add(l['listing_id'])
            unique_listings.append(l)

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"✓ Scraped {len(unique_listings)} unique listings in {elapsed:.1f}s")

    # Save outputs
    if unique_listings:
        fieldnames = list(unique_listings[0].keys())

        with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(unique_listings)
        print(f"✓ CSV: {OUTPUT_CSV}")

        with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
            output_data = {
                'scraped_at': scrape_timestamp,
                'listings': unique_listings
            }
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"✓ JSON: {OUTPUT_JSON}")

        # Save timestamp
        with open(TIMESTAMP_FILE, 'w', encoding='utf-8') as f:
            f.write(scrape_timestamp)
        print(f"✓ Timestamp: {TIMESTAMP_FILE}")

        # Quick stats
        prices = [l['price_num'] for l in unique_listings if l['price_num'] > 0]
        if prices:
            print(f"\nPrice Stats:")
            print(f"   Min: €{min(prices):,}")
            print(f"   Max: €{max(prices):,}")
            print(f"   Avg: €{sum(prices)//len(prices):,}")

    print("\nDone!")


if __name__ == '__main__':
    main()
