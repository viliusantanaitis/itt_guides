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

// Pakeista į L.icon su data URL, kad keičiant zoom žymeklis nešokinėtų ir nesislankiotų
const iconCache = {};

function createSvgIcon(color) {
    if (iconCache[color]) return iconCache[color];

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="45" viewBox="0 0 24 24" fill="${color}">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>`;
    
    const encoded = encodeURIComponent(svgString);
    
    const svgIcon = L.icon({
        iconUrl: `data:image/svg+xml;charset=utf-8,${encoded}`,
        iconSize: [30, 45],
        iconAnchor: [15, 45],
        popupAnchor: [0, -45]
    });

    iconCache[color] = svgIcon;
    return svgIcon;
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
const map = L.map('map').setView([54.643, 24.805], 16);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Užtikriname žemėlapio dydžio atnaujinimą keičiantis ekrano dydžiui (ypač išmaniajame)
window.addEventListener('resize', function() {
    map.invalidateSize();
});

let markerGroup = L.featureGroup().addTo(map);
let userCoords = null; // Store user coordinates globally for distance filtering
let userMarker = null; // Kintamasis vartotojo žymekliui išsaugoti (realaus laiko atnaujinimui)
let userCircle = null; // Kintamasis spinduliui išsaugoti
let isInitialLocation = true; // Pirminio įcentravimo vėliavėlė

async function fetchAndDisplayPlaces(params = {}) {
    try {
        const urlParams = new URLSearchParams(params).toString();
        const url = `/api/places/?${urlParams}`;
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
                const marker = L.marker([lat, lon], {icon: createSvgIcon(color)});
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
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function findUserLocation() {
    if ("geolocation" in navigator) {
        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);

        // Įjungtas watch: true vietos sekimui judant, ir didelis tikslumas
        map.locate({setView: false, watch: true, maxZoom: 16, enableHighAccuracy: true});

        function onLocationFound(e) {
            userCoords = { lat: e.latlng.lat, lon: e.latlng.lng };
            const radius = e.accuracy;
            
            if (!userMarker) {
                // Sukuriame tik vieną kartą, kad nesisluoksniuotų ir nesislinktų
                userMarker = L.marker(e.latlng, {icon: createSvgIcon('#007AFF')}).addTo(map)
                    .bindPopup("You are here");
                userCircle = L.circle(e.latlng, radius).addTo(map);
            } else {
                // Atnaujiname esamas koordinates sklandžiai judant
                userMarker.setLatLng(e.latlng);
                userCircle.setLatLng(e.latlng);
                userCircle.setRadius(radius);
            }

            // Įcentruojame žemėlapį tik pirmą kartą paleidus
            if (isInitialLocation) {
                map.setView(e.latlng, 16);
                isInitialLocation = false;
            }
        }

        function onLocationError(e) {
            console.error('Error getting location:', e.message);
        }
    } else {
        console.log("Geolocation support is not available.");
    }
}

// Optimizuota filtravimo užkrova iš naujojo lengvo metaduomenų endpoint'o
async function initFilters() {
    try {
        const response = await fetch('/api/filters-meta/');
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
