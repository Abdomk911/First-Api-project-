/**
 * DEPRECATED - use Logic.js instead. Kept for backward compat.
 * This file now contains the same fixed logic as Logic.js so either script works.
 * Fixes applied: correct IDs (city-input), correct hidden logic, no nested listener,
 * https, renderSuggestions implemented, syntax fixed.
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
const input = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const suggestionsList = document.getElementById('suggestions-list');
const cityNameEl = document.getElementById('city-name');
const dateEl = document.getElementById('prayer-date');
const PRAYER_MAP = [
  { apiKey: 'Fajr', elId: 'time1' },
  { apiKey: 'Sunrise', elId: 'time2' },
  { apiKey: 'Dhuhr', elId: 'time3' },
  { apiKey: 'Asr', elId: 'time4' },
  { apiKey: 'Maghrib', elId: 'time5' },
  { apiKey: 'Isha', elId: 'time6' },
];
let suggestionsController = null;
let debounceTimerId = null;
let selectedCity = null;
function buildGeonamesUrl(query) {
  const params = new URLSearchParams({
    name_startsWith: query,
    maxRows: CONFIG.MAX_SUGGESTIONS,
    username: CONFIG.GEONAMES_USERNAME,
    featureClass: 'P',
  });
  CONFIG.ARAB_COUNTRY_CODES.forEach((code) => params.append('country', code));
  return `https://secure.geonames.org/searchJSON?${params.toString()}`;
}
function renderSuggestions(places) {
  if (!places || places.length === 0) {
    suggestionsList.classList.add('hidden');
    suggestionsList.innerHTML = '';
    return;
  }
  suggestionsList.innerHTML = places.map((place) => `
      <li class="px-4 py-2 cursor-pointer hover:bg-green-100 text-gray-700" data-name="${place.name}" data-country="${place.countryCode}">
        ${place.name}, ${place.countryName}
      </li>`).join('');
  suggestionsList.classList.remove('hidden');
}
async function fetchSuggestions(query) {
  suggestionsController?.abort();
  suggestionsController = new AbortController();
  try {
    const response = await fetch(buildGeonamesUrl(query), { signal: suggestionsController.signal });
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
input.addEventListener('input', () => {
  const query = input.value.trim();
  clearTimeout(debounceTimerId);
  if (query.length < CONFIG.MIN_QUERY_LENGTH) {
    suggestionsList.classList.add('hidden');
    return;
  }
  debounceTimerId = setTimeout(() => { fetchSuggestions(query); }, CONFIG.DEBOUNCE_DELAY_MS);
});
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
document.addEventListener('click', (e) => {
  if (!e.target.closest('#searchbar')) suggestionsList.classList.add('hidden');
});
function getTodayFormatted() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
}
function buildPrayerTimesUrl(address) {
  const date = getTodayFormatted();
  const params = new URLSearchParams({ address });
  return `https://api.aladhan.com/v1/timingsByAddress/${date}?${params.toString()}`;
}
function updateTimingsUI(timings) {
  PRAYER_MAP.forEach(({ apiKey, elId }) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const rawTime = timings[apiKey] || '--:--';
    el.textContent = rawTime.split(' ')[0];
  });
}
function updateHeaderUI(cityLabel, readableDate) {
  if (cityNameEl) cityNameEl.textContent = cityLabel;
  if (dateEl) dateEl.textContent = readableDate;
}
async function loadPrayerTimes({ name, countryCode }) {
  const address = `${name}, ${countryCode}`;
  try {
    const response = await fetch(buildPrayerTimesUrl(address));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.code !== 200) throw new Error(typeof data.data === 'string' ? data.data : 'AlAdhan API error');
    updateTimingsUI(data.data.timings);
    const [d, m, y] = data.data.date.gregorian.date.split('-');
    updateHeaderUI(name, `${y} - ${m} - ${d}`);
  } catch (err) {
    console.error('Failed to fetch prayer times:', err);
    if (dateEl) dateEl.textContent = 'تعذر تحديث الأوقات، حاول مجددا';
  }
}
searchBtn.addEventListener('click', () => {
  const query = input.value.trim();
  if (!query) return;
  const [rawName, rawCountry] = query.split(',').map((s) => s?.trim());
  loadPrayerTimes({ name: rawName || query, countryCode: rawCountry || '' });
  suggestionsList.classList.add('hidden');
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchBtn.click(); });
loadPrayerTimes({ name: CONFIG.DEFAULT_CITY, countryCode: CONFIG.DEFAULT_COUNTRY });
