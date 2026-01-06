#!/usr/bin/env python3
"""
Daft.ie Dublin Houses Scraper - FAST version
Run this locally on your machine
"""

import json
import csv
import time
import os
import random
from pathlib import Path
from datetime import datetime

# Rotate user agents to avoid detection
USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
]

# Use your Chrome profile for cookies
CHROME_USER_DATA = str(Path.home() / "Library/Application Support/Google/Chrome")

from playwright.sync_api import sync_playwright

BASE_URL = "https://www.daft.ie"
SCRIPT_DIR = Path(__file__).parent.parent
OUTPUT_CSV = str(SCRIPT_DIR / "data/daft_listings.csv")
OUTPUT_JSON = str(SCRIPT_DIR / "data/daft_listings.json")

# Split by price ranges to bypass 1000 result limit
SEARCH_URLS = [
    ("under_300k", "https://www.daft.ie/property-for-sale/dublin/houses?salePrice_to=300000"),
    ("300k_500k", "https://www.daft.ie/property-for-sale/dublin/houses?salePrice_from=300000&salePrice_to=500000"),
    ("500k_700k", "https://www.daft.ie/property-for-sale/dublin/houses?salePrice_from=500000&salePrice_to=700000"),
    ("700k_1m", "https://www.daft.ie/property-for-sale/dublin/houses?salePrice_from=700000&salePrice_to=1000000"),
    ("over_1m", "https://www.daft.ie/property-for-sale/dublin/houses?salePrice_from=1000000"),
]

# For faster scraping - batch multiple pages
CONCURRENT_PAGES = 5


def extract_listings_from_page(page):
    """Extract listings from __NEXT_DATA__ JSON"""
    try:
        script = page.query_selector('script#__NEXT_DATA__')
        if not script:
            return [], 0

        data = json.loads(script.inner_text())
        props = data.get('props', {}).get('pageProps', {})

        # Get paging info for total count
        paging = props.get('paging', {})
        total_count = paging.get('totalResults', 0)
        total_pages = paging.get('totalPages', 1)

        # Listings are directly in pageProps
        listings_data = props.get('listings', [])

        listings = []
        for item in listings_data:
            listing = item.get('listing', {})
            coords = listing.get('point', {}).get('coordinates', [0, 0])

            # Get more details
            media = listing.get('media', {})
            images = media.get('images', [])
            image_url = images[0].get('size720x480', '') if images else ''

            # Get seller info
            seller = listing.get('seller', {})

            # Convert publish date from milliseconds timestamp to readable date
            publish_ts = listing.get('publishDate', 0)
            if publish_ts:
                try:
                    listed_dt = datetime.fromtimestamp(publish_ts / 1000)
                    publish_date = listed_dt.strftime('%Y-%m-%d')
                    days_on_market = (datetime.now() - listed_dt).days
                except:
                    publish_date = ''
                    days_on_market = ''
            else:
                publish_date = ''
                days_on_market = ''

            # Get floor area
            floor_area = listing.get('floorArea', {})
            size_sqm = floor_area.get('value', '') if isinstance(floor_area, dict) else ''

            # Get BER
            ber_info = listing.get('ber', {})
            ber = ber_info.get('rating', '') if isinstance(ber_info, dict) else ''

            listings.append({
                'listing_id': str(listing.get('id', '')),
                'url': BASE_URL + listing.get('seoFriendlyPath', ''),
                'address': listing.get('title', ''),
                'price': listing.get('price', ''),
                'beds': listing.get('numBedrooms', ''),
                'baths': listing.get('numBathrooms', ''),
                'size_sqm': str(size_sqm),
                'property_type': listing.get('propertyType', ''),
                'ber': ber,
                'latitude': str(coords[1]) if coords and len(coords) > 1 else '',
                'longitude': str(coords[0]) if coords and len(coords) > 0 else '',
                'date_listed': publish_date,
                'days_on_market': str(days_on_market) if days_on_market != '' else '',
                'image_url': image_url,
                'agent': seller.get('name', ''),
                'agent_branch': seller.get('branch', ''),
            })

        return listings, total_count, total_pages

    except Exception as e:
        print(f"  Error extracting: {e}")
        import traceback
        traceback.print_exc()
        return [], 0, 1


