let allData = [], filteredData = [], tableData = [], areaStats = {}, globalStats = {};
let map, markers, priceChart, areaChart, daysChart;
let scrapeTimestamps = { daft: null, myhome: null };
let compareList = [];
let currentSort = { key: 'desirability.score', dir: -1 };
let currentTableFilter = 'all';
let tableSearchTerm = '';

function showLoading(show) {
    var existing = document.getElementById('loadingOverlay');
    if (show && !existing) {
        var overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(250,248,245,0.9);display:flex;align-items:center;justify-content:center;z-index:2000;';
        overlay.innerHTML = '<div style="text-align:center;"><div style="width:40px;height:40px;border:3px solid #E8E4DE;border-top-color:#C05746;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div><div style="font-size:15px;color:#7A7067;">Loading properties...</div></div>';
        document.body.appendChild(overlay);
        var style = document.createElement('style');
        style.id = 'loadingStyle';
        style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(style);
    } else if (!show && existing) {
        existing.remove();
        var style = document.getElementById('loadingStyle');
        if (style) style.remove();
    }
}

function showError(message) {
    var container = document.querySelector('.container');
    var existing = document.getElementById('errorBanner');
    if (existing) existing.remove();
    var banner = document.createElement('div');
    banner.id = 'errorBanner';
    banner.style.cssText = 'background:#FCE8E6;border:1px solid #C44536;color:#C44536;padding:16px 20px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;';
    banner.innerHTML = '<span>' + message + '</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#C44536;font-size:18px;cursor:pointer;">×</button>';
    container.insertBefore(banner, container.firstChild);
}

function showEmptyState(show) {
    var tbody = document.getElementById('tableBody');
    var existing = document.getElementById('emptyState');
    if (existing) existing.remove();
    if (show) {
        var row = document.createElement('tr');
        row.id = 'emptyState';
        row.innerHTML = '<td colspan="10" style="text-align:center;padding:60px 20px;color:#7A7067;"><div style="font-size:15px;margin-bottom:8px;">No properties match your filters</div><div style="font-size:13px;">Try adjusting your search criteria</div></td>';
        tbody.appendChild(row);
    }
}

// Save filters to localStorage
function saveFilters() {
    try {
        var filters = {
            source: document.getElementById('filterSource').value,
            area: document.getElementById('filterArea').value,
            location: document.getElementById('filterLocation').value,
            price: document.getElementById('filterPrice').value,
            beds: document.getElementById('filterBeds').value,
            type: document.getElementById('filterType').value,
            ber: document.getElementById('filterBer').value,
            score: document.getElementById('filterDesire').value,
            tableFilter: currentTableFilter,
            tableSearch: tableSearchTerm
        };
        localStorage.setItem('dublinHomeFilters', JSON.stringify(filters));
    } catch (e) {
        // localStorage unavailable (Safari private mode)
    }
}

// Load filters from localStorage
function loadFilters() {
    try {
        var saved = localStorage.getItem('dublinHomeFilters');
        if (saved) {
            var filters = JSON.parse(saved);
            if (filters.source) document.getElementById('filterSource').value = filters.source;
            if (filters.area) document.getElementById('filterArea').value = filters.area;
            if (filters.location) document.getElementById('filterLocation').value = filters.location;
            if (filters.price) document.getElementById('filterPrice').value = filters.price;
            if (filters.beds) document.getElementById('filterBeds').value = filters.beds;
            if (filters.type) document.getElementById('filterType').value = filters.type;
            if (filters.ber) document.getElementById('filterBer').value = filters.ber;
            if (filters.score) document.getElementById('filterDesire').value = filters.score;
            if (filters.tableFilter) {
                currentTableFilter = filters.tableFilter;
                document.querySelectorAll('.filter-tab').forEach(function(t) {
                    t.classList.toggle('active', t.dataset.filter === currentTableFilter);
                });
            }
            if (filters.tableSearch) {
                tableSearchTerm = filters.tableSearch;
                document.getElementById('tableSearch').value = filters.tableSearch;
            }
            // Update timestamp display after loading source filter
            updateTimestampDisplay();
        }
    } catch (e) {}
}

const BER_COSTS = { A: 800, B: 1200, C: 1600, D: 2000, E: 2500, F: 3000, G: 3500 };
const AVG_HEATING = 2000;

function parseCSV(text, source) {
    const lines = text.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i] || '');

        // Normalize field names between sources
        obj.source = source;
        obj.priceNum = parseInt(obj.price_num) || parseInt(obj.price.replace(/[^0-9]/g, '')) || 0;
        // Handle "2 Bed" or "2" format
        obj.bedsNum = parseInt(obj.beds) || 0;
        obj.sizeNum = parseFloat(obj.size_sqm) || 0;
        obj.daysNum = parseInt(obj.days_on_market) || 0;
        // For myhome listings, use BrochureMap coordinates if Location coordinates are 0 or empty
        if (source === 'myhome') {
            const lat = parseFloat(obj.latitude) || 0;
            const lng = parseFloat(obj.longitude) || 0;
            if (lat === 0 && lng === 0) {
                obj.lat = parseFloat(obj.brochure_latitude) || 0;
                obj.lng = parseFloat(obj.brochure_longitude) || 0;
            } else {
                obj.lat = lat;
                obj.lng = lng;
            }
        } else {
            obj.lat = parseFloat(obj.latitude) || 0;
            obj.lng = parseFloat(obj.longitude) || 0;
        }
        obj.pricePerSqm = obj.sizeNum > 0 ? Math.round(obj.priceNum / obj.sizeNum) : 0;
        obj.area = extractArea(obj.address);
        obj.heatingCost = obj.ber ? (BER_COSTS[obj.ber[0]] || 2200) : 2200;
        obj.heatingSaving = AVG_HEATING - obj.heatingCost;
        obj.inPreferredArea = isPreferredArea(obj.address);
        // Normalize beds display for table
        obj.bedsDisplay = obj.bedsNum ? obj.bedsNum + ' bed' : '-';

        return obj;
    });
}

