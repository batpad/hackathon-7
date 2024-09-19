/**
 * Route Animator
 * This script creates an interactive map with route animation features using Mapbox GL JS.
 */

(function() {
    'use strict';

    // Mapbox access token
    mapboxgl.accessToken = 'pk.eyJ1Ijoic2FuamF5YmhhbmdhcjIiLCJhIjoiY20xOHd3ZGtxMDA5MjJqcjFsdG5qNWhweCJ9.R9k657eX3Atu-g0dwGEqOA';

    // Initialize Mapbox SDK client
    const mapboxClient = mapboxSdk({ accessToken: mapboxgl.accessToken });

    // Configuration constants
    const CONFIG = {
        ANIMATION_SPEED: 50, // Update every 50ms
        SPEED_FACTOR: 400, // meters per second
        INITIAL_CENTER: [-74.5, 40],
        INITIAL_ZOOM: 9,
        INITIAL_PITCH: 75,
        INITIAL_BEARING: 0
    };

    // State variables
    let route;
    let startCoords, endCoords;
    let currentPositionMarker;
    let isPlaying = false;
    let animationInterval;
    let routeLength;

    // Define base layers
    const baseLayers = {
        'streets': 'mapbox://styles/mapbox/streets-v11',
        'satellite': 'mapbox://styles/mapbox/satellite-v9',
        'satellite-streets': 'mapbox://styles/mapbox/satellite-streets-v11'
    };

    // Define additional layers
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
    ];

    /**
     * Initialize the map
     */
    const map = new mapboxgl.Map({
        container: 'map',
        style: baseLayers.streets,
        center: CONFIG.INITIAL_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        pitch: CONFIG.INITIAL_PITCH,
        bearing: CONFIG.INITIAL_BEARING
    });

    /**
     * Add layer switcher control to the map
     */
    function addLayerSwitcher() {
        const layerSwitcher = document.createElement('div');
        layerSwitcher.id = 'layer-switcher';
        layerSwitcher.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

        // Add base layers
        Object.keys(baseLayers).forEach(layer => {
            const button = createLayerButton(layer, () => {
                map.setStyle(baseLayers[layer]);
                restoreRouteAndMarkers();
            });
            layerSwitcher.appendChild(button);
        });

        // Add additional layers
        additionalLayers.forEach(layer => {
            const button = createLayerButton(layer.title, () => {
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
            onAdd: () => layerSwitcher,
            onRemove: () => layerSwitcher.parentNode.removeChild(layerSwitcher)
        }, 'top-right');
    }

    /**
     * Create a button for the layer switcher
     * @param {string} text - Button text
     * @param {Function} onClick - Click event handler
     * @returns {HTMLButtonElement} Button element
     */
    function createLayerButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.addEventListener('click', (e) => {
            document.querySelectorAll('#layer-switcher button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            onClick();
        });
        return button;
    }

    /**
     * Restore route and markers after style change
     */
    function restoreRouteAndMarkers() {
        map.once('style.load', () => {
            if (route) {
                addRouteToMap();
                addMarkersToMap();
            }
        });
    }

    /**
     * Add route to map
     */
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

    /**
     * Add markers to map
     */
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

    // Initialize geocoder controls
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

    geocoderStart.on('result', (e) => {
        startCoords = e.result.center;
        if (endCoords) updateURLParams(startCoords, endCoords);
    });

    geocoderEnd.on('result', (e) => {
        endCoords = e.result.center;
        if (startCoords) updateURLParams(startCoords, endCoords);
    });

    /**
     * Get route between start and end points
     */
    function getRoute() {
        if (!startCoords || !endCoords) {
            alert('Please select both start and end points');
            return;
        }

        updateURLParams(startCoords, endCoords);

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
            routeLength = turf.length(turf.lineString(route), {units: 'kilometers'});
            
            if (map.getSource('route')) {
                map.removeLayer('route');
                map.removeSource('route');
            }

            addRouteToMap();

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
            slider.max = routeLength * 1000; // Set max value to route length in meters
            slider.value = 0;

            // Animate route on slider change
            slider.addEventListener('input', (e) => {
                const distanceAlongRoute = parseFloat(e.target.value) / 1000; // Convert to kilometers
                animateRoute(distanceAlongRoute);
            });

            // Initial animation
            animateRoute(0);
        })
        .catch(error => console.error('Error:', error));
    }

    /**
     * Toggle play/pause of route animation
     */
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

    /**
     * Play route animation
     */
    function playAnimation() {
        const slider = document.getElementById('slider');
        const animationDuration = parseInt(slider.max) / CONFIG.SPEED_FACTOR; // Calculate duration based on route length and speed
        const startTime = Date.now() - (parseInt(slider.value) / CONFIG.SPEED_FACTOR);

        animationInterval = setInterval(() => {
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            const distance = (elapsedTime * CONFIG.SPEED_FACTOR) / 1000; // Calculate distance in meters
            
            slider.value = Math.min(distance, slider.max);
            animateRoute(distance / 1000); // Convert to kilometers for animateRoute

            if (distance >= parseFloat(slider.max)) {
                clearInterval(animationInterval);
                document.getElementById('play').textContent = 'Play';
                isPlaying = false;
            }
        }, CONFIG.ANIMATION_SPEED);
    }

    /**
     * Animate route at given distance along the route
     * @param {number} distanceAlongRoute - Distance along the route in kilometers
     */
    function animateRoute(distanceAlongRoute) {
        if (!route || route.length === 0) return;

        const pointAlong = turf.along(turf.lineString(route), distanceAlongRoute);
        const pointAhead = turf.along(turf.lineString(route), Math.min(distanceAlongRoute + 0.0005, routeLength));
        const bearing = turf.bearing(pointAlong.geometry.coordinates, pointAhead.geometry.coordinates);
        const pointBehind = turf.along(turf.lineString(route), Math.max(distanceAlongRoute - 0.0005, 0));
        
        const cameraTarget = [
            pointBehind.geometry.coordinates[0] * 0.3 + pointAlong.geometry.coordinates[0] * 0.7,
            pointBehind.geometry.coordinates[1] * 0.3 + pointAlong.geometry.coordinates[1] * 0.7
        ];

        currentPositionMarker.setLngLat(pointAlong.geometry.coordinates);

        map.easeTo({
            center: cameraTarget,
            bearing: bearing,
            pitch: CONFIG.INITIAL_PITCH,
            zoom: 16,
            duration: 50
        });
    }

    /**
     * Update URL parameters with start and end coordinates
     * @param {number[]} start - Start coordinates [lng, lat]
     * @param {number[]} end - End coordinates [lng, lat]
     */
    function updateURLParams(start, end) {
        const params = new URLSearchParams(window.location.search);
        params.set('start', start.join(','));
        params.set('end', end.join(','));
        window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    }

    /**
     * Get start and end coordinates from URL parameters
     * @returns {Object} Object containing start and end coordinates
     */
    function getURLParams() {
        const params = new URLSearchParams(window.location.search);
        const start = params.get('start');
        const end = params.get('end');
        return { start, end };
    }

    /**
     * Check if input is valid coordinates
     * @param {string} input - Input string to check
     * @returns {boolean} True if input is valid coordinates, false otherwise
     */
    function isCoordinates(input) {
        const parts = input.split(',');
        return parts.length === 2 && parts.every(part => !isNaN(parseFloat(part.trim())));
    }

    /**
     * Set geocoder value
     * @param {Object} geocoder - Mapbox geocoder instance
     * @param {number[]} lngLat - Coordinates [lng, lat]
     */
    function setGeocoderValue(geocoder, lngLat) {
        const coordString = `${lngLat[1]}, ${lngLat[0]}`;
        geocoder.setInput(coordString);
    }

    /**
     * Initialize route from URL parameters
     */
    function initRouteFromURL() {
        const { start, end } = getURLParams();
        if (start && end) {
            startCoords = start.split(',').map(Number);
            endCoords = end.split(',').map(Number);
            
            setGeocoderValue(geocoderStart, startCoords);
            setGeocoderValue(geocoderEnd, endCoords);
            
            if (map.loaded()) {
                getRoute();
            } else {
                map.on('load', getRoute);
            }
        }
    }

    // Event listeners
    document.getElementById('route').addEventListener('click', getRoute);
    document.getElementById('play').addEventListener('click', togglePlayPause);

    // Initialize map
    map.on('load', () => {
        addLayerSwitcher();
        initRouteFromURL();
    });

    // Load Turf.js library
    const script = document.createElement('script');
    script.src = 'https://npmcdn.com/@turf/turf/turf.min.js';
    script.onload = () => console.log('Turf.js loaded');
    document.head.appendChild(script);
})();