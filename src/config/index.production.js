// Production API (verified live, read-only checks 2026-10-01).
export default {
  baseURL: 'https://silent.rpaywin.com/',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  },

  timeout: 1000 * 60 * 2,
};