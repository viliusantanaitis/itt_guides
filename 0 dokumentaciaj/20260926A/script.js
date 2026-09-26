// Dinamiškai sugeneruojame visą UI turinį į vienintelį index.html konteinerį
const appContainer = document.getElementById('app');
appContainer.innerHTML = `
    <div class="search-container">
        <input type="text" id="search-input" placeholder="Search...">
        <button id="search-button">Search</button>
        <button id="show-all-button">Filters Reset</button>

        <div class="filter-group">
            <label for="city-select">City:</label>
            <select id="city-select">
                <option value="">All cities</option>
            </select>
        </div>

        <div class="filter-group">
            <label for="theme-select">Theme:</label>
            <select id="theme-select">
                <option value="">All themes</option>
            </select>
        </div>

        <div class="filter-group">
            <label for="tops-select">Tops:</label>
            <select id="tops-select">
                <option value="">All tops</option>
            </select>
        </div>

        <div class="filter-group">
            <label for="distance-select">Distance km:</label>
            <select id="distance-select">
                <option value="">All distances</option>
                <option value="1">1 km</option>
                <option value="2">2 km</option>
                <option value="3">3 km</option>
                <option value="4">4 km</option>
                <option value="5">5 km</option>
                <option value="6">6 km</option>
                <option value="7">7 km</option>
                <option value="8">8 km</option>
                <option value="9">9 km</option>
                <option value="10">10 km</option>
            </select>
        </div>
    </div>
    
    <div id="map"></div>
`;

// Universal color map for themes
const themeColors = {
    'Old Town': '#FF3B30',
    'Historical Sites': '#FF9500',
    'Point of interest': '#FFCC00',
    'Museums': '#FF6B6B',
    'Cafes & Restaurants': '#34C759',
    'Nightlife': '#AF52DE',
    'Parks & Nature': '#30B0C7',
    'Family & Kids Entertainment': '#007AFF',
    'Culture': '#5856D6',
    'Bars & Clubs': '#E056FD',
    'Markets': '#8E8E93',
    'Promenades': '#A2845E',
    'Shopping & Services': '#636366',
    'SPA & Wellness': '#5AC8FA',
    'Transport system': '#4682B4',
    'Tours': '#8B4513',
    'Waterfronts & Beaches': '#FFD700'
};

// Ikonų kešas, kad nereikėtų jų pergeneruoti naršyklėje iš naujo kiekvienam taškui
const iconCache = {};

function createSvgIcon(color) {
    if (iconCache[color]) return iconCache[color];

    const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    `;
    const svgData = `data:image/svg+xml;base64,${btoa(svgContent)}`;
    iconCache[color] = svgData;
    return svgData;
}

function getMarkerColor(theme) {
    return themeColors[theme] || 'gray';
}

// Haversine formula to calculate distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Initialize the map
const map = L.map('map');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let markerGroup = L.featureGroup().addTo(map);
let userCoords = null; // Store user coordinates globally for distance filtering

async function fetchAndDisplayPlaces(params = {}) {
    try {
        const urlParams = new URLSearchParams(params).toString();
        const url = `http://127.0.0.1:8700/api/places/?${urlParams}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        let places = await response.json();
        
        // Handle distance filtering client-side if a distance limit is selected and user location is available
        const distanceSelect = document.getElementById('distance-select');
        const maxDistance = distanceSelect && distanceSelect.value ? parseFloat(distanceSelect.value) : null;

        if (maxDistance !== null && userCoords) {
            places = places.filter(place => {
                if (!place.coordinates) return false;
                const coords = place.coordinates.split(',');
                if (coords.length < 2) return false;
                const lat = parseFloat(coords[0].trim());
                const lon = parseFloat(coords[1].trim());
                if (isNaN(lat) || isNaN(lon)) return false;

                const dist = calculateDistance(userCoords.lat, userCoords.lon, lat, lon);
                return dist <= maxDistance;
            });
        }
        
        markerGroup.clearLayers();
        
        if (places.length === 0) {
            alert("No places found.");
            map.setView([52.5, 10.5], 5);
            return;
        }

        const foundMarkers = [];
        places.forEach(place => {
            let lat = NaN;
            let lon = NaN;
            
            if (place.coordinates) {
                const coords = place.coordinates.split(',');
                if (coords.length >= 2) {
                    lat = parseFloat(coords[0].trim());
                    lon = parseFloat(coords[1].trim());
                }
            }
            
            if (!isNaN(lat) && !isNaN(lon)) {
                const color = getMarkerColor(place.theme);
                const customIcon = L.icon({
                    iconUrl: createSvgIcon(color),
                    iconSize: [30, 45],
                    iconAnchor: [15, 45],
                    popupAnchor: [0, -45]
                });

                const marker = L.marker([lat, lon], {icon: customIcon});
                marker.bindPopup(`
                    <div style="width: 220px; text-align: left;">
                        ${place.image_url ? `<img src="${place.image_url}" alt="${place.name || ''}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;">` : ''}
                        <div style="font-size: 13px; line-height: 1.4;">
                            <b>Theme:</b> ${place.theme || ''}<br>
                            <b>Name:</b> ${place.name || ''}<br>
                            <b>Name Original:</b> ${place.name_original || ''}<br>
                            <b>Address:</b> ${place.address || ''}<br>
                            <b>Public Stop:</b> ${place.public_stop || ''}<br>
                            <b>Tops:</b> ${place.tops || ''}<br>
                            <b>Description:</b> ${place.description || ''}<br>
                        </div>
                    </div>
                `);
                markerGroup.addLayer(marker);
                foundMarkers.push(marker);
            }
        });
        
        if (foundMarkers.length > 0) {
            const foundGroup = L.featureGroup(foundMarkers);
            map.fitBounds(foundGroup.getBounds(), {padding: [50, 50]});
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function findUserLocation() {
    if ("geolocation" in navigator) {
        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);

        map.locate({setView: true, maxZoom: 16});

        function onLocationFound(e) {
            userCoords = { lat: e.latlng.lat, lon: e.latlng.lng };
            const radius = e.accuracy;
            const userIcon = L.icon({
                iconUrl: createSvgIcon('#007AFF'),
                iconSize: [30, 45],
                iconAnchor: [15, 45],
                popupAnchor: [0, -45]
            });

            L.marker(e.latlng, {icon: userIcon}).addTo(map)
                .bindPopup("You are here").openPopup();
            L.circle(e.latlng, radius).addTo(map);
        }

        function onLocationError(e) {
            console.error('Error getting location:', e.message);
            alert("Nepavyko aptikti jūsų vietos: " + e.message);
        }
    } else {
        console.log("Geolocation support is not available.");
    }
}

// Optimizuota filtravimo užkrova iš naujojo lengvo metaduomenų endpoint'o
async function initFilters() {
    try {
        const response = await fetch('http://127.0.0.1:8700/api/filters-meta/');
        const data = await response.json();
        
        const citySelect = document.getElementById('city-select');
        const topsSelect = document.getElementById('tops-select');
        const themeSelect = document.getElementById('theme-select');
        
        data.cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            citySelect.appendChild(option);
        });
        
        if (data.tops) {
            // Surikiuojame tops didėjimo tvarka ir sudedame į select
            const sortedTops = [...data.tops].sort((a, b) => Number(a) - Number(b));
            sortedTops.forEach(tops => {
                const option = document.createElement('option');
                option.value = tops;
                option.textContent = tops;
                topsSelect.appendChild(option);
            });
        }

        data.themes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme;
            option.textContent = theme;
            themeSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Klaida gaunant filtravimo metaduomenis:', error);
    }
}

// Paieškos ir filtravimo logika
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const showAllButton = document.getElementById('show-all-button');
const citySelect = document.getElementById('city-select');
const themeSelect = document.getElementById('theme-select');
const topsSelect = document.getElementById('tops-select');
const distanceSelect = document.getElementById('distance-select');

function applyAllFilters() {
    const params = {};
    if (citySelect && citySelect.value) params.city = citySelect.value;
    if (themeSelect && themeSelect.value) params.theme = themeSelect.value;
    if (topsSelect && topsSelect.value) params.tops = topsSelect.value;
    if (searchInput && searchInput.value) params.search = searchInput.value;
    
    fetchAndDisplayPlaces(params);
}

if (searchButton) {
    searchButton.addEventListener('click', () => {
        applyAllFilters();
    });
}

if (showAllButton) {
    showAllButton.addEventListener('click', () => {
        searchInput.value = '';
        citySelect.value = '';
        themeSelect.value = '';
        topsSelect.value = '';
        if (distanceSelect) distanceSelect.value = '';
        applyAllFilters();
    });
}

if (citySelect) citySelect.addEventListener('change', applyAllFilters);
if (themeSelect) themeSelect.addEventListener('change', applyAllFilters);
if (topsSelect) topsSelect.addEventListener('change', applyAllFilters);
if (distanceSelect) distanceSelect.addEventListener('change', applyAllFilters);

// Pradinis funkcijų iškvietimas
fetchAndDisplayPlaces();
findUserLocation();
initFilters();
