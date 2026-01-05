# Dublin Home Finder

A property search tool that aggregates listings from Daft.ie and MyHome.ie for Dublin. Calculates a desirability score based on area demand, value per sqm, BER rating, and property type.

Live site: https://smca.github.io/daft-tracker/

## Data

- `daft_listings.csv` - Daft.ie listings
- `myhome_listings.csv` - MyHome.ie listings

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

### What's Tested

- **Data Integrity** - CSVs have data, required fields present
- **Price Validation** - prices parseable, no corrupted ranges
- **URL Validation** - all links point to correct domains
- **Uniqueness** - no duplicate listing IDs per source
- **HTML Validation** - key elements and CSS classes exist

### Adding Tests

Tests use a simple `test(name, fn)` pattern:

```js
test('My new feature works', () => {
    assert(someCondition, 'Error message if false');
    assertEqual(actual, expected, 'Values should match');
});
```

When to add tests:
- New filter: test the HTML element exists
- New data field: test it's present in CSV and parsed correctly
- New computed field: test the calculation logic
- New UI element: test the HTML/CSS is present

## For Claude Code Collaborators

When working on this repo:

1. Create feature branches with the format `claude/<description>-<session-id>`
2. The app is a single `index.html` file with embedded CSS and JS
3. Data files are CSVs loaded via fetch - no backend
4. Test changes by opening index.html locally before pushing
5. Run `node tests.js` to validate data integrity

### Code Structure

All code is in `index.html`:
- Lines 1-900: CSS styles
- Lines 900-1200: HTML structure
- Lines 1200+: JavaScript

Key global variables:
- `allData` - all properties from both sources
- `filteredData` - properties after filters applied
- `tableData` - properties after table-specific filters
- `areaStats` - computed stats per area (avg price, days, demand score)

### Data Flow

1. `loadData()` fetches CSVs and calls `parseCSV()` for each source
2. `parseCSV()` normalizes fields (priceNum, bedsNum, sizeNum, lat, lng, area)
3. Area stats computed, then `calcDesirability()` scores each property
4. `applyFilters()` filters to `filteredData`, updates stats/charts
5. `renderTable()` renders the table from `tableData`

### Adding a New Filter

1. Add HTML select/input in the filters-row section (~line 1020)
2. Read the value in `applyFilters()` (~line 2150)
3. Add filter logic: `if (myFilter && !matchesCondition(d)) return false;`
4. Add to `saveFilters()`/`loadFilters()` if it should persist

### Adding a Table Column

1. Add `<th>` in the table header (~line 1140)
2. In `renderTable()`, create a new `<td>` and append to `tr`
3. Add any CSS classes needed for styling

### CSV Fields Available

Both sources have: listing_id, url, address, price, beds, baths, size_sqm, property_type, ber, latitude, longitude, days_on_market

Computed fields added by parseCSV: priceNum, bedsNum, sizeNum, daysNum, lat, lng, pricePerSqm, area, heatingCost, source

### Scoring Algorithm

The scoring weights are: Area Demand 40%, Value 25%, BER 20%, Property Type 15%.

Note: Asking prices in Dublin typically sell 7-8% above listed price based on 2025 market data.

### Claude Code Tips

**Working with the single-file architecture:**
- The file is ~2200 lines. Use line number references when discussing changes.
- Read specific sections with offset/limit rather than the whole file.
- CSS, HTML, and JS are all in one file - be careful with large edits.

**Git workflow:**
- Branch naming: `claude/<description>-<session-id>` (the session ID is provided)
- Can't push directly to main - always use feature branches
- Rebase onto main if your branch falls behind: `git rebase origin/main`
- Run `node tests.js` before committing
- Create PRs with `gh pr create` - include a summary and test plan

**Common tasks:**
- "Add a filter" → see Adding a New Filter section above
- "Add a column" → see Adding a Table Column section above
- "Change scoring" → edit `calcDesirability()` around line 1430
- "Fix a bug" → check browser console, search for relevant function

**If stuck:**
- Check `git status` and `git log` to understand current state
- The app has no build step - just open index.html in browser to test
- All state is in global variables (allData, filteredData, etc.)
