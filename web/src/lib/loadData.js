const DATA_BASE = "/data";

async function fetchJson(url, notFoundLabel) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    // fetch hanya reject saat jaringan benar-benar gagal — pesan bawaan
    // browser ("Failed to fetch") bahasa Inggris dan tidak jelas, ganti
    // dengan yang bisa dipahami. Layar akan membungkusnya jadi
    // "Gagal memuat data: {pesan ini}".
    throw new Error(`${notFoundLabel} — koneksi terputus (network error)`);
  }
  if (!res.ok) {
    throw new Error(`${notFoundLabel} (status ${res.status})`);
  }
  return res.json();
}

export function loadMeta() {
  return fetchJson(`${DATA_BASE}/meta.json`, "meta.json");
}

export function loadMap(komoditasId) {
  const file = komoditasId === "cabai_rawit" ? "map.json" : `map_${komoditasId}.json`;
  return fetchJson(`${DATA_BASE}/${file}`, file);
}

export function loadKabupaten(kabupatenId, komoditasId) {
  const file = komoditasId === "cabai_rawit"
    ? `${kabupatenId}.json`
    : `${kabupatenId}__${komoditasId}.json`;
  return fetchJson(`${DATA_BASE}/kabupaten/${file}`, file);
}

export function loadGeo() {
  return fetchJson("/geo/jabar_kabupaten.svg.json", "geometri peta");
}

export function loadSimulasi(komoditasId = "cabai_rawit") {
  const file = komoditasId === "cabai_rawit" ? "simulasi.json" : `simulasi_${komoditasId}.json`;
  return fetchJson(`${DATA_BASE}/${file}`, file);
}

export function loadAbsorbers() {
  return fetchJson(`${DATA_BASE}/absorbers.json`, "absorbers.json");
}

export function loadWeather() {
  return fetchJson(`${DATA_BASE}/weather.json`, "weather.json");
}
