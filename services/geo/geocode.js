const https = require('https');

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          const err = new Error(`HTTP_${status}`);
          err.status = status;
          err.body = body;
          return reject(err);
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          const err = new Error('INVALID_JSON');
          err.body = body;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function normalizeNominatim(results) {
  if (!Array.isArray(results)) return [];
  return results
    .map(r => ({
      lat: r && r.lat != null ? String(r.lat) : null,
      lon: r && r.lon != null ? String(r.lon) : null,
      display_name: r && (r.display_name || r.name) ? String(r.display_name || r.name) : null,
    }))
    .filter(r => r.lat && r.lon);
}

function normalizePhoton(json) {
  const features = json && Array.isArray(json.features) ? json.features : [];
  return features
    .map(f => {
      const coords = f && f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
      const props = (f && f.properties) || {};
      if (!coords || coords.length < 2) return null;
      const [lon, lat] = coords;
      const display = [props.name, props.city, props.state, props.country].filter(Boolean).join(', ');
      return {
        lat: String(lat),
        lon: String(lon),
        display_name: display || props.name || null,
      };
    })
    .filter(Boolean)
    .filter(r => r.lat && r.lon);
}

module.exports = () => async (req, res) => {
  const qRaw = (req.query && req.query.q) ? String(req.query.q) : '';
  const q = qRaw.trim();

  if (!q) {
    return res.status(400).json({ success: false, message: 'Missing query param q' });
  }

  const queriesToTry = [q, `${q} ประเทศไทย`, `${q} Thailand`];

  // Nominatim policy: must include a valid User-Agent identifying application.
  const headers = {
    'User-Agent': 'PCRU-Chatbot/1.0 (geo-proxy)',
    'Accept': 'application/json',
  };

  try {
    // 1) Nominatim
    for (const qq of queriesToTry) {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=th&countrycodes=th&q=${encodeURIComponent(qq)}`;
      try {
        const json = await fetchJson(url, headers);
        const results = normalizeNominatim(json);
        if (results.length) {
          return res.status(200).json({ success: true, provider: 'nominatim', results });
        }
      } catch (e) {
        // If rate limited or forbidden, stop trying Nominatim.
        if (e && (e.status === 403 || e.status === 429)) break;
      }
    }

    // 2) Photon fallback
    for (const qq of queriesToTry) {
      const url = `https://photon.komoot.io/api/?limit=5&lang=th&q=${encodeURIComponent(qq)}`;
      try {
        const json = await fetchJson(url, headers);
        const results = normalizePhoton(json);
        if (results.length) {
          return res.status(200).json({ success: true, provider: 'photon', results });
        }
      } catch (e) {
        // keep trying next query
      }
    }

    return res.status(200).json({ success: true, provider: null, results: [] });
  } catch (err) {
    console.error('geo/geocode error:', err);
    return res.status(500).json({ success: false, message: 'Geocode failed' });
  }
};
