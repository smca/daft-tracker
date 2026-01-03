# Dublin Home Finder

A property search tool that aggregates listings from Daft.ie and MyHome.ie for Dublin. Calculates a desirability score based on area demand, value per sqm, BER rating, and property type.

Live site: https://smca.github.io/daft-tracker/

## Data

- `dublin_houses.csv` - Daft.ie listings
- `myhome_dublin.csv` - MyHome.ie listings

Data is loaded client-side. Source filter defaults to Daft.

## Features

- Desirability scoring (0-100) with breakdown tooltip
- Area demand insights based on days on market
- BER rating with estimated heating costs
- Price per sqm percentile ranking
- Compare up to 3 properties side-by-side
- Map view with clustering
- Charts for price distribution, area breakdown, days on market

## Local Development

Just open `index.html` in a browser. No build step required.

For live reload during development:
```
npx serve .
```

## Tests

```
node tests.js
```

Validates data integrity, price formats, URLs, and HTML structure.

## For Claude Code Collaborators

When working on this repo:

1. Create feature branches with the format `claude/<description>-<session-id>`
2. The app is a single `index.html` file with embedded CSS and JS
3. Data files are CSVs loaded via fetch - no backend
4. Test changes by opening index.html locally before pushing
5. Run `node tests.js` to validate data integrity

Key functions in index.html:
- `parseCSV()` - normalizes data from both sources
- `calcDesirability()` - scoring algorithm (lines ~1390)
- `applyFilters()` - filter logic
- `renderTable()` - table rendering

The scoring weights are: Area Demand 40%, Value 25%, BER 20%, Property Type 15%.

Note: Asking prices in Dublin typically sell 7-8% above listed price based on 2025 market data.
