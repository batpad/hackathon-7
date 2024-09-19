mapboxgl.accessToken = 'pk.eyJ1Ijoic2FuamF5YmhhbmdhcjIiLCJhIjoiY20xOHd3ZGtxMDA5MjJqcjFsdG5qNWhweCJ9.R9k657eX3Atu-g0dwGEqOA';

// Initialize mapboxSdk
const mapboxClient = mapboxSdk({ accessToken: mapboxgl.accessToken });

// Define base layers
const baseLayers = {
    'streets': 'mapbox://styles/mapbox/streets-v11',
    'satellite': 'mapbox://styles/mapbox/satellite-v9',
    'satellite-streets': 'mapbox://styles/mapbox/satellite-streets-v11'
};

// Define additional layers
// Developers can add their own layers here by specifying a title and tileURL
const additionalLayers = [
    {
        title: 'OpenStreetMap',
        tileURL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors'
    },
    {
        title: 'Stamen Watercolor',
        tileURL: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
        attribution: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under CC BY SA.'
    }
    // Add more layers here as needed
    // {
    //     title: 'Your Custom Layer',
    //     tileURL: 'https://your-tile-server.com/{z}/{x}/{y}.png',
    //     attribution: 'Your attribution'
    // }
];

const map = new mapboxgl.Map({
    container: 'map',
    style: baseLayers.streets,
    center: [-74.5, 40],
    zoom: 9,
    pitch: 75,
    bearing: 0
});

// Add layer switcher control
function addLayerSwitcher() {
    const layerSwitcher = document.createElement('div');
    layerSwitcher.id = 'layer-switcher';
    layerSwitcher.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    // Add base layers
    Object.keys(baseLayers).forEach(layer => {
        const button = document.createElement('button');
        button.textContent = layer;
        button.addEventListener('click', () => {
            map.setStyle(baseLayers[layer]);
            restoreRouteAndMarkers();
        });
        layerSwitcher.appendChild(button);
    });

    // Add additional layers
    additionalLayers.forEach(layer => {
        const button = document.createElement('button');
        button.textContent = layer.title;
        button.addEventListener('click', () => {
            map.setStyle({
                version: 8,
                sources: {
                    'raster-tiles': {
                        type: 'raster',
                        tiles: [layer.tileURL],
                        tileSize: 256,
                        attribution: layer.attribution
                    }
                },
                layers: [{
                    id: 'simple-tiles',
                    type: 'raster',
                    source: 'raster-tiles',
                    minzoom: 0,
                    maxzoom: 22
                }]
            });
            restoreRouteAndMarkers();
        });
        layerSwitcher.appendChild(button);
    });

    map.addControl({
        onAdd: function() {
            return layerSwitcher;
        },
        onRemove: function() {
            layerSwitcher.parentNode.removeChild(layerSwitcher);
        }
    }, 'top-right'); // Changed from 'top-left' to 'top-right'
}

// Function to restore route and markers after style change
function restoreRouteAndMarkers() {
    map.once('style.load', () => {
        if (route) {
            addRouteToMap();
            addMarkersToMap();
        }
    });
}

// Add route to map
function addRouteToMap() {
    map.addSource('route', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': route
            }
        }
    });

    map.addLayer({
        'id': 'route',
        'type': 'line',
        'source': 'route',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#888',
            'line-width': 8
        }
    });
}

// Add markers to map
function addMarkersToMap() {
    if (startCoords) {
        new mapboxgl.Marker({ color: '#00FF00' })
            .setLngLat(startCoords)
            .addTo(map);
    }
    if (endCoords) {
        new mapboxgl.Marker({ color: '#FF0000' })
            .setLngLat(endCoords)
            .addTo(map);
    }
    if (currentPositionMarker) {
        currentPositionMarker.addTo(map);
    }
}

// Add layer switcher after map loads
map.on('load', () => {
    addLayerSwitcher();
    initRouteFromURL();
});

let route;
let startCoords, endCoords;
let currentPositionMarker;
let isPlaying = false;
let animationInterval;
const animationSpeed = 50; // Update every 50ms
let routeLength;
const SPEED_FACTOR = 400; // meters per second

// Add geocoder controls
const geocoderStart = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    placeholder: 'Enter start location',
    reverseGeocode: true
});

const geocoderEnd = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    placeholder: 'Enter end location',
    reverseGeocode: true
});

document.getElementById('geocoder-start').appendChild(geocoderStart.onAdd(map));
document.getElementById('geocoder-end').appendChild(geocoderEnd.onAdd(map));

// Modify the geocoder setup
geocoderStart.on('result', (e) => {
    startCoords = e.result.center;
    if (endCoords) updateURLParams(startCoords, endCoords);
});

geocoderEnd.on('result', (e) => {
    endCoords = e.result.center;
    if (startCoords) updateURLParams(startCoords, endCoords);
});

// Add this after the geocoder setup
document.getElementById('route').addEventListener('click', getRoute);

