class AppState {
    constructor() {
        this._state = {
            route: null,
            startCoords: null,
            endCoords: null,
            currentPositionMarker: null,
            isPlaying: false,
            animationInterval: null,
            routeLength: null,
            map: null,
            airQualityData: null,
            allAverages: {}
        };
        this._listeners = {};
    }

    get(key) {
        return this._state[key];
    }

    set(key, value) {
        const oldValue = this._state[key];
        this._state[key] = value;
        this._emit(key, value, oldValue);
    }

    on(event, callback) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
    }

    _emit(event, newValue, oldValue) {
        if (this._listeners[event]) {
            this._listeners[event].forEach(callback => callback(newValue, oldValue));
        }
    }
}

export const appState = new AppState();