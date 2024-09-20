import { delay } from './utils.js';

const OPENAQ_API_KEY = '0da4666ad983bf054ac303700a5493b19397334d0bc5a562663d538ea9db2ecc';
const corsProxy = 'https://cors-anywhere.herokuapp.com/';

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

export const openaq = {
    async fetchAvailableParameters() {
        const url = `${corsProxy}https://api.openaq.org/v2/parameters`;
        try {
            const data = await fetchWithRetry(url);
            return data.results;
        } catch (error) {
            console.error('Error fetching parameters:', error);
            return [{id: 'pm25', name: 'PM2.5'}];
        }
    },

    async fetchDataAlongRoute(route, selectedParameter = 'pm25') {
        if (!route || route.length === 0) {
            console.error('No route available');
            return;
        }

        const numPoints = 10; // Fixed number of points to sample
        const routeLength = turf.length(turf.lineString(route), {units: 'meters'});
        const interval = routeLength / (numPoints - 1); // Distance between each sample point in meters

        // Get the date for 1 week ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const dateFrom = oneWeekAgo.toISOString();
        const dateTo = new Date().toISOString();

        const airQualityData = [];

        for (let i = 0; i < numPoints; i++) {
            const distance = i * interval;
            const point = turf.along(turf.lineString(route), distance, {units: 'meters'}).geometry.coordinates;
            const roundedLon = parseFloat(point[0].toFixed(8));
            const roundedLat = parseFloat(point[1].toFixed(8));
            const url = `${corsProxy}https://api.openaq.org/v2/measurements?date_from=${dateFrom}&date_to=${dateTo}&parameter_id=${selectedParameter}&coordinates=${roundedLat},${roundedLon}&radius=25000&limit=1`;
            
            try {
                const result = await fetchWithRetry(url);
                if (result.results && result.results.length > 0) {
                    const measurement = result.results[0];
                    airQualityData.push({
                        coordinates: [roundedLon, roundedLat],
                        value: measurement.value,
                        unit: measurement.unit,
                        parameter: measurement.parameter,
                        date: measurement.date.utc
                    });
                }
            } catch (error) {
                console.error(`Failed to fetch data for point ${i + 1}/${numPoints}:`, error);
            }
            await delay(300); // 300ms delay between requests
        }

        return airQualityData;
    }
};