function getRoute() {
    if (!startCoords || !endCoords) {
        alert('Please select both start and end points');
        return;
    }

    updateURLParams(startCoords, endCoords);

    // Use Mapbox Directions SDK
    mapboxClient.directions.getDirections({
        profile: 'driving',
        waypoints: [
            { coordinates: startCoords },
            { coordinates: endCoords }
        ],
        geometries: 'geojson'
    }).send()
    .then(response => {
        route = response.body.routes[0].geometry.coordinates;
        routeLength = turf.length(turf.lineString(route), {units: 'kilometers'}) * 1000; // Convert to meters
        const animationDuration = routeLength / SPEED_FACTOR; // Calculate duration in seconds

        if (map.getSource('route')) {
            map.removeLayer('route');
            map.removeSource('route');
        }

        map.addSource('route', {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': {
                    'type': 'LineString',
                    'coordinates': route
                }
            }
        });

        map.addLayer({
            'id': 'route',
            'type': 'line',
            'source': 'route',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-color': '#888',
                'line-width': 8
            }
        });

        // Add start and end markers
        new mapboxgl.Marker({ color: '#00FF00' })
            .setLngLat(startCoords)
            .addTo(map);

        new mapboxgl.Marker({ color: '#FF0000' })
            .setLngLat(endCoords)
            .addTo(map);

        // Add current position marker
        const el = document.createElement('div');
        el.className = 'current-position-marker';
        currentPositionMarker = new mapboxgl.Marker(el)
            .setLngLat(route[0])
            .addTo(map);

        // Fit the map to the route
        const bounds = new mapboxgl.LngLatBounds();
        route.forEach(coord => bounds.extend(coord));
        map.fitBounds(bounds, { padding: 50 });

        // Show slider and play button
        document.getElementById('slider-container').style.display = 'block';
        
        // Modify the slider setup
        const slider = document.getElementById('slider');
        slider.max = animationDuration * 1000; // Set max value to animation duration in milliseconds
        slider.value = 0;

        // Animate route on slider change
        document.getElementById('slider').addEventListener('input', (e) => {
            animateRoute(parseFloat(e.target.value) / 1000);
        });

        // Add play button functionality
        const playButton = document.getElementById('play');
        playButton.addEventListener('click', togglePlayPause);

        // Initial animation
        animateRoute(0);
    })
    .catch(error => console.error('Error:', error));
}

function togglePlayPause() {
    const playButton = document.getElementById('play');
    if (!route || route.length === 0) {
        alert('Please generate a route first.');
        return;
    }

    if (isPlaying) {
        clearInterval(animationInterval);
        playButton.textContent = 'Play';
    } else {
        playAnimation();
        playButton.textContent = 'Pause';
    }
    isPlaying = !isPlaying;
}

function playAnimation() {
    const startTime = Date.now();
    const slider = document.getElementById('slider');
    const animationDuration = parseInt(slider.max);

    animationInterval = setInterval(() => {
        const currentTime = Date.now();
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / animationDuration, 1);
        
        slider.value = elapsedTime;
        animateRoute(progress);

        if (progress >= 1) {
            clearInterval(animationInterval);
            document.getElementById('play').textContent = 'Play';
            isPlaying = false;
        }
    }, animationSpeed); // Update roughly 60 times per second for smooth animation
}

function animateRoute(progress) {
    if (!route || route.length === 0) return;

    // Calculate the point along the route for the current progress
    const pointAlong = turf.along(turf.lineString(route), routeLength * progress / 1000);
    
    // Calculate the bearing between the current point and the next point
    const pointAhead = turf.along(turf.lineString(route), routeLength * Math.min(progress + 0.0005, 1) / 1000);
    const bearing = turf.bearing(pointAlong.geometry.coordinates, pointAhead.geometry.coordinates);

    // Calculate a point slightly behind the current point for a trailing camera effect
    const pointBehind = turf.along(turf.lineString(route), routeLength * Math.max(progress - 0.0005, 0) / 1000);
    
    // Interpolate between the behind point and the current point for smoother camera movement
    const cameraTarget = [
        pointBehind.geometry.coordinates[0] * 0.3 + pointAlong.geometry.coordinates[0] * 0.7,
        pointBehind.geometry.coordinates[1] * 0.3 + pointAlong.geometry.coordinates[1] * 0.7
    ];

    // Update the current position marker
    currentPositionMarker.setLngLat(pointAlong.geometry.coordinates);

    // Update the map view with smooth interpolation
    map.easeTo({
        center: cameraTarget,
        bearing: bearing,
        pitch: 75,
        zoom: 16,
        duration: 50
    });
}

// Load the Turf.js library
const script = document.createElement('script');
script.src = 'https://npmcdn.com/@turf/turf/turf.min.js';
script.onload = () => console.log('Turf.js loaded');
document.head.appendChild(script);

// Add these functions at the beginning of your file

function updateURLParams(start, end) {
    const params = new URLSearchParams(window.location.search);
    params.set('start', start.join(','));
    params.set('end', end.join(','));
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    const end = params.get('end');
    return { start, end };
}

// Add this function to check if input is coordinates
function isCoordinates(input) {
    const parts = input.split(',');
    return parts.length === 2 && parts.every(part => !isNaN(parseFloat(part.trim())));
}

// Modify the setGeocoderValue function
function setGeocoderValue(geocoder, lngLat) {
    const coordString = `${lngLat[1]}, ${lngLat[0]}`;
    geocoder.setInput(coordString);
    // Remove the mapMarker check as it might not be initialized yet
}

// Modify the initRouteFromURL function
function initRouteFromURL() {
    const { start, end } = getURLParams();
    if (start && end) {
        startCoords = start.split(',').map(Number);
        endCoords = end.split(',').map(Number);
        
        // Set the input values for the geocoders
        setGeocoderValue(geocoderStart, startCoords);
        setGeocoderValue(geocoderEnd, endCoords);
        
        // Wait for the map to load before calling getRoute
        if (map.loaded()) {
            getRoute();
        } else {
            map.on('load', getRoute);
        }
    }
}