// Preferred areas (South Dublin / North Wicklow coast)
const PREFERRED_AREAS = [
    'dun laoghaire', 'dunlaoghaire', 'dún laoghaire',
    'greystones', 'bray', 'blackrock', 'shankill',
    'sallynoggin', 'dalkey', 'killiney', 'glasthule',
    'monkstown', 'sandycove', 'glenageary', 'cabinteely',
    'foxrock', 'cornelscourt', 'loughlinstown', 'ballybrack',
    'kilmacud', 'stillorgan', 'mount merrion', 'booterstown',
    'rathmichael', 'carrickmines'
];

function isPreferredArea(address) {
    const lower = address.toLowerCase();
    return PREFERRED_AREAS.some(area => lower.includes(area));
}

async function loadTimestamps() {
    try {
        const [daftTimestamp, myhomeTimestamp] = await Promise.all([
            fetch('data/daft_scrape_timestamp.txt').then(r => r.ok ? r.text() : null).catch(() => null),
            fetch('data/myhome_scrape_timestamp.txt').then(r => r.ok ? r.text() : null).catch(() => null)
        ]);
        scrapeTimestamps.daft = daftTimestamp ? daftTimestamp.trim() : null;
        scrapeTimestamps.myhome = myhomeTimestamp ? myhomeTimestamp.trim() : null;
        updateTimestampDisplay();
    } catch (e) {
        console.error('Error loading timestamps:', e);
    }
}

function updateTimestampDisplay() {
    const sourceFilterEl = document.getElementById('filterSource');
    const timestampEl = document.getElementById('scrapeTimestamp');
    
    if (!sourceFilterEl || !timestampEl) {
        return; // Elements not ready yet
    }
    
    const sourceFilter = sourceFilterEl.value;
    const timestamp = scrapeTimestamps[sourceFilter];
    
    if (timestamp) {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                // Invalid date, show raw timestamp
                timestampEl.textContent = `Last scraped: ${timestamp}`;
            } else {
                const formatted = date.toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                timestampEl.textContent = `Last scraped: ${formatted}`;
            }
        } catch (e) {
            timestampEl.textContent = `Last scraped: ${timestamp}`;
        }
    } else {
        timestampEl.textContent = '';
    }
}

async function loadData() {
    showLoading(true);
    try {
        // Load timestamps
        await loadTimestamps();
        
        // Load both data sources in parallel
        const [daftResponse, myhomeResponse] = await Promise.all([
            fetch('data/daft_listings.csv'),
            fetch('data/myhome_listings.csv').catch(() => null)
        ]);

        if (!daftResponse.ok) throw new Error('Failed to load Daft data');

        // Parse Daft data
        const daftText = await daftResponse.text();
        const daftData = parseCSV(daftText, 'daft');

        // Parse MyHome data if available
        let myhomeData = [];
        if (myhomeResponse && myhomeResponse.ok) {
            const myhomeText = await myhomeResponse.text();
            myhomeData = parseCSV(myhomeText, 'myhome');
        }

        // Combine both sources
        allData = [...daftData, ...myhomeData].filter(d => d.priceNum > 0);

    areaStats = {};
    allData.forEach(d => {
        if (!areaStats[d.area]) areaStats[d.area] = { days: [], pps: [], prices: [], count: 0, types: {} };
        const s = areaStats[d.area];
        s.count++;
        if (d.daysNum > 0) s.days.push(d.daysNum);
        if (d.pricePerSqm > 0) s.pps.push(d.pricePerSqm);
        s.prices.push(d.priceNum);
        s.types[d.property_type] = (s.types[d.property_type] || 0) + 1;
    });

    const allDays = allData.filter(d => d.daysNum > 0).map(d => d.daysNum);
    const medianDays = allDays.sort((a,b) => a-b)[Math.floor(allDays.length / 2)] || 60;

    const allPrices = allData.map(d => d.priceNum).sort((a,b) => a-b);
    const p25 = allPrices[Math.floor(allPrices.length * 0.25)];
    const p75 = allPrices[Math.floor(allPrices.length * 0.75)];

    Object.keys(areaStats).forEach(area => {
        const s = areaStats[area];
        s.avgDays = s.days.length ? s.days.reduce((a,b) => a+b, 0) / s.days.length : medianDays;
        s.avgPPS = s.pps.length ? s.pps.reduce((a,b) => a+b, 0) / s.pps.length : 0;
        s.avgPrice = s.prices.reduce((a,b) => a+b, 0) / s.prices.length;
        s.minPrice = Math.min(...s.prices);
        s.maxPrice = Math.max(...s.prices);
        s.demandScore = Math.max(0, Math.min(100, 100 - (s.avgDays / medianDays * 50)));
        s.tier = s.avgPrice < p25 ? 'affordable' : s.avgPrice > p75 ? 'premium' : 'midrange';
    });

    const allPPS = allData.filter(d => d.pricePerSqm > 0).map(d => d.pricePerSqm).sort((a,b) => a-b);
    globalStats = { medianDays, allPPS };

    allData.forEach(d => {
        d.desirability = calcDesirability(d);
        d.badges = calcBadges(d);
        d.ppsPercentile = calcPercentile(d.pricePerSqm, allPPS);
    });

    filteredData = [...allData];
    initDashboard();
    loadFilters();
    applyFilters();
    showLoading(false);
    } catch (error) {
        showLoading(false);
        showError('Unable to load property data. Please refresh the page to try again.');
        console.error('Data load error:', error);
    }
}

