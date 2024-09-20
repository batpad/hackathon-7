/**
 * Route Animator
 * This script creates an interactive map with route animation features using Mapbox GL JS.
 */

(function() {
    'use strict';

    // Mapbox access token
    mapboxgl.accessToken = 'pk.eyJ1Ijoic2FuamF5YmhhbmdhcjIiLCJhIjoiY20xOHd3ZGtxMDA5MjJqcjFsdG5qNWhweCJ9.R9k657eX3Atu-g0dwGEqOA';
    const OPENAQ_API_KEY = '0da4666ad983bf054ac303700a5493b19397334d0bc5a562663d538ea9db2ecc';
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

    // Add OpenAQ layer configuration
    const openAQLayer = {
        id: 'openaq-data',
        type: 'circle',
        source: {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        },
        paint: {
            'circle-radius': 8,
            'circle-color': [
                'interpolate',
                ['linear'],
                ['get', 'value'],
                0, '#00ff00',
                50, '#ffff00',
                100, '#ff0000'
            ],
            'circle-opacity': 0.7
        }
    };


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

    // Global variable to track if OpenAQ layer has been added
    let openAQLayerAdded = false;

    // Add this line to call addLayerSwitcher immediately after map initialization
    map.on('load', () => {
        console.log('Map loaded');
        addOpenAQLayer();
        addLayerSwitcher(); // Explicitly call addLayerSwitcher here
        initRouteFromURL();
    });

    /**
     * Add layer switcher control to the map
     */
    function addLayerSwitcher() {
        console.log('Adding layer switcher');
        const layerSwitcher = document.getElementById('layer-switcher');
        if (!layerSwitcher) {
            console.error('Layer switcher element not found');
            return;
        }

        // Clear existing buttons
        layerSwitcher.innerHTML = '';

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

        // Add OpenAQ layer toggle
        const openAQToggle = createLayerButton('OpenAQ', () => {
            if (!openAQLayerAdded) {
                console.log('OpenAQ layer not yet added. Adding now...');
                addOpenAQLayer();
            }
            
            toggleOpenAQLayer(openAQToggle);
        });
        layerSwitcher.appendChild(openAQToggle);
    }

    /**
     * New function to toggle OpenAQ layer visibility
     * @param {HTMLButtonElement} button - The button element associated with the OpenAQ layer toggle
     */
    function toggleOpenAQLayer(button) {
        console.log('Toggling OpenAQ layer');
        if (!map.getLayer('openaq-data')) {
            console.error('OpenAQ layer not found. Attempting to add it.');
            addOpenAQLayer();
        }

        try {
            const visibility = map.getLayoutProperty('openaq-data', 'visibility');
            console.log('Current OpenAQ layer visibility:', visibility);
            if (visibility === 'visible') {
                map.setLayoutProperty('openaq-data', 'visibility', 'none');
                map.setLayoutProperty('openaq-labels', 'visibility', 'none');
                button.classList.remove('active');
                console.log('OpenAQ layer hidden');
            } else {
                map.setLayoutProperty('openaq-data', 'visibility', 'visible');
                map.setLayoutProperty('openaq-labels', 'visibility', 'visible');
                button.classList.add('active');
                console.log('OpenAQ layer shown');
                fetchOpenAQData();
            }
        } catch (error) {
            console.error('Error toggling OpenAQ layer:', error);
            alert('There was an error toggling the OpenAQ layer. Please try refreshing the page.');
        }
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
            addOpenAQLayer(); // Add this line to ensure OpenAQ layer is added after style changes
        });
    }

    /**
     * Add route to map
     */
    function addRouteToMap() {
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

        // Calculate intermediate points
        const numPoints = 10; // Increase for more accuracy, decrease for better performance
        const lineString = turf.lineString([startCoords, endCoords]);
        const distance = turf.length(lineString);
        const waypoints = [{ coordinates: startCoords }];

        for (let i = 1; i < numPoints - 1; i++) {
            const point = turf.along(lineString, (distance * i) / (numPoints - 1));
            waypoints.push({ coordinates: point.geometry.coordinates });
        }

        waypoints.push({ coordinates: endCoords });

        mapboxClient.directions.getDirections({
            profile: 'driving',
            waypoints: waypoints,
            geometries: 'geojson',
            overview: 'simplified',
            steps: true,
            annotations: ['distance', 'duration', 'speed']
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

    /**
     * Fetch OpenAQ data and add it to the map
     */
    function fetchOpenAQData() {
        console.log('fetchOpenAQData called');
        if (!map.getSource('openaq-data')) {
            console.error('OpenAQ data source not found on the map');
            return;
        }

        const bounds = map.getBounds();
        const center = bounds.getCenter();
        const lat = center.lat.toFixed(6);
        const lng = center.lng.toFixed(6);
        const corsProxy = 'https://cors-anywhere.herokuapp.com/';
        const url = `${corsProxy}https://api.openaq.org/v2/latest?limit=100&parameter=pm25&coordinates=${lat},${lng}&radius=25000`;

        console.log('Fetching OpenAQ data from URL:', url);

        fetch(url, {
            method: 'GET',
            headers: {
                'X-API-Key': OPENAQ_API_KEY
            }
        })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log('OpenAQ data received:', data);
                processOpenAQData(data);
            })
            .catch(error => {
                console.error('Error fetching OpenAQ data:', error);
                alert('Failed to fetch OpenAQ data. Please check the console for more details.');
            });
    }

    // Declare processOpenAQData in the global scope
    window.processOpenAQData = function(data) {
        console.log('processOpenAQData called with data:', data);

        if (!data || !data.results || !Array.isArray(data.results)) {
            console.error('Unexpected API response structure:', data);
            return;
        }

        console.log('Number of results:', data.results.length);

        const features = data.results
            .filter(result => {
                console.log('Filtering result:', result);
                if (!result || !result.coordinates || !result.measurements) {
                    console.warn('Invalid result object:', result);
                    return false;
                }
                return result.measurements.some(m => m.parameter === 'pm25');
            })
            .map(result => {
                console.log('Mapping result:', result);
                const pm25Data = result.measurements.find(m => m.parameter === 'pm25');
                const feature = {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [result.coordinates.longitude, result.coordinates.latitude]
                    },
                    properties: {
                        value: pm25Data ? pm25Data.value : null,
                        unit: pm25Data ? pm25Data.unit : null,
                        location: result.location
                    }
                };
                console.log('Processed feature:', JSON.stringify(feature));
                return feature;
            });

        console.log('Total processed features:', features.length);

        if (features.length === 0) {
            console.warn('No valid OpenAQ data points found in the current view');
            return;
        }

        if (!window.map || !window.map.getSource('openaq-data')) {
            console.error('OpenAQ data source not found when trying to update');
            return;
        }

        window.map.getSource('openaq-data').setData({
            type: 'FeatureCollection',
            features: features
        });

        console.log('OpenAQ data updated on the map');
    };

    // Make map globally accessible
    window.map = map;

    // Add this function definition near your other function definitions
    function addOpenAQLayer() {
        console.log('Adding OpenAQ layer');
        if (map.getLayer('openaq-data')) {
            console.log('OpenAQ layer already exists');
            return;
        }

        // Ensure the style has a glyphs property
        if (!map.getStyle().glyphs) {
            map.setStyle({
                ...map.getStyle(),
                glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf"
            });
        }

        map.addSource('openaq-data', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Add circle layer
        map.addLayer({
            id: 'openaq-data',
            type: 'circle',
            source: 'openaq-data',
            paint: {
                'circle-radius': 15,  // Increased size
                'circle-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'value'],
                    0, '#00ff00',
                    50, '#ffff00',
                    100, '#ff0000'
                ],
                'circle-opacity': 1,  // Full opacity
                'circle-stroke-width': 2,  // Add a stroke
                'circle-stroke-color': '#000000'  // Black stroke
            },
            layout: {
                'visibility': 'none'  // Start with the layer hidden
            }
        });

        // Add text layer for labels
        map.addLayer({
            id: 'openaq-labels',
            type: 'symbol',
            source: 'openaq-data',
            layout: {
                'text-field': ['concat', ['to-string', ['get', 'value']], ' ', ['get', 'unit']],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12,
                'text-offset': [0, -2],
                'text-anchor': 'bottom',
                'visibility': 'none'  // Start with the layer hidden
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 1
            }
        });

        console.log('OpenAQ layer added');
        openAQLayerAdded = true;  // Set the flag to true
    }

    // Event listeners
    document.getElementById('route').addEventListener('click', getRoute);
    document.getElementById('play').addEventListener('click', togglePlayPause);

    // Load Turf.js library
    const script = document.createElement('script');
    script.src = 'https://npmcdn.com/@turf/turf/turf.min.js';
    script.onload = () => console.log('Turf.js loaded');
    document.head.appendChild(script);
})();