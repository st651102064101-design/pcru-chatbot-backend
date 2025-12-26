const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const HOST = process.env.HOST || '127.0.0.1';
    const PORT = process.env.PORT || '3000';
    const baseUrl = `http://${HOST}:${PORT}`;

    console.log('Checking GET /chat/contacts');
    const c = await get(`${baseUrl}/chat/contacts`);
    if (!c || !c.success || !Array.isArray(c.contacts) || c.contacts.length === 0) {
      throw new Error('GET /chat/contacts returned no contacts');
    }
    console.log('Contacts returned:', c.contacts.length);
    const hasPhone = c.contacts.some(x => String(x.officerPhoneRaw || x.phone || '').includes('0811112232'));
    if (!hasPhone) {
      console.warn('Warning: default phone 0811112232 not found in contacts');
    } else {
      console.log('Found DB phone 0811112232 in contacts');
    }

    console.log('Checking POST /chat/respond fallback');
    const r = await post(`${baseUrl}/chat/respond`, { message: 'no match unique phrase 12345' });
    if (!r || !r.success || r.found) {
      throw new Error('POST /chat/respond did not return expected fallback');
    }
    if (!Array.isArray(r.contacts) || r.contacts.length === 0) {
      throw new Error('POST /chat/respond returned empty contacts array');
    }
    const hasPhoneResp = r.contacts.some(x => String(x.officerPhoneRaw || x.phone || '').includes('0811112232'));
    if (!hasPhoneResp) {
      console.warn('Warning: default phone 0811112232 not found in /chat/respond contacts');
    } else {
      console.log('Found DB phone 0811112232 in /chat/respond contacts');
    }

    console.log('All checks passed');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err && (err.message || err));
    process.exit(2);
  }
})();