function calcDesirability(d) {
    let score = 0;
    let breakdown = {};
    const area = areaStats[d.area] || {};

    const demandScore = area.demandScore || 50;
    score += demandScore * 0.40;
    breakdown.demand = { value: Math.round(demandScore), weight: 40, label: 'Area Demand', desc: area.avgDays ? 'Avg ' + Math.round(area.avgDays) + ' days to sell' : 'Unknown' };

    let valueScore = 50;
    if (d.pricePerSqm > 0 && area.avgPPS > 0) {
        const r = d.pricePerSqm / area.avgPPS;
        valueScore = r < 0.8 ? 100 : r < 0.95 ? 75 : r < 1.1 ? 50 : 25;
    }
    score += valueScore * 0.25;
    breakdown.value = { value: valueScore, weight: 25, label: 'Value for Area', desc: area.avgPPS ? 'Area avg ' + area.avgPPS.toLocaleString() + '/m2' : 'Unknown' };

    const berScores = { A: 100, B: 80, C: 60, D: 40, E: 25, F: 15, G: 10 };
    const berScore = d.ber ? (berScores[d.ber[0]] || 30) : 30;
    score += berScore * 0.20;
    breakdown.ber = { value: berScore, weight: 20, label: 'Energy Efficiency', desc: d.ber ? 'BER ' + d.ber + ' = ~€' + d.heatingCost + '/yr heating' : 'No BER rating' };

    const typeScores = { Detached: 100, 'Semi-D': 85, Semi: 85, Bungalow: 80, Terrace: 70, End: 75 };
    let typeScore = 60;
    for (const [t, p] of Object.entries(typeScores)) {
        if (d.property_type && d.property_type.includes(t)) { typeScore = p; break; }
    }
    score += typeScore * 0.15;
    breakdown.type = { value: typeScore, weight: 15, label: 'Property Type', desc: d.property_type || 'Unknown type' };

    const level = score >= 70 ? 'hot' : score >= 50 ? 'warm' : 'cool';
    return { score: Math.round(score), level, breakdown };
}

function calcBadges(d) {
    const badges = [];
    const area = areaStats[d.area] || {};

    // Under 500k, 3+ bed, good BER, decent size - ideal starter home
    if (d.priceNum <= 500000 && d.bedsNum >= 3 && d.ber && 'ABC'.includes(d.ber[0]) && d.sizeNum >= 80) {
        badges.push({ type: 'ftb', label: 'Starter home' });
    }

    // Been on market a while - room to negotiate
    if (d.daysNum >= 90) {
        badges.push({ type: 'negotiate', label: 'Negotiable' });
    }

    // Large property, priced well below area average
    if (d.sizeNum >= 100 && area.avgPPS && d.pricePerSqm < area.avgPPS * 0.85 && area.tier !== 'premium') {
        badges.push({ type: 'gem', label: 'Below market' });
    }

    return badges;
}

function calcPercentile(value, sortedArray) {
    if (!value || !sortedArray.length) return 50;
    let count = 0;
    for (const v of sortedArray) { if (v < value) count++; else break; }
    return Math.round((1 - count / sortedArray.length) * 100);
}

function parseCSVLine(line) {
    const r = []; let c = '', q = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') q = !q;
        else if (line[i] === ',' && !q) { r.push(c.trim()); c = ''; }
        else c += line[i];
    }
    r.push(c.trim()); return r;
}

function extractArea(addr) {
    const p = addr.split(',');
    if (p.length >= 2) {
        let a = p[p.length - 2].trim().replace(/Dublin \d+/gi, '').trim();
        return a || p[p.length - 2].trim();
    }
    return 'Dublin';
}

function initDashboard() {
    tableData = filteredData.slice();
    updateStats();
    genInsights();
    initMap();
    initCharts();
    updateFilterCounts();
    updateSortIndicators();
    renderTable();
}

function updateStats() {
    const d = filteredData;
    const prices = d.map(x => x.priceNum).sort((a,b) => a-b);
    const pps = d.filter(x => x.pricePerSqm > 0).map(x => x.pricePerSqm).sort((a,b) => a-b);
    const days = d.filter(x => x.daysNum > 0).map(x => x.daysNum);
    const hot = d.filter(x => x.desirability.level === 'hot').length;
    const negotiable = d.filter(x => x.daysNum >= 90).length;

    // Source counts
    const daftCount = d.filter(x => x.source === 'daft').length;
    const myhomeCount = d.filter(x => x.source === 'myhome').length;

    document.getElementById('headerTotal').textContent = d.length.toLocaleString();

    // Hide source stats when that source is filtered out
    const sourceFilter = document.getElementById('filterSource').value;
    document.getElementById('statDaft').style.display = sourceFilter === 'myhome' ? 'none' : '';
    document.getElementById('statMyhome').style.display = sourceFilter === 'daft' ? 'none' : '';
    document.getElementById('headerDaft').textContent = daftCount.toLocaleString();
    document.getElementById('headerMyhome').textContent = myhomeCount.toLocaleString();
    document.getElementById('totalCount').textContent = allData.length.toLocaleString();
    document.getElementById('filteredCount').textContent = d.length.toLocaleString();
    document.getElementById('headerHot').textContent = hot;
    document.getElementById('statStale').textContent = negotiable;

    if (prices.length) {
        const avg = Math.round(prices.reduce((a,b) => a+b, 0) / prices.length);
        const med = prices[Math.floor(prices.length / 2)];
        document.getElementById('headerMedian').textContent = formatPrice(med);
        document.getElementById('statAvgPrice').textContent = formatPrice(avg);
        document.getElementById('statPriceSub').textContent = formatPrice(prices[0]) + ' - ' + formatPrice(prices[prices.length-1]);
    }
    if (pps.length) {
        const avgPPS = Math.round(pps.reduce((a,b) => a+b, 0) / pps.length);
        document.getElementById('statPPS').textContent = '€' + avgPPS.toLocaleString();
    }
    if (days.length) {
        document.getElementById('statDays').textContent = Math.round(days.reduce((a,b)=>a+b,0)/days.length) + ' days';
    }
}

function genInsights() {
    const c = document.getElementById('insightsBar');
    c.textContent = '';

    const topAreas = Object.entries(areaStats)
        .filter(([_,v]) => v.days.length >= 3)
        .sort((a,b) => b[1].demandScore - a[1].demandScore)
        .slice(0, 3)
        .map(([a]) => a);

    if (topAreas.length) {
        const chip = document.createElement('div');
        chip.className = 'insight-chip hot';
        chip.textContent = 'Hottest: ' + topAreas.join(', ');
        c.appendChild(chip);
    }

    const negotiable = filteredData.filter(x => x.daysNum >= 90).length;
    if (negotiable) {
        const chip = document.createElement('div');
        chip.className = 'insight-chip warn';
        chip.textContent = negotiable + ' listed 90+ days';
        c.appendChild(chip);
    }

    const starterCount = filteredData.filter(x => x.badges.some(b => b.type === 'ftb')).length;
    if (starterCount) {
        const chip = document.createElement('div');
        chip.className = 'insight-chip';
        chip.textContent = starterCount + ' starter homes';
        c.appendChild(chip);
    }
}

function formatPrice(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
    return '€' + Math.round(num / 1000) + 'k';
}

// Escape HTML entities to prevent XSS when inserting text into HTML strings
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showAreaInsights(area) {
    const s = areaStats[area];
    if (!s || s.count < 5) {
        document.getElementById('areaInsights').style.display = 'none';
        return;
    }

    const panel = document.getElementById('areaInsights');
    const title = document.getElementById('areaInsightTitle');
    const grid = document.getElementById('areaInsightsGrid');

    title.textContent = area + ' Insights';

    const tierLabels = { affordable: 'Affordable', midrange: 'Mid-range', premium: 'Premium' };

    grid.textContent = '';

    const stats = [
        { label: 'Avg Price', value: formatPrice(s.avgPrice) },
        { label: 'Price Range', value: formatPrice(s.minPrice) + ' - ' + formatPrice(s.maxPrice) },
        { label: 'Avg Days Listed', value: Math.round(s.avgDays) + ' days' },
        { label: 'Properties', value: s.count, tier: s.tier, tierLabel: tierLabels[s.tier] }
    ];

    stats.forEach(stat => {
        const div = document.createElement('div');
        div.className = 'area-stat';

        const labelEl = document.createElement('div');
        labelEl.className = 'area-stat-label';
        labelEl.textContent = stat.label;
        div.appendChild(labelEl);

        const valueEl = document.createElement('div');
        valueEl.className = 'area-stat-value';
        valueEl.textContent = stat.value;
        div.appendChild(valueEl);

        if (stat.tier) {
            const tagEl = document.createElement('span');
            tagEl.className = 'area-tag ' + stat.tier;
            tagEl.textContent = stat.tierLabel;
            div.appendChild(tagEl);
        }

        grid.appendChild(div);
    });

    panel.style.display = 'block';
}

function toggleAreaInsights() {
    const grid = document.getElementById('areaInsightsGrid');
    grid.style.display = grid.style.display === 'none' ? 'grid' : 'none';
}

function initMap() {
    map = L.map('map').setView([53.33, -6.26], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: 'OSM CartoDB'
    }).addTo(map);

    markers = L.markerClusterGroup({
        iconCreateFunction: function(cl) {
            return L.divIcon({
                html: '<div style="background:#C05746;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font:600 12px Outfit,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.2);">' + cl.getChildCount() + '</div>',
                className: '',
                iconSize: [32, 32]
            });
        }
    });

    updateMapMarkers();
    map.addLayer(markers);
}

function updateMapMarkers() {
    if (!markers) return;
    markers.clearLayers();

    // Center map based on filter
    var areaFilter = document.getElementById('filterArea').value;
    if (areaFilter === 'preferred') {
        map.setView([53.27, -6.12], 12);
    } else if (filteredData.length > 0) {
        // Fit to bounds of filtered data
        var lats = filteredData.filter(function(d) { return d.lat; }).map(function(d) { return d.lat; });
        var lngs = filteredData.filter(function(d) { return d.lng; }).map(function(d) { return d.lng; });
        if (lats.length > 0) {
            var bounds = [[Math.min.apply(null, lats), Math.min.apply(null, lngs)], [Math.max.apply(null, lats), Math.max.apply(null, lngs)]];
            map.fitBounds(bounds, { padding: [20, 20] });
        }
    } else {
        map.setView([53.33, -6.26], 11);
    }
    filteredData.forEach(d => {
        if (d.lat && d.lng) {
            const colors = { hot: '#EF4444', warm: '#F97316', cool: '#3B82F6' };
            const m = L.circleMarker([d.lat, d.lng], {
                radius: 6,
                fillColor: colors[d.desirability.level],
                color: '#fff',
                weight: 2,
                fillOpacity: 0.9
            });

            // Build popup using DOM methods to prevent XSS
            const popup = document.createElement('div');
            popup.style.cssText = 'font-size:13px;min-width:200px;';

            const addrDiv = document.createElement('div');
            addrDiv.style.cssText = 'font-weight:600;margin-bottom:8px;';
            addrDiv.textContent = d.address.substring(0, 45) + (d.address.length > 45 ? '...' : '');
            popup.appendChild(addrDiv);

            const priceRow = document.createElement('div');
            priceRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px;';
            const priceLabel = document.createElement('span');
            priceLabel.style.color = '#7a7067';
            priceLabel.textContent = 'Price';
            const priceVal = document.createElement('strong');
            priceVal.textContent = d.price;
            priceRow.appendChild(priceLabel);
            priceRow.appendChild(priceVal);
            popup.appendChild(priceRow);

            const sizeRow = document.createElement('div');
            sizeRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px;';
            const sizeLabel = document.createElement('span');
            sizeLabel.style.color = '#7a7067';
            sizeLabel.textContent = 'Size';
            const sizeVal = document.createElement('span');
            sizeVal.textContent = d.beds + ' bed - ' + (d.size_sqm || '?') + 'm² - ' + (d.ber || 'No BER');
            sizeRow.appendChild(sizeLabel);
            sizeRow.appendChild(sizeVal);
            popup.appendChild(sizeRow);

            const scoreRow = document.createElement('div');
            scoreRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px;';
            const scoreLabel = document.createElement('span');
            scoreLabel.style.color = '#7a7067';
            scoreLabel.textContent = 'Score';
            const scoreVal = document.createElement('span');
            scoreVal.style.cssText = 'font-weight:600;color:' + colors[d.desirability.level] + ';';
            scoreVal.textContent = d.desirability.score + '/100';
            scoreRow.appendChild(scoreLabel);
            scoreRow.appendChild(scoreVal);
            popup.appendChild(scoreRow);

            if (d.badges.length > 0) {
                const badgeDiv = document.createElement('div');
                badgeDiv.style.marginBottom = '8px';
                d.badges.forEach(function(b) {
                    const badge = document.createElement('span');
                    badge.style.cssText = 'background:#f5f5f5;padding:2px 6px;border-radius:4px;font-size:10px;margin-right:4px;';
                    badge.textContent = b.label;
                    badgeDiv.appendChild(badge);
                });
                popup.appendChild(badgeDiv);
            }

            const link = document.createElement('a');
            link.href = d.url;
            link.target = '_blank';
            link.style.color = '#C05746';
            link.textContent = 'View on ' + (d.source === 'daft' ? 'Daft' : 'MyHome');
            popup.appendChild(link);

            m.bindPopup(popup);
            markers.addLayer(m);
        }
    });
}

function initCharts() {
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = '#7A7067';

    const priceBuckets = [0, 300, 400, 500, 600, 700, 800, 1000, 1500, 2000, 10000];
    const priceLabels = ['<300k', '300-400k', '400-500k', '500-600k', '600-700k', '700-800k', '800k-1M', '1-1.5M', '1.5-2M', '2M+'];
    const priceCounts = new Array(10).fill(0);
    filteredData.forEach(d => {
        const pk = d.priceNum / 1000;
        for (let i = 0; i < 10; i++) {
            if (pk >= priceBuckets[i] && pk < priceBuckets[i + 1]) { priceCounts[i]++; break; }
        }
    });

    if (priceChart) priceChart.destroy();
    priceChart = new Chart(document.getElementById('priceChart'), {
        type: 'bar',
        data: {
            labels: priceLabels,
            datasets: [{
                data: priceCounts,
                backgroundColor: '#C05746',
                borderRadius: 6,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#E8E4DE' }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false } }
            }
        }
    });

    // Calculate area stats from filtered data
    const filteredAreaStats = {};
    filteredData.forEach(function(d) {
        if (!filteredAreaStats[d.area]) filteredAreaStats[d.area] = { days: [], count: 0 };
        filteredAreaStats[d.area].count++;
        if (d.daysNum > 0) filteredAreaStats[d.area].days.push(d.daysNum);
    });

    const filteredDays = filteredData.filter(function(d) { return d.daysNum > 0; }).map(function(d) { return d.daysNum; });
    const filteredMedianDays = filteredDays.length ? filteredDays.sort(function(a,b) { return a-b; })[Math.floor(filteredDays.length / 2)] : 60;

    const areaData = Object.entries(filteredAreaStats)
        .filter(function(e) { return e[1].days.length >= 3; })
        .map(function(e) {
            var avgDays = e[1].days.reduce(function(a,b) { return a+b; }, 0) / e[1].days.length;
            var demand = Math.max(0, Math.min(100, 100 - (avgDays / filteredMedianDays * 50)));
            return { area: e[0].length > 14 ? e[0].substring(0, 14) + '...' : e[0], demand: Math.round(demand) };
        })
        .sort(function(a, b) { return b.demand - a.demand; })
        .slice(0, 8);

    if (areaChart) areaChart.destroy();
    areaChart = new Chart(document.getElementById('areaChart'), {
        type: 'bar',
        data: {
            labels: areaData.map(function(a) { return a.area; }),
            datasets: [{
                data: areaData.map(function(a) { return a.demand; }),
                backgroundColor: areaData.map(function(_, i) { return i < 3 ? '#6B9080' : '#A8C5B8'; }),
                borderRadius: 6,
                maxBarThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { max: 100, grid: { color: '#E8E4DE' }, border: { display: false } },
                y: { grid: { display: false }, border: { display: false } }
            }
        }
    });

    const daysBuckets = [0, 7, 30, 60, 90, 180, 365, 9999];
    const daysLabels = ['<7d', '7-30d', '30-60d', '60-90d', '90-180d', '180-365d', '1yr+'];
    const daysCounts = new Array(7).fill(0);
    filteredData.forEach(d => {
        for (let i = 0; i < 7; i++) {
            if (d.daysNum >= daysBuckets[i] && d.daysNum < daysBuckets[i + 1]) { daysCounts[i]++; break; }
        }
    });

    if (daysChart) daysChart.destroy();
    daysChart = new Chart(document.getElementById('daysChart'), {
        type: 'bar',
        data: {
            labels: daysLabels,
            datasets: [{
                data: daysCounts,
                backgroundColor: daysCounts.map(function(_, i) { return i < 2 ? '#6B9080' : i < 4 ? '#E0A458' : '#C05746'; }),
                borderRadius: 6,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#E8E4DE' }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false } }
            }
        }
    });
}

function updateFilterCounts() {
    var counts = {
        all: filteredData.length,
        top: filteredData.filter(function(d) { return d.desirability.score >= 70; }).length,
        starter: filteredData.filter(function(d) { return d.badges.some(function(b) { return b.type === 'ftb'; }); }).length,
        negotiable: filteredData.filter(function(d) { return d.daysNum >= 90; }).length
    };

    document.querySelectorAll('.filter-tab').forEach(function(tab) {
        var filter = tab.dataset.filter;
        var count = counts[filter] || 0;
        var label = tab.dataset.label;
        // Update only the text node, preserve icon and tooltip
        var textNode = tab.firstChild;
        if (textNode && textNode.nodeType === 3) {
            textNode.textContent = label + ' (' + count + ') ';
        }
    });
}

function applyTableFilters() {
    // Ensure filteredData exists and is an array
    if (!filteredData || !Array.isArray(filteredData)) {
        console.error('filteredData is not available');
        tableData = [];
        renderTable();
        return;
    }
    
    // Filter filteredData into tableData based on table-level filters
    tableData = filteredData.filter(function(d) {
        // Apply table-level filter
        if (currentTableFilter === 'top' && d.desirability.score < 70) return false;
        if (currentTableFilter === 'starter' && !d.badges.some(function(b) { return b.type === 'ftb'; })) return false;
        if (currentTableFilter === 'negotiable' && d.daysNum < 90) return false;

        // Apply search
        if (tableSearchTerm && !d.address.toLowerCase().includes(tableSearchTerm)) return false;

        return true;
    });

    updateFilterCounts();
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) {
        console.error('Table body element not found');
        return;
    }
    
    // Explicitly clear the table body to ensure fresh render
    while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
    }

    if (tableData.length === 0) {
        showEmptyState(true);
        return;
    }
    showEmptyState(false);

    const sorted = tableData.slice().sort(function(a, b) {
        let va = currentSort.key === 'desirability.score' ? a.desirability.score : a[currentSort.key];
        let vb = currentSort.key === 'desirability.score' ? b.desirability.score : b[currentSort.key];
        if (typeof va === 'string') return currentSort.dir * va.localeCompare(vb);
        return currentSort.dir * ((va || 0) - (vb || 0));
    });

    sorted.slice(0, 500).forEach(function(d, idx) {
        const tr = document.createElement('tr');
        tr.className = 'row-' + d.desirability.level + (d.inPreferredArea ? ' preferred-area' : '');
        const des = d.desirability;
        const daysClass = d.daysNum >= 90 ? 'days-old' : d.daysNum <= 7 && d.daysNum > 0 ? 'days-new' : '';
        const berClass = d.ber ? (d.ber[0] <= 'B' ? 'ber-good' : d.ber[0] <= 'C' ? 'ber-ok' : 'ber-bad') : '';
        const isCompared = compareList.includes(d.listing_id);

        // Compare checkbox
        const td1 = document.createElement('td');
        const checkDiv = document.createElement('div');
        checkDiv.className = 'compare-check' + (isCompared ? ' checked' : '');
        checkDiv.onclick = function() { toggleCompare(d.listing_id); };
        td1.appendChild(checkDiv);
        tr.appendChild(td1);

        // Score
        const td2 = document.createElement('td');
        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'score-cell';
        const scoreBadge = document.createElement('span');
        scoreBadge.className = 'score-badge score-' + des.level;
        scoreBadge.textContent = des.score;
        scoreBadge.onclick = function(e) { showScoreBreakdown(e, d); };
        scoreDiv.appendChild(scoreBadge);
        td2.appendChild(scoreDiv);
        tr.appendChild(td2);

        // Property address with badges - address is clickable link
        const td3 = document.createElement('td');
        const addrDiv = document.createElement('div');
        addrDiv.style.maxWidth = '280px';
        const addrLink = document.createElement('a');
        addrLink.href = d.url;
        addrLink.target = '_blank';
        addrLink.style.fontWeight = '500';
        addrLink.style.color = 'var(--text)';
        addrLink.textContent = d.address.substring(0, 40) + (d.address.length > 40 ? '...' : '');
        addrDiv.appendChild(addrLink);

        // Source badge
        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'source-badge source-' + d.source;
        sourceBadge.textContent = d.source === 'daft' ? 'Daft' : 'MyHome';
        addrDiv.appendChild(sourceBadge);

        if (d.badges.length > 0) {
            const badgeRow = document.createElement('div');
            badgeRow.className = 'badge-row';
            d.badges.forEach(function(b) {
                const badge = document.createElement('span');
                badge.className = 'badge badge-' + b.type;
                badge.textContent = b.label;
                badgeRow.appendChild(badge);
            });
            addrDiv.appendChild(badgeRow);
        }
        td3.appendChild(addrDiv);
        tr.appendChild(td3);

        // Price with percentile
        const td4 = document.createElement('td');
        const priceDiv = document.createElement('div');
        priceDiv.className = 'price-cell';
        priceDiv.textContent = d.price;
        td4.appendChild(priceDiv);
        if (d.ppsPercentile >= 75) {
            const percSpan = document.createElement('span');
            percSpan.className = 'percentile good';
            percSpan.textContent = 'Top ' + (100 - d.ppsPercentile) + '% value';
            td4.appendChild(percSpan);
        }
        tr.appendChild(td4);

        // Price per sqm
        const td5 = document.createElement('td');
        td5.textContent = d.pricePerSqm > 0 ? d.pricePerSqm.toLocaleString() : '-';
        tr.appendChild(td5);

        // Beds
        const td6 = document.createElement('td');
        td6.textContent = d.bedsNum || '-';
        tr.appendChild(td6);

        // Size
        const td7 = document.createElement('td');
        td7.textContent = d.size_sqm ? d.size_sqm + 'm2' : '-';
        tr.appendChild(td7);

        // BER with running cost
        const td8 = document.createElement('td');
        const berSpan = document.createElement('span');
        berSpan.className = berClass;
        berSpan.textContent = d.ber || '-';
        td8.appendChild(berSpan);
        if (d.ber) {
            const costSpan = document.createElement('span');
            const costClass = d.heatingSaving > 0 ? 'good' : d.heatingSaving < -500 ? 'bad' : '';
            costSpan.className = 'running-cost ' + costClass;
            costSpan.textContent = '~€' + d.heatingCost + '/yr' + (d.heatingSaving > 0 ? ' (save €' + d.heatingSaving + ')' : '');
            td8.appendChild(document.createElement('br'));
            td8.appendChild(costSpan);
        }
        tr.appendChild(td8);

        // Days
        const td9 = document.createElement('td');
        td9.className = daysClass;
        td9.textContent = d.daysNum || '-';
        tr.appendChild(td9);

        // Link - styled as button
        const td10 = document.createElement('td');
        const link = document.createElement('a');
        link.href = d.url;
        link.target = '_blank';
        link.textContent = d.source === 'daft' ? 'Daft' : 'MyHome';
        var linkBg = d.source === 'daft' ? '#1565C0' : '#2E7D32';
        link.style.cssText = 'display:inline-block;padding:4px 10px;background:' + linkBg + ';color:white;border-radius:4px;font-size:11px;font-weight:500;text-decoration:none;';
        td10.appendChild(link);
        tr.appendChild(td10);

        tbody.appendChild(tr);
    });
}

function showScoreBreakdown(event, d) {
    event.stopPropagation();
    const tooltip = document.getElementById('scoreTooltip');
    const breakdown = document.getElementById('scoreBreakdown');
    const b = d.desirability.breakdown;

    breakdown.textContent = '';
    Object.entries(b).forEach(function(entry) {
        const data = entry[1];
        const factor = document.createElement('div');
        factor.className = 'score-factor';

        const left = document.createElement('div');
        const label = document.createElement('div');
        label.className = 'score-factor-label';
        label.textContent = data.label + ' (' + data.weight + '%)';
        left.appendChild(label);
        const desc = document.createElement('div');
        desc.style.fontSize = '11px';
        desc.style.color = 'var(--text-light)';
        desc.textContent = data.desc;
        left.appendChild(desc);
        factor.appendChild(left);

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.alignItems = 'center';
        right.style.gap = '8px';
        const bar = document.createElement('div');
        bar.className = 'score-factor-bar';
        const fill = document.createElement('div');
        fill.className = 'score-factor-fill';
        fill.style.width = data.value + '%';
        bar.appendChild(fill);
        right.appendChild(bar);
        const val = document.createElement('span');
        val.className = 'score-factor-value';
        val.textContent = data.value;
        right.appendChild(val);
        factor.appendChild(right);

        breakdown.appendChild(factor);
    });

    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
    tooltip.style.top = (rect.bottom + 8) + 'px';
    tooltip.classList.add('active');

    document.addEventListener('click', hideScoreBreakdown);
}

function hideScoreBreakdown() {
    document.getElementById('scoreTooltip').classList.remove('active');
    document.removeEventListener('click', hideScoreBreakdown);
}

function toggleCompare(id) {
    const idx = compareList.indexOf(id);
    if (idx >= 0) {
        compareList.splice(idx, 1);
    } else if (compareList.length < 3) {
        compareList.push(id);
    }
    updateComparePanel();
    renderTable();
}

function updateComparePanel() {
    const panel = document.getElementById('comparePanel');
    const grid = document.getElementById('compareGrid');

    if (compareList.length === 0) {
        panel.classList.remove('active');
        return;
    }

    panel.classList.add('active');
    grid.textContent = '';

    for (let i = 0; i < 3; i++) {
        const slot = document.createElement('div');
        slot.className = 'compare-slot';

        if (compareList[i]) {
            const d = allData.find(function(x) { return x.listing_id === compareList[i]; });
            if (d) {
                slot.classList.add('filled');

                const removeBtn = document.createElement('button');
                removeBtn.className = 'compare-remove';
                removeBtn.textContent = 'x';
                removeBtn.onclick = function() { toggleCompare(d.listing_id); };
                slot.appendChild(removeBtn);

                const prop = document.createElement('div');
                prop.className = 'compare-property';

                const title = document.createElement('div');
                title.className = 'compare-property-title';
                title.textContent = d.address.substring(0, 30) + '...';
                prop.appendChild(title);

                const details = [
                    ['Price', d.price],
                    ['Per m2', d.pricePerSqm ? d.pricePerSqm.toLocaleString() : '-'],
                    ['Size', d.beds + ' bed - ' + (d.size_sqm || '?') + 'm2'],
                    ['BER', d.ber || '-'],
                    ['Score', d.desirability.score + '/100'],
                    ['Heating', '~€' + d.heatingCost + '/yr']
                ];

                details.forEach(function(detail) {
                    const row = document.createElement('div');
                    row.className = 'compare-property-detail';
                    const labelSpan = document.createElement('span');
                    labelSpan.textContent = detail[0];
                    row.appendChild(labelSpan);
                    const valStrong = document.createElement('strong');
                    valStrong.textContent = detail[1];
                    row.appendChild(valStrong);
                    prop.appendChild(row);
                });

                slot.appendChild(prop);
            } else {
                const empty = document.createElement('div');
                empty.className = 'compare-slot-empty';
                empty.textContent = 'Select a property';
                slot.appendChild(empty);
            }
        } else {
            const empty = document.createElement('div');
            empty.className = 'compare-slot-empty';
            empty.textContent = 'Select a property';
            slot.appendChild(empty);
        }

        grid.appendChild(slot);
    }
}

function clearCompare() {
    compareList = [];
    updateComparePanel();
    renderTable();
}

function applyFilters() {
    const loc = document.getElementById('filterLocation').value.toLowerCase();
    const areaFilter = document.getElementById('filterArea').value;
    const sourceFilter = document.getElementById('filterSource').value;
    
    // Update timestamp display when source changes
    updateTimestampDisplay();

    filteredData = allData.filter(function(d) {
        const maxP = document.getElementById('filterPrice').value;
        const minB = document.getElementById('filterBeds').value;
        const type = document.getElementById('filterType').value;
        const ber = document.getElementById('filterBer').value;
        const des = document.getElementById('filterDesire').value;

        if (sourceFilter && d.source !== sourceFilter) return false;
        if (areaFilter === 'preferred' && !isPreferredArea(d.address)) return false;
        if (loc && !d.address.toLowerCase().includes(loc) && !d.area.toLowerCase().includes(loc)) return false;
        if (maxP && d.priceNum > parseInt(maxP)) return false;
        if (minB && d.bedsNum < parseInt(minB)) return false;
        if (type && (!d.property_type || !d.property_type.includes(type))) return false;
        if (ber) {
            const order = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
            if (!d.ber || order.indexOf(d.ber[0]) > order.indexOf(ber)) return false;
        }
        if (des === 'hot' && d.desirability.level !== 'hot') return false;
        if (des === 'warm' && d.desirability.level === 'cool') return false;
        return true;
    });

    if (loc) {
        const matchingArea = Object.keys(areaStats).find(function(a) { return a.toLowerCase().includes(loc); });
        if (matchingArea) showAreaInsights(matchingArea);
    } else {
        document.getElementById('areaInsights').style.display = 'none';
    }

    updateStats();
    genInsights();
    updateMapMarkers();
    initCharts();
    
    // Ensure table is updated with filtered results
    applyTableFilters();
    
    cleanupCompareList();
    saveFilters();
}

function cleanupCompareList() {
    // Remove any compared properties that are no longer in filtered data
    var filteredIds = filteredData.map(function(d) { return d.listing_id; });
    compareList = compareList.filter(function(id) {
        return filteredIds.includes(id);
    });
    updateComparePanel();
}

function resetFilters() {
    var selects = document.querySelectorAll('.filters-card select');
    for (var i = 0; i < selects.length; i++) selects[i].value = '';
    document.getElementById('filterLocation').value = '';
    document.getElementById('filterArea').value = '';
    document.getElementById('filterSource').value = '';
    document.getElementById('tableSearch').value = '';
    document.getElementById('areaInsights').style.display = 'none';
    tableSearchTerm = '';
    currentTableFilter = 'all';
    document.querySelectorAll('.filter-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.filter === 'all');
    });
    filteredData = allData.slice();
    try { localStorage.removeItem('dublinHomeFilters'); } catch (e) {}
    applyFilters();
}