def main():
    print("=" * 60)
    print("Daft.ie Dublin Houses Scraper")
    print("=" * 60)

    all_listings = []
    start_time = time.time()
    scrape_timestamp = datetime.now().isoformat()

    with sync_playwright() as p:
        print("\nLaunching Chrome with your profile...")

        # Try to use your Chrome profile (has cookies)
        user_agent = random.choice(USER_AGENTS)
        print(f"  Using UA: {user_agent[:50]}...")

        try:
            context = p.chromium.launch_persistent_context(
                user_data_dir=CHROME_USER_DATA + "/Default",
                channel='chrome',  # Use installed Chrome
                headless=False,    # Visible - helps with Cloudflare
                user_agent=user_agent,
                args=['--disable-blink-features=AutomationControlled'],
            )
            print("✓ Using your Chrome profile")
        except:
            # Fallback to fresh browser
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(user_agent=user_agent)
            print("⚠ Using fresh browser (might get Cloudflare'd)")

        page = context.pages[0] if context.pages else context.new_page()

        # Loop through price ranges to bypass Daft's 1000 result limit
        for range_name, search_url in SEARCH_URLS:
            print(f"\n{'='*50}")
            print(f"Scraping: {range_name}")
            print(f"{'='*50}")

            # First page
            page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
            page.wait_for_selector('script#__NEXT_DATA__', state='attached', timeout=10000)

            # Check for Cloudflare
            content = page.content()
            if 'challenge' in content.lower() or 'checking your browser' in content.lower():
                print("\n⚠ Cloudflare challenge detected!")
                print("  Please solve it in the browser window...")
                page.wait_for_url("**/property-for-sale/**", timeout=120000)
                print("✓ Challenge solved!")

            listings, total_count, total_pages = extract_listings_from_page(page)
            all_listings.extend(listings)

            # Cap at 49 pages (Daft breaks at 50)
            total_pages = min(total_pages, 49)
            print(f"✓ Found {total_count} listings, scraping up to {total_pages} pages")
            print(f"  Page 1/{total_pages}: {len(listings)} listings")

            # Scrape remaining pages
            consecutive_errors = 0
            for page_num in range(2, total_pages + 1):
                url = f"{search_url}&page={page_num}"

                for attempt in range(3):  # Retry up to 3 times
                    try:
                        if consecutive_errors > 0:
                            time.sleep(5)  # Slow down after errors

                        page.goto(url, wait_until='domcontentloaded', timeout=20000)

                        # Check for error page
                        if 'something went wrong' in page.content().lower():
                            raise Exception("Rate limited - got error page")

                        page.wait_for_selector('script#__NEXT_DATA__', state='attached', timeout=10000)
                        listings, *_ = extract_listings_from_page(page)
                        all_listings.extend(listings)

                        elapsed = time.time() - start_time
                        rate = len(all_listings) / elapsed * 60
                        print(f"  Page {page_num}/{total_pages}: {len(listings)} listings "
                              f"(total: {len(all_listings)}, {rate:.0f}/min)")

                        consecutive_errors = 0

                        # Random human-like delay
                        delay = random.uniform(0.8, 2.0) + (page_num / 150)
                        time.sleep(delay)

                        # Save progress every 10 pages
                        if page_num % 10 == 0:
                            with open(OUTPUT_JSON + '.partial', 'w') as f:
                                json.dump(all_listings, f)

                        break  # Success, move to next page

                    except Exception as e:
                        consecutive_errors += 1
                        if attempt < 2:
                            wait_time = 10 * (attempt + 1)  # 10s, 20s
                            print(f"  Page {page_num}: Retry {attempt + 1}/3 (waiting {wait_time}s)...")
                            time.sleep(wait_time)
                        else:
                            print(f"  Page {page_num}: Failed after 3 attempts - {e}")

                # If too many consecutive errors, take a long break
                if consecutive_errors >= 3:
                    print("  ⚠ Rate limited - waiting 30s...")
                    time.sleep(30)
                    consecutive_errors = 0

            # Summary for this price range
            print(f"  ✓ {range_name} complete - total so far: {len(all_listings)}")
            time.sleep(2)  # Brief pause between ranges

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

        # Clean up partial file
        partial_file = OUTPUT_JSON + '.partial'
        if os.path.exists(partial_file):
            os.remove(partial_file)

        # Quick stats
        prices = [int(l['price'].replace('€', '').replace(',', ''))
                  for l in unique_listings if l['price'] and l['price'].replace('€', '').replace(',', '').isdigit()]
        if prices:
            print(f"\n📊 Price Stats:")
            print(f"   Min: €{min(prices):,}")
            print(f"   Max: €{max(prices):,}")
            print(f"   Avg: €{sum(prices)//len(prices):,}")

    print("\nDone!")


if __name__ == '__main__':
    main()
