// For USB-connected physical device: run `adb reverse tcp:3000 tcp:3000`
// This forwards device's localhost:3000 to host machine's localhost:3000
// For emulator: 10.0.2.2 maps to host localhost automatically
const DEV_API_URL = 'http://localhost:3000';

export const API_BASE_URL = __DEV__ ? DEV_API_URL : 'https://api.bottrade.app';

// Timeout for API requests (ms)
export const REQUEST_TIMEOUT = 15000;
