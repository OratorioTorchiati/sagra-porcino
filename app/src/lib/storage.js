// localStorage che non si rompe se il browser lo blocca (navigazione privata, spazio pieno...).

export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non salvato: pazienza, non è indispensabile
  }
}
