import { appState } from './app_state.js';
import * as utils from './utils.js';
import { openaq } from './openaq.js';

// Configuration constants
const CONFIG = {
    ANIMATION_SPEED: 50,
    SPEED_FACTOR: 400,
    INITIAL_CENTER: [-74.5, 40],
    INITIAL_ZOOM: 9,
    INITIAL_PITCH: 75,
    INITIAL_BEARING: 0
};

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic2FuamF5YmhhbmdhcjIiLCJhIjoiY20xOHd3ZGtxMDA5MjJqcjFsdG5qNWhweCJ9.R9k657eX3Atu-g0dwGEqOA';

// Initialize Mapbox SDK client
const mapboxClient = mapboxSdk({ accessToken: mapboxgl.accessToken });

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

function initMap() {
    const map = new mapboxgl.Map({
        container: 'map',
        style: baseLayers.streets,
        center: CONFIG.INITIAL_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        pitch: CONFIG.INITIAL_PITCH,
        bearing: CONFIG.INITIAL_BEARING
    });

    appState.set('map', map);

    map.on('load', () => {
        console.log('Map loaded');
        addSkyLayer();
        addLayerSwitcher();
        addSampledPointsLayer();
        initRouteFromURL();
        
        openaq.fetchAvailableParameters().then(parameters => {
            console.log('Fetched parameters:', parameters);
            createParameterPicker(parameters);
        });
    });
}

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
        const button = utils.createLayerButton(layer, () => {
            appState.get('map').setStyle(baseLayers[layer]);
            restoreRouteAndMarkers();
        });
        layerSwitcher.appendChild(button);
    });

    // Add additional layers
    additionalLayers.forEach(layer => {
        const button = utils.createLayerButton(layer.title, () => {
            appState.get('map').setStyle({
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

function restoreRouteAndMarkers() {
    appState.get('map').once('style.load', () => {
        addSkyLayer();
        if (appState.get('route')) {
            addRouteToMap();
            addMarkersToMap();
        }
    });
}

function addRouteToMap() {
    const map = appState.get('map');
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
                'coordinates': appState.get('route')
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

function addMarkersToMap() {
    const map = appState.get('map');
    const startCoords = appState.get('startCoords');
    const endCoords = appState.get('endCoords');
    const currentPositionMarker = appState.get('currentPositionMarker');

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

document.getElementById('geocoder-start').appendChild(geocoderStart.onAdd(appState.get('map')));
document.getElementById('geocoder-end').appendChild(geocoderEnd.onAdd(appState.get('map')));

geocoderStart.on('result', (e) => {
    const startCoords = e.result.center;
    appState.set('startCoords', startCoords);
    
    // Zoom to the start point
    appState.get('map').flyTo({
        center: startCoords,
        zoom: 12,
        duration: 2000
    });

    if (appState.get('endCoords')) {
        utils.updateURLParams(appState.get('startCoords'), appState.get('endCoords'));
        getRoute();
    }
});

geocoderEnd.on('result', (e) => {
    const endCoords = e.result.center;
    appState.set('endCoords', endCoords);
    
    // If there's no start point, zoom to the end point
    if (!appState.get('startCoords')) {
        appState.get('map').flyTo({
            center: endCoords,
            zoom: 12,
            duration: 2000
        });
    }

    if (appState.get('startCoords')) {
        utils.updateURLParams(appState.get('startCoords'), appState.get('endCoords'));
        getRoute();
    }
});

function getRoute() {
    const startCoords = appState.get('startCoords');
    const endCoords = appState.get('endCoords');

    if (!startCoords || !endCoords) {
        alert('Please select both start and end points');
        return;
    }

    utils.updateURLParams(startCoords, endCoords);

    // Calculate intermediate points
    const numPoints = 10;
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
        const route = response.body.routes[0].geometry.coordinates;
        const routeLength = turf.length(turf.lineString(route), {units: 'kilometers'});
        
        appState.set('route', route);
        appState.set('routeLength', routeLength);
        
        if (appState.get('map').getSource('route')) {
            appState.get('map').removeLayer('route');
            appState.get('map').removeSource('route');
        }

        addRouteToMap();

        // Add start and end markers
        new mapboxgl.Marker({ color: '#00FF00' })
            .setLngLat(startCoords)
            .addTo(appState.get('map'));

        new mapboxgl.Marker({ color: '#FF0000' })
            .setLngLat(endCoords)
            .addTo(appState.get('map'));

        // Add current position marker
        const el = document.createElement('div');
        el.className = 'current-position-marker';
        const currentPositionMarker = new mapboxgl.Marker(el)
            .setLngLat(route[0])
            .addTo(appState.get('map'));

        appState.set('currentPositionMarker', currentPositionMarker);

        // Fit the map to the route
        const bounds = new mapboxgl.LngLatBounds();
        route.forEach(coord => bounds.extend(coord));
        appState.get('map').fitBounds(bounds, { padding: 50, duration: 1000 });

        // Show slider and play button
        document.getElementById('slider-container').style.display = 'block';
        
        // Modify the slider setup
        const slider = document.getElementById('slider');
        slider.max = routeLength * 1000;
        slider.value = 0;

        // Animate route on slider change
        slider.addEventListener('input', (e) => {
            const distanceAlongRoute = parseFloat(e.target.value) / 1000;
            animateRoute(distanceAlongRoute);
        });

        // Initial animation
        animateRoute(0);

        // Fetch OpenAQ data along the route
        const selectedParameter = document.getElementById('parameter-picker').value;
        openaq.fetchDataAlongRoute(route, selectedParameter).then(airQualityData => {
            appState.set('airQualityData', airQualityData);
            updateAveragesDisplay();
        });
    })
    .catch(error => console.error('Error:', error));
}

function togglePlayPause() {
    const playButton = document.getElementById('play');
    if (!appState.get('route') || appState.get('route').length === 0) {
        alert('Please generate a route first.');
        return;
    }

    if (appState.get('isPlaying')) {
        clearInterval(appState.get('animationInterval'));
        playButton.textContent = 'Play';
    } else {
        playAnimation();
        playButton.textContent = 'Pause';
    }
    appState.set('isPlaying', !appState.get('isPlaying'));
}

function playAnimation() {
    const slider = document.getElementById('slider');
    const animationDuration = parseInt(slider.max) / CONFIG.SPEED_FACTOR;
    const startTime = Date.now() - (parseInt(slider.value) / CONFIG.SPEED_FACTOR);

    const animationInterval = setInterval(() => {
        const currentTime = Date.now();
        const elapsedTime = currentTime - startTime;
        const distance = (elapsedTime * CONFIG.SPEED_FACTOR) / 1000;
        
        slider.value = Math.min(distance, slider.max);
        animateRoute(distance / 1000);

        if (distance >= parseFloat(slider.max)) {
            clearInterval(animationInterval);
            document.getElementById('play').textContent = 'Play';
            appState.set('isPlaying', false);
        }
    }, CONFIG.ANIMATION_SPEED);

    appState.set('animationInterval', animationInterval);
}

function animateRoute(distanceAlongRoute) {
    if (!appState.get('route') || appState.get('route').length === 0) return;

    const pointAlong = turf.along(turf.lineString(appState.get('route')), distanceAlongRoute);
    const pointAhead = turf.along(turf.lineString(appState.get('route')), Math.min(distanceAlongRoute + 0.0005, appState.get('routeLength')));
    const bearing = turf.bearing(pointAlong.geometry.coordinates, pointAhead.geometry.coordinates);
    const pointBehind = turf.along(turf.lineString(appState.get('route')), Math.max(distanceAlongRoute - 0.0005, 0));
    
    const cameraTarget = [
        pointBehind.geometry.coordinates[0] * 0.3 + pointAlong.geometry.coordinates[0] * 0.7,
        pointBehind.geometry.coordinates[1] * 0.3 + pointAlong.geometry.coordinates[1] * 0.7
    ];

    appState.get('currentPositionMarker').setLngLat(pointAlong.geometry.coordinates);

    updateNearestAQDisplay(pointAlong);

    appState.get('map').easeTo({
        center: cameraTarget,
        bearing: bearing,
        pitch: CONFIG.INITIAL_PITCH,
        zoom: 16,
        duration: 50
    });
}

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
        openaq.fetchDataAlongRoute(appState.get('route'), selectedParameter);
    });

    document.body.appendChild(picker);
}

function updateAveragesDisplay() {
    let averagesHtml = '<h3>Average Air Quality Measurements:</h3><ul>';
    Object.values(appState.get('allAverages')).forEach(({ parameter, unit, value }) => {
        averagesHtml += `<li>${parameter}: ${value.toFixed(2)} ${unit}</li>`;
    });
    averagesHtml += '</ul>';

    updateOrCreateDisplay('average-aq', averagesHtml, '70px', '10px');
}

function updateNearestAQDisplay(currentPoint) {
    if (appState.get('airQualityData') && appState.get('airQualityData').length > 0) {
        const closestPoint = appState.get('airQualityData').reduce((prev, curr) => {
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

function initRouteFromURL() {
    const { start, end } = utils.getURLParams();
    if (start && end) {
        appState.set('startCoords', start.split(',').map(Number));
        appState.set('endCoords', end.split(',').map(Number));
        
        utils.setGeocoderValue(geocoderStart, appState.get('startCoords'));
        utils.setGeocoderValue(geocoderEnd, appState.get('endCoords'));
        
        if (appState.get('map').loaded()) {
            getRoute();
        } else {
            appState.get('map').on('load', getRoute);
        }
    }
}

function addSampledPointsLayer() {
    const map = appState.get('map');
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

// Initialize the application
initMap();

// Event listeners
document.getElementById('route').addEventListener('click', getRoute);
document.getElementById('play').addEventListener('click', togglePlayPause);

function addSkyLayer() {
    const map = appState.get('map');
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