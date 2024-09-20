export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isCoordinates(input) {
    const parts = input.split(',');
    return parts.length === 2 && parts.every(part => !isNaN(parseFloat(part.trim())));
}

export function createLayerButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.addEventListener('click', (e) => {
        document.querySelectorAll('#layer-switcher button').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        onClick();
    });
    return button;
}

export function updateURLParams(start, end) {
    const params = new URLSearchParams(window.location.search);
    params.set('start', start.join(','));
    params.set('end', end.join(','));
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

export function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    const end = params.get('end');
    return { start, end };
}

export function setGeocoderValue(geocoder, lngLat) {
    const coordString = `${lngLat[1]}, ${lngLat[0]}`;
    geocoder.setInput(coordString);
}