# Dublin Home Finder

A property search tool that aggregates listings from Daft.ie and MyHome.ie for Dublin. Calculates a desirability score based on area demand, value per sqm, BER rating, and property type.

**Live site:** https://smca.github.io/daft-tracker/

## Features

- Desirability scoring (0-100) with breakdown tooltip
- Area demand insights based on days on market
- BER rating with estimated heating costs
- Price per sqm percentile ranking
- Compare up to 3 properties side-by-side
- Map view with clustering
- Charts for price distribution, area breakdown, days on market
- Source filtering (Daft, MyHome, or both)

## Project Structure

```
daft-tracker/
├── index.html          # Main app (single-file, no build step)
├── data/
│   ├── daft_listings.csv
│   └── myhome_listings.csv
├── scrapers/
│   ├── daft_scraper.py
│   └── myhome_scraper.py
└── tests.js
```

## Running the Scrapers

Both scrapers use Playwright with your Chrome profile for authentication.

**Requirements:**
```bash
pip install playwright
playwright install chromium
```

**Run scrapers:**
```bash
python scrapers/daft_scraper.py
python scrapers/myhome_scraper.py
```

Output goes to `data/` folder automatically.

## Local Development

Just open `index.html` in a browser. No build step required.

For live reload:
```bash
npx serve .
```

## Tests

```bash
node tests.js
```

Tests cover data integrity, price validation, URL checks, and HTML validation.

## Scoring Algorithm

| Factor | Weight |
|--------|--------|
| Area Demand | 40% |
| Value (price/sqm) | 25% |
| BER Rating | 20% |
| Property Type | 15% |

Note: Dublin asking prices typically sell 7-8% above list price (2025 data).
