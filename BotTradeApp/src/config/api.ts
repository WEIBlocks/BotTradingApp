const DEV_API_URL = 'http://157.245.215.118:3000';

// Production backend — DigitalOcean server (update to domain once available)
// NOTE: must include :3000. Port 80 is nginx serving the admin SPA, which
// returns index.html (HTTP 200) for unmatched paths — API calls would silently
// receive HTML instead of JSON.
const PROD_API_URL = 'http://157.245.215.118:3000';

export const API_BASE_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;
// export const API_BASE_URL = DEV_API_URL ;

console.log('API URL:', API_BASE_URL, '__DEV__:', __DEV__);

// Timeout for API requests (ms)
export const REQUEST_TIMEOUT = 15000;
