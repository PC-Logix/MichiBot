'use strict';

const {
  fetchText,
  say,
  text
} = require('../utils/helper');

const WEATHER_CODES = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',

  45: 'Fog',
  48: 'Rime fog',

  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Light freezing drizzle',
  57: 'Freezing drizzle',

  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Freezing rain',

  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',

  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',

  85: 'Light snow showers',
  86: 'Snow showers',

  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail'
};

const US_STATES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: ' Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia'
};

const US_STATE_NAMES = Object.fromEntries(
  Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

function cleanInput(value) {
  return String(value || '').trim();
}

function parseLatLon(input) {
  const match = String(input || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude,
    longitude,
    label: `${latitude}, ${longitude}`
  };
}

function buildUrl(base, params) {
  const url = new URL(base);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function fetchJson(url, timeoutMs) {
  const res = await fetchText(url, timeoutMs);
  const body = String(res && res.body ? res.body : '').trim();

  if (!body) {
    throw new Error('empty response');
  }

  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(`invalid JSON response: ${err.message}`);
  }
}

function isLikelyUsZip(input) {
  return /^\d{5}(?:-\d{4})?$/.test(String(input || '').trim());
}

function parseLocationHint(input) {
  const raw = String(input || '').trim().replace(/\s+/g, ' ');

  if (!raw) {
    return {
      query: '',
      stateHint: ''
    };
  }

  let match = raw.match(/^(.+?),\s*([A-Za-z]{2}|[A-Za-z][A-Za-z ]+)$/);

  if (!match) {
    match = raw.match(/^(.+?)\s+([A-Za-z]{2}|[A-Za-z][A-Za-z ]+)$/);
  }

  if (!match) {
    return {
      query: raw,
      stateHint: ''
    };
  }

  const query = match[1].trim();
  const possibleState = match[2].trim();

  const upper = possibleState.toUpperCase();
  const lower = possibleState.toLowerCase();

  if (US_STATES[upper]) {
    return {
      query,
      stateHint: US_STATES[upper]
    };
  }

  if (US_STATE_NAMES[lower]) {
    return {
      query,
      stateHint: US_STATES[US_STATE_NAMES[lower]]
    };
  }

  return {
    query: raw,
    stateHint: ''
  };
}

function scoreGeocodeResult(place, stateHint) {
  let score = 0;

  if (place.country_code === 'US') {
    score += 10;
  }

  if (stateHint && String(place.admin1 || '').toLowerCase() === stateHint.toLowerCase()) {
    score += 100;
  }

  return score;
}

async function geocodeLocation(input) {
  const direct = parseLatLon(input);

  if (direct) {
    return direct;
  }

  const parsed = parseLocationHint(input);
  const query = parsed.query;
  const stateHint = parsed.stateHint;

  const params = {
    name: query,
    count: 10,
    language: 'en',
    format: 'json'
  };

  if (isLikelyUsZip(input) || stateHint) {
    params.countryCode = 'US';
  }

  const url = buildUrl('https://geocoding-api.open-meteo.com/v1/search', params);
  const data = await fetchJson(url, 7000);

  if (!data || !Array.isArray(data.results) || !data.results.length) {
    return null;
  }

  const sorted = data.results
    .slice()
    .sort((a, b) => scoreGeocodeResult(b, stateHint) - scoreGeocodeResult(a, stateHint));

  const place = sorted[0];

  if (stateHint && String(place.admin1 || '').toLowerCase() !== stateHint.toLowerCase()) {
    return null;
  }

  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const labelParts = [
    place.name,
    place.admin1,
    place.country_code || place.country
  ].filter(Boolean);

  return {
    latitude,
    longitude,
    label: labelParts.join(', ')
  };
}

function fToC(f) {
  return (f - 32) * 5 / 9;
}

function mphToKph(mph) {
  return Math.round(mph * 1.609344 * 10) / 10;
}

function formatNumber(value, digits) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const rounded = Number(value.toFixed(digits));

  return String(rounded);
}

function formatTempF(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  const rounded = Math.round(n);
  const sign = rounded > 0 ? '+' : '';

  return `${sign}${rounded}°F`;
}

function formatTempCFromF(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  const c = fToC(n);
  const rounded = Math.round(c);
  const sign = rounded > 0 ? '+' : '';

  return `${sign}${rounded}°C`;
}

function weatherDescription(code) {
  const n = Number(code);

  if (!Number.isFinite(n)) {
    return 'Unknown';
  }

  return WEATHER_CODES[n] || `Weather code ${n}`;
}

async function fetchCurrentWeather(place) {
  const url = buildUrl('https://api.open-meteo.com/v1/forecast', {
    latitude: place.latitude,
    longitude: place.longitude,
    current: [
      'temperature_2m',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m'
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto'
  });

  const data = await fetchJson(url, 7000);

  if (!data || !data.current) {
    throw new Error('missing current weather data');
  }

  return data.current;
}

function round(value, digits = 0) {
  if (!Number.isFinite(value)) return null;

  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function formatSigned(value, suffix, digits = 0) {
  if (!Number.isFinite(value)) return null;

  const rounded = round(value, digits);
  const sign = rounded > 0 ? '+' : '';

  return `${sign}${rounded}${suffix}`;
}

function degreesToCompass(degrees) {
  const n = Number(degrees);

  if (!Number.isFinite(n)) {
    return '';
  }

  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW'
  ];

  const index = Math.round((((n % 360) + 360) % 360) / 22.5) % 16;
  return directions[index];
}


function renderWeather(place, current) {
  const tempF = Number(current.temperature_2m);
  const tempC = fToC(tempF);

  const windMph = Number(current.wind_speed_10m);
  const windKph = mphToKph(windMph);

  const windDirection = degreesToCompass(current.wind_direction_10m);
  const condition = weatherDescription(current.weather_code);

  const tempFText = formatSigned(tempF, '°F', 0);
  const tempCText = formatSigned(tempC, '°C', 0);

  const windMphText = Number.isFinite(windMph)
    ? `${round(windMph, windMph >= 10 ? 0 : 1)}mph`
    : null;

  const windKphText = Number.isFinite(windKph)
    ? `${round(windKph, windKph >= 10 ? 0 : 1)}kph`
    : null;

  const bits = [];

  bits.push(`Weather for ${place.label}: ${condition}`);

  if (tempFText && tempCText) {
    bits.push(`${tempFText} / ${tempCText}`);
  }

  if (windMphText && windKphText) {
    bits.push(`wind ${windDirection ? `${windDirection} ` : ''}${windMphText} / ${windKphText}`);
  }

  return bits.join(', ');
}

module.exports = {
  name: 'Weather',
  commands: [{ name: 'weather', aliases: ['w'] }],

  init() {
    console.log('[Weather] initialized');
  },

  async handleCommand(ctx) {
    const loc = cleanInput(text(ctx));

    if (!loc) {
      return say(ctx, `Usage: ${ctx.prefix}${ctx.command} <city|zip|lat,lon>`);
    }

    try {
      const place = await geocodeLocation(loc);

      if (!place) {
        return say(ctx, `Weather lookup failed: could not find "${loc}".`);
      }

      const current = await fetchCurrentWeather(place);
      const output = renderWeather(place, current);

      say(ctx, output);
    } catch (e) {
      say(ctx, `Weather lookup failed: ${e.message}`);
    }
  }
};