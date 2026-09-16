/**
 * =========================================================================
 * PRAYER TIMES APP
 * =========================================================================
 * 1. User types a city name -> autocomplete suggestions (GeoNames API,
 *    restricted to Arab countries).
 * 2. User picks a suggestion (or hits search) -> we fetch prayer times
 *    for that city from the AlAdhan API and update the UI.
 * =========================================================================
 */

const CONFIG = {
  ARAB_COUNTRY_CODES: Object.freeze([
    'DZ', 'EG', 'SA', 'AE', 'MA', 'TN', 'IQ', 'JO', 'LB', 'KW',
    'QA', 'OM', 'BH', 'LY', 'SD', 'SY', 'YE', 'PS', 'MR', 'SO',
    'DJ', 'KM',
  ]),
  GEONAMES_USERNAME: 'abdo',
  MAX_SUGGESTIONS: 5,
  MIN_QUERY_LENGTH: 2,
  DEBOUNCE_DELAY_MS: 300,
  DEFAULT_CITY: 'Constantine',
  DEFAULT_COUNTRY: 'DZ',
};

// -------------------------------------------------------------------------
// Cached DOM references (grabbed once, reused everywhere below)
// -------------------------------------------------------------------------
const input = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const suggestionsList = document.getElementById('suggestions-list');
const cityNameEl = document.getElementById('city-name');
const dateEl = document.getElementById('prayer-date');

// Prayer name (Arabic label already in HTML) -> AlAdhan API key -> element id
const PRAYER_MAP = [
  { apiKey: 'Fajr', elId: 'time1' },
  { apiKey: 'Sunrise', elId: 'time2' },
  { apiKey: 'Dhuhr', elId: 'time3' },
  { apiKey: 'Asr', elId: 'time4' },
  { apiKey: 'Maghrib', elId: 'time5' },
  { apiKey: 'Isha', elId: 'time6' },
];

// -------------------------------------------------------------------------
// Module-level state (must live outside functions/listeners to persist
// across calls — see debounce/abort explanation further down)
// -------------------------------------------------------------------------
let suggestionsController = null; // aborts stale GeoNames requests
let debounceTimerId = null;       // holds the pending debounce timeout
let selectedCity = null;          // { name, countryCode } once user picks one

// =========================================================================
// PART 1 — CITY AUTOCOMPLETE (GeoNames)
// =========================================================================

/**
 * Builds a GeoNames search URL restricted to our whitelist of countries.
 */
function buildGeonamesUrl(query) {
  const params = new URLSearchParams({
    name_startsWith: query,
    maxRows: CONFIG.MAX_SUGGESTIONS,
    username: CONFIG.GEONAMES_USERNAME,
    featureClass: 'P', // populated places (cities/towns)
  });

  CONFIG.ARAB_COUNTRY_CODES.forEach((code) => params.append('country', code));

  return `https://secure.geonames.org/searchJSON?${params.toString()}`;
}

/**
 * Renders the suggestions <ul> from an array of GeoNames place objects.
 */
function renderSuggestions(places) {
  if (!places || places.length === 0) {
    suggestionsList.classList.add('hidden');
    suggestionsList.innerHTML = '';
    return;
  }

  suggestionsList.innerHTML = places
    .map((place) => `
      <li
        class="px-4 py-2 cursor-pointer hover:bg-green-100 text-gray-700"
        data-name="${place.name}"
        data-country="${place.countryCode}"
      >
        ${place.name}, ${place.countryName}
      </li>
    `)
    .join('');

  suggestionsList.classList.remove('hidden');
}

/**
 * Fetches suggestions for the given query and renders them.
 * Cancels any previous still-pending suggestion request first, so an
 * older/slower response can never overwrite a newer one on screen.
 */
async function fetchSuggestions(query) {
  suggestionsController?.abort();
  suggestionsController = new AbortController();

  try {
    const response = await fetch(buildGeonamesUrl(query), {
      signal: suggestionsController.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (data.status) throw new Error(data.status.message || 'GeoNames error');

    renderSuggestions(data.geonames);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Failed to fetch city suggestions:', err);
      suggestionsList.classList.add('hidden');
    }
  }
}

// Debounced input listener — waits for the user to pause typing.
input.addEventListener('input', () => {
  const query = input.value.trim();
  clearTimeout(debounceTimerId);

  if (query.length < CONFIG.MIN_QUERY_LENGTH) {
    suggestionsList.classList.add('hidden');
    return;
  }

  debounceTimerId = setTimeout(() => {
    fetchSuggestions(query);
  }, CONFIG.DEBOUNCE_DELAY_MS);
});

// Click on a suggestion -> fill the input, remember the city, fetch prayer times.
suggestionsList.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;

  const name = li.dataset.name;
  const countryCode = li.dataset.country;

  input.value = `${name}, ${countryCode}`;
  selectedCity = { name, countryCode };

  suggestionsList.classList.add('hidden');
  loadPrayerTimes(selectedCity);
});

// Hide suggestions when clicking outside the search bar.
document.addEventListener('click', (e) => {
  if (!e.target.closest('#searchbar')) {
    suggestionsList.classList.add('hidden');
  }
});

// =========================================================================
// PART 2 — PRAYER TIMES (AlAdhan)
// =========================================================================

/**
 * Returns today's date formatted as DD-MM-YYYY, which is what the
 * AlAdhan `timingsByAddress` endpoint expects in the URL path.
 */
function getTodayFormatted() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Builds the AlAdhan API URL for a given address (e.g. "Constantine, DZ").
 */
function buildPrayerTimesUrl(address) {
  const date = getTodayFormatted();
  const params = new URLSearchParams({ address });
  return `https://api.aladhan.com/v1/timingsByAddress/${date}?${params.toString()}`;
}

/**
 * Updates the six prayer-time boxes in the UI from the API's `timings` object.
 * AlAdhan returns times like "04:03 (CET)" — we strip the timezone suffix.
 */
function updateTimingsUI(timings) {
  PRAYER_MAP.forEach(({ apiKey, elId }) => {
    const el = document.getElementById(elId);
    if (!el) return;

    const rawTime = timings[apiKey] || '--:--';
    const cleanTime = rawTime.split(' ')[0]; // drop " (CET)" etc.
    el.textContent = cleanTime;
  });
}

/**
 * Updates the city name and the readable date in the "welcome" section.
 */
function updateHeaderUI(cityLabel, readableDate) {
  if (cityNameEl) cityNameEl.textContent = cityLabel;
  if (dateEl) dateEl.textContent = readableDate;
}

/**
 * Fetches prayer times for a city ({ name, countryCode }) and refreshes
 * the UI (times + city name + date).
 */
async function loadPrayerTimes({ name, countryCode }) {
  const address = `${name}, ${countryCode}`;

  try {
    const response = await fetch(buildPrayerTimesUrl(address));

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // AlAdhan wraps errors as { code: <non-200>, status: "...", data: "message" }
    if (data.code !== 200) {
      throw new Error(typeof data.data === 'string' ? data.data : 'AlAdhan API error');
    }

    updateTimingsUI(data.data.timings);

    // gregorian.date is like "11-08-2026" -> reformat to "2026 - 08 - 11"
    const [d, m, y] = data.data.date.gregorian.date.split('-');
    updateHeaderUI(name, `${y} - ${m} - ${d}`);
  } catch (err) {
    console.error('Failed to fetch prayer times:', err);
    // Keep last known times on screen rather than wiping the UI —
    // just let the user know the refresh failed.
    if (dateEl) dateEl.textContent = 'تعذر تحديث الأوقات، حاول مجددا';
  }
}

// Search button -> use whatever is typed, even if no suggestion was clicked.
searchBtn.addEventListener('click', () => {
  const query = input.value.trim();
  if (!query) return;

  // If the user picked a suggestion earlier and hasn't changed the text,
  // reuse the precise { name, countryCode }. Otherwise fall back to
  // treating the raw typed text as the address (AlAdhan can usually
  // resolve plain "City, Country" strings on its own).
  const [rawName, rawCountry] = query.split(',').map((s) => s?.trim());

  loadPrayerTimes({
    name: rawName || query,
    countryCode: rawCountry || '',
  });

  suggestionsList.classList.add('hidden');
});

// Also trigger search on Enter key inside the input.
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    searchBtn.click();
  }
});

// =========================================================================
// INITIAL LOAD — show default city's prayer times on page load
// =========================================================================
loadPrayerTimes({
  name: CONFIG.DEFAULT_CITY,
  countryCode: CONFIG.DEFAULT_COUNTRY,
});