/**
 * Dublin Home Finder - Test Suite
 * Run with: node tests.js (from daft-tracker directory)
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${e.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

// Helper to parse CSV (same logic as browser)
function parseCSVLine(line) {
    const r = []; let c = '', q = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') q = !q;
        else if (line[i] === ',' && !q) { r.push(c.trim()); c = ''; }
        else c += line[i];
    }
    r.push(c.trim());
    return r;
}

function loadCSV(filename) {
    const text = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    const lines = text.trim().split('\n');
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i] || '');
        return obj;
    });
}

console.log('\n=== Dublin Home Finder Tests ===\n');

// --- Data Integrity Tests ---
console.log('--- Data Integrity ---');

const daftData = loadCSV('daft_listings.csv');
const myhomeData = loadCSV('myhome_listings.csv');

test('Daft CSV has data', () => {
    assert(daftData.length > 0, 'Daft CSV is empty');
    console.log(`    (${daftData.length} listings)`);
});

test('MyHome CSV has data', () => {
    assert(myhomeData.length > 0, 'MyHome CSV is empty');
    console.log(`    (${myhomeData.length} listings)`);
});

test('Daft listings have required fields', () => {
    const required = ['listing_id', 'url', 'address', 'price', 'beds'];
    const first = daftData[0];
    required.forEach(field => {
        assert(field in first, `Missing field: ${field}`);
    });
});

test('MyHome listings have required fields', () => {
    const required = ['listing_id', 'url', 'address', 'price', 'beds', 'source'];
    const first = myhomeData[0];
    required.forEach(field => {
        assert(field in first, `Missing field: ${field}`);
    });
});

test('MyHome source field is correct', () => {
    const sources = [...new Set(myhomeData.map(d => d.source))];
    assertEqual(sources.length, 1, 'Should have exactly one source value');
    assertEqual(sources[0], 'myhome', 'Source should be "myhome"');
});

// --- Price Validation Tests ---
console.log('\n--- Price Validation ---');

test('Daft prices are mostly parseable (allows POA/AMV)', () => {
    let invalid = 0;
    daftData.forEach(d => {
        const num = parseInt(d.price.replace(/[^0-9]/g, '')) || 0;
        if (num === 0) invalid++;
    });
    // Allow up to 1% unparseable (POA, AMV listings are filtered in app)
    const threshold = Math.ceil(daftData.length * 0.01);
    assert(invalid <= threshold, `${invalid} listings have invalid prices (threshold: ${threshold})`);
    if (invalid > 0) console.log(`    (${invalid} POA/AMV listings will be filtered)`);
});

test('All MyHome prices are reasonable', () => {
    let unreasonable = 0;
    myhomeData.forEach(d => {
        const num = parseInt(d.price_num) || 0;
        if (num > 50000000) unreasonable++; // Over 50M is suspicious
    });
    assert(unreasonable === 0, `${unreasonable} listings have unreasonable prices (>50M)`);
});

test('MyHome price ranges are fixed', () => {
    // Check that no price_num values are concatenated ranges
    let corrupted = 0;
    myhomeData.forEach(d => {
        const num = parseInt(d.price_num) || 0;
        if (num > 100000000) corrupted++; // Over 100M definitely wrong
    });
    assert(corrupted === 0, `${corrupted} listings have corrupted price ranges`);
});

// --- URL Validation Tests ---
console.log('\n--- URL Validation ---');

test('All Daft URLs are valid daft.ie links', () => {
    let invalid = 0;
    daftData.forEach(d => {
        if (!d.url.startsWith('https://www.daft.ie/')) invalid++;
    });
    assert(invalid === 0, `${invalid} listings have invalid Daft URLs`);
});

test('All MyHome URLs are valid myhome.ie links', () => {
    let invalid = 0;
    myhomeData.forEach(d => {
        if (!d.url.startsWith('https://www.myhome.ie/')) invalid++;
    });
    assert(invalid === 0, `${invalid} listings have invalid MyHome URLs`);
});

// --- Uniqueness Tests ---
console.log('\n--- Uniqueness ---');

test('Daft listing IDs are unique', () => {
    const ids = daftData.map(d => d.listing_id);
    const unique = new Set(ids);
    assertEqual(unique.size, ids.length, `Found ${ids.length - unique.size} duplicates`);
});

test('MyHome listing IDs are unique', () => {
    const ids = myhomeData.map(d => d.listing_id);
    const unique = new Set(ids);
    assertEqual(unique.size, ids.length, `Found ${ids.length - unique.size} duplicates`);
});

// --- HTML Validation Tests ---
console.log('\n--- HTML Validation ---');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('HTML includes source filter', () => {
    assert(html.includes('filterSource'), 'Missing source filter element');
});

test('HTML includes both CSV fetches', () => {
    assert(html.includes('daft_listings.csv'), 'Missing Daft CSV fetch');
    assert(html.includes('myhome_listings.csv'), 'Missing MyHome CSV fetch');
});

test('HTML includes source badges CSS', () => {
    assert(html.includes('.source-daft'), 'Missing Daft source badge style');
    assert(html.includes('.source-myhome'), 'Missing MyHome source badge style');
});

test('HTML includes source stats elements', () => {
    assert(html.includes('headerDaft'), 'Missing Daft count element');
    assert(html.includes('headerMyhome'), 'Missing MyHome count element');
});

// --- Summary ---
console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
    process.exit(1);
}
