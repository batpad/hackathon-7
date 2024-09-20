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

    // Add this line to call addLayerSwitcher immediately after map initialization
    map.on('load', () => {
        console.log('Map loaded');
        addSkyLayer(); // Add this line
        addLayerSwitcher(); // Explicitly call addLayerSwitcher here
        addSampledPointsLayer();
        initRouteFromURL();
        
        // Fetch and print available parameters
        fetchAvailableParameters().then(parameters => {
            console.log('Fetched parameters:', parameters);
        });
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
            addSkyLayer(); // Add sky layer
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

            // Fetch OpenAQ data along the route
            const selectedParameter = document.getElementById('parameter-picker').value;
            fetchOpenAQDataAlongRoute(selectedParameter);
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

        // Update nearest air quality display
        updateNearestAQDisplay(pointAlong);

        map.easeTo({
            center: cameraTarget,
            bearing: bearing,
            pitch: CONFIG.INITIAL_PITCH,
            zoom: 16,
            duration: 50
        });
    }

    // Add this function to fetch available parameters
    function fetchAvailableParameters() {
        const corsProxy = 'https://cors-anywhere.herokuapp.com/';
        const url = `${corsProxy}https://api.openaq.org/v2/parameters`;

        console.log('Fetching available parameters...');

        return fetch(url, {
            method: 'GET',
            headers: {
                'X-API-Key': OPENAQ_API_KEY
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log('Available parameters:', data.results);
            createParameterPicker(data.results);
            return data.results;
        })
        .catch(error => {
            console.error('Error fetching parameters:', error);
            createParameterPicker([{id: 'pm25', name: 'PM2.5'}]); // Fallback to PM2.5 if fetch fails
            return [{id: 'pm25', name: 'PM2.5'}];
        });
    }

    // Add this function to create the parameter picker
    function createParameterPicker(parameters) {
        const picker = document.createElement('select');
        picker.id = 'parameter-picker';
        picker.style.position = 'absolute';
        picker.style.bottom = '10px';
        picker.style.right = '10px';
        picker.style.zIndex = '1000';
        picker.style.padding = '5px';

        parameters.forEach(param => {
            const option = document.createElement('option');
            option.value = param.id;
            option.textContent = param.name;
            picker.appendChild(option);
        });

        picker.addEventListener('change', (e) => {
            const selectedParameter = e.target.value;
            console.log(`Selected parameter: ${selectedParameter}`);
            fetchOpenAQDataAlongRoute(selectedParameter);
        });

        document.body.appendChild(picker);
    }

    // Helper function to create a delay
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Global variable to store averages for all parameters
    let allAverages = {};

    async function fetchOpenAQDataAlongRoute(selectedParameter = 'pm25') {
        if (!route || route.length === 0) {
            console.error('No route available');
            return;
        }

        const parameterName = document.getElementById('parameter-picker').options[document.getElementById('parameter-picker').selectedIndex].text;
        console.log(`Fetching data for parameter: ${parameterName} (${selectedParameter})`);

        const numPoints = 10; // Fixed number of points to sample
        const routeLength = turf.length(turf.lineString(route), {units: 'meters'});
        const interval = routeLength / (numPoints - 1); // Distance between each sample point in meters
        const corsProxy = 'https://cors-anywhere.herokuapp.com/';

        const sampledPoints = [];

        // Get the date for 1 week ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const dateFrom = oneWeekAgo.toISOString();
        const dateTo = new Date().toISOString();

        const fetchRequests = [];

        for (let i = 0; i < numPoints; i++) {
            const distance = i * interval;
            const point = turf.along(turf.lineString(route), distance, {units: 'meters'}).geometry.coordinates;
            const roundedLon = parseFloat(point[0].toFixed(8));
            const roundedLat = parseFloat(point[1].toFixed(8));
            const url = `${corsProxy}https://api.openaq.org/v2/measurements?date_from=${dateFrom}&date_to=${dateTo}&parameter_id=${selectedParameter}&coordinates=${roundedLat},${roundedLon}&radius=25000&limit=1`;
            
            console.log(`Preparing fetch for point ${i + 1}/${numPoints}: ${roundedLat}, ${roundedLon}`);
            console.log(`API call: ${url}`);
            
            sampledPoints.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [roundedLon, roundedLat]
                },
                properties: {
                    id: i
                }
            });

            fetchRequests.push({url, index: i});
        }

        async function fetchWithRetry(url, retries = 3, backoff = 1000) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'X-API-Key': OPENAQ_API_KEY,
                        'accept': 'application/json'
                    }
                });

                if (response.status === 429 && retries > 0) {
                    console.log(`Rate limited. Retrying in ${backoff}ms...`);
                    await delay(backoff);
                    return fetchWithRetry(url, retries - 1, backoff * 2);
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                return await response.json();
            } catch (error) {
                if (retries > 0) {
                    console.log(`Error occurred. Retrying in ${backoff}ms...`);
                    await delay(backoff);
                    return fetchWithRetry(url, retries - 1, backoff * 2);
                } else {
                    throw error;
                }
            }
        }

        try {
            const results = [];
            for (const request of fetchRequests) {
                try {
                    const result = await fetchWithRetry(request.url);
                    console.log(`Fetched data for point ${request.index + 1}/${fetchRequests.length}:`, result);
                    results.push(result);
                } catch (error) {
                    console.error(`Failed to fetch data for point ${request.index + 1}/${fetchRequests.length}:`, error);
                    results.push(null);
                }
                await delay(300); // 300ms delay between requests
            }

            console.log('All data fetched:', results);

            // Process the results
            const airQualityData = results.map((result, index) => {
                if (!result) return null;
                const distance = index * interval;
                const point = turf.along(turf.lineString(route), distance, {units: 'meters'}).geometry.coordinates;
                const measurement = result.results[0];
                if (measurement) {
                    return {
                        coordinates: [parseFloat(point[0].toFixed(8)), parseFloat(point[1].toFixed(8))],
                        value: measurement.value,
                        unit: measurement.unit,
                        parameter: measurement.parameter,
                        date: measurement.date.utc
                    };
                }
                return null;
            }).filter(data => data !== null);

            console.log('Filtered airQualityData:', airQualityData);

            window.airQualityData = airQualityData;

            if (airQualityData.length > 0) {
                // Group measurements by parameter and unit
                const groupedData = airQualityData.reduce((acc, data) => {
                    const key = `${data.parameter}_${data.unit}`;
                    if (!acc[key]) {
                        acc[key] = [];
                    }
                    acc[key].push(data);
                    return acc;
                }, {});

                // Calculate average for each group
                Object.entries(groupedData).forEach(([key, dataArray]) => {
                    const [parameter, unit] = key.split('_');
                    const totalValue = dataArray.reduce((sum, data) => sum + data.value, 0);
                    const averageValue = totalValue / dataArray.length;

                    console.log(`Average ${parameter}: ${averageValue.toFixed(2)} ${unit}`);
                    
                    // Store or update the average in the global allAverages object
                    allAverages[key] = {
                        parameter,
                        unit,
                        value: averageValue
                    };
                });

                // Update the display with all averages
                updateAveragesDisplay();
            } else {
                console.log('No air quality data available for this route');
                updateOrCreateDisplay('average-aq', 'No air quality data available for this route', '70px', '10px');
            }

            // Add sampled points to the map
            addSampledPointsLayer();
            map.getSource('sampled-points').setData({
                type: 'FeatureCollection',
                features: sampledPoints
            });
        } catch (error) {
            console.error('Error fetching OpenAQ data along route:', error);
        }
    }

    function updateAveragesDisplay() {
        let averagesHtml = '<h3>Average Air Quality Measurements:</h3><ul>';
        Object.values(allAverages).forEach(({ parameter, unit, value }) => {
            averagesHtml += `<li>${parameter}: ${value.toFixed(2)} ${unit}</li>`;
        });
        averagesHtml += '</ul>';

        updateOrCreateDisplay('average-aq', averagesHtml, '70px', '10px');
    }

    function updateNearestAQDisplay(currentPoint) {
        if (window.airQualityData && window.airQualityData.length > 0) {
            const closestPoint = window.airQualityData.reduce((prev, curr) => {
                const prevDistance = turf.distance(turf.point(prev.coordinates), currentPoint);
                const currDistance = turf.distance(turf.point(curr.coordinates), currentPoint);
                return prevDistance < currDistance ? prev : curr;
            });

            if (closestPoint.value !== null) {
                const parameterName = document.getElementById('parameter-picker').options[document.getElementById('parameter-picker').selectedIndex].text;
                updateOrCreateDisplay('nearest-aq', `Nearest ${parameterName}: ${closestPoint.value.toFixed(2)} ${closestPoint.unit}`, '10px', '10px');
            }
        }
    }

    function updateOrCreateDisplay(id, html, top, right) {
        let display = document.getElementById(id);
        if (!display) {
            display = document.createElement('div');
            display.id = id;
            display.style.position = 'absolute';
            display.style.padding = '10px';
            display.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            display.style.border = '1px solid black';
            display.style.borderRadius = '5px';
            display.style.zIndex = '1000';
            display.style.maxWidth = '300px';
            display.style.overflowY = 'auto';
            display.style.maxHeight = '80vh';
            document.body.appendChild(display);
        }
        display.style.top = top;
        display.style.right = right;
        display.innerHTML = html;
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

    // Add this function to create a new layer for sampled points
    function addSampledPointsLayer() {
        if (map.getLayer('sampled-points')) {
            map.removeLayer('sampled-points');
        }
        if (map.getSource('sampled-points')) {
            map.removeSource('sampled-points');
        }

        map.addSource('sampled-points', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        map.addLayer({
            id: 'sampled-points',
            type: 'circle',
            source: 'sampled-points',
            paint: {
                'circle-radius': 6,
                'circle-color': '#B42222',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        });
    }

    // Make map globally accessible
    window.map = map;

    // Event listeners
    document.getElementById('route').addEventListener('click', getRoute);
    document.getElementById('play').addEventListener('click', togglePlayPause);

    // Load Turf.js library
    const script = document.createElement('script');
    script.src = 'https://npmcdn.com/@turf/turf/turf.min.js';
    script.onload = () => console.log('Turf.js loaded');
    document.head.appendChild(script);

    function addSkyLayer() {
        // Calculate sun position based on local time
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        
        // Convert time to angle (24 hours = 360 degrees)
        const timeAngle = (hours + minutes / 60) * 15 - 180;
        
        // Calculate sun position (simple approximation)
        const sunPosition = [
            Math.sin(timeAngle * Math.PI / 180),
            Math.cos(timeAngle * Math.PI / 180)
        ];
        
        // Calculate sun intensity (higher at midday, lower at night)
        const sunIntensity = Math.sin((hours / 24) * Math.PI) * 15 + 5;
        
        map.addLayer({
            'id': 'sky',
            'type': 'sky',
            'paint': {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': sunPosition,
                'sky-atmosphere-sun-intensity': sunIntensity
            }
        });
    }

    addSkyLayer();
})();