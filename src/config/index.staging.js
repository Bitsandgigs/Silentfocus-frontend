// No separate staging server exists yet: staging uses the production API
// (and its data) until one is provided. Replace this URL when it exists.
export default {
  baseURL: 'https://silent.rpaywin.com/',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  },

  timeout: 1000 * 60 * 2,
};