function toggleFilters() {
    var card = document.querySelector('.filters-card');
    var row = document.querySelector('.filters-collapsible');
    card.classList.toggle('open');
    row.classList.toggle('open');
}

function toggleCharts() {
    document.querySelector('.charts-section').classList.toggle('open');
}

function sortTable(key) {
    if (currentSort.key === key) {
        currentSort.dir *= -1;
    } else {
        currentSort = { key: key, dir: -1 };
    }
    updateSortIndicators();
    renderTable();
}

function updateSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach(function(th) {
        th.classList.remove('sorted', 'asc', 'desc');
        if (th.dataset.sort === currentSort.key) {
            th.classList.add('sorted');
            th.classList.add(currentSort.dir === -1 ? 'desc' : 'asc');
        }
    });
}

var filterTimeout;
document.getElementById('filterLocation').addEventListener('input', function() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(applyFilters, 300);
});

// Table filter tabs with tooltips
document.querySelectorAll('.filter-tab').forEach(function(tab) {
    // Store original label
    tab.dataset.label = tab.textContent;

    // Add info icon and tooltip if has data-tip
    if (tab.dataset.tip) {
        var icon = document.createElement('span');
        icon.className = 'info-icon';
        icon.textContent = 'i';
        tab.appendChild(icon);

        var tooltip = document.createElement('span');
        tooltip.className = 'filter-tooltip';
        tooltip.textContent = tab.dataset.tip;
        tab.appendChild(tooltip);
    }

    tab.addEventListener('click', function() {
        document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        currentTableFilter = tab.dataset.filter;
        applyTableFilters();
        saveFilters();
    });
});

// Table search
var tableSearchTimeout;
document.getElementById('tableSearch').addEventListener('input', function(e) {
    clearTimeout(tableSearchTimeout);
    tableSearchTerm = e.target.value.toLowerCase();
    tableSearchTimeout = setTimeout(function() {
        applyTableFilters();
        saveFilters();
    }, 200);
});

loadData();
