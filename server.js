const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_CODE = 'imageturip3859';

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./predictor.db');
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  signup_ip TEXT,
  signup_port TEXT,
  signup_city TEXT,
  signup_country TEXT,
  last_login_ip TEXT,
  last_login_port TEXT,
  last_login_city TEXT,
  last_login_country TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Get REAL visitor IP from Render's proxy headers
function getClientInfo(req) {
  // Try ALL possible headers Render uses
  let realIp = req.headers['x-forwarded-for'] 
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || 'Unknown';
  
  // Clean up — remove any extra spaces
  realIp = realIp.trim();
  
  const port = req.headers['x-forwarded-port'] || 
               req.headers['x-real-port'] ||
               req.socket?.remotePort || 'Unknown';
  
  return { ip: realIp, port };
}

async function getLocation(ip) {
  if (!ip || ip === 'Unknown' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.') || ip === '::1') {
    return { city: 'Unknown', country: 'Unknown' };
  }
  try {
    // Try TWO services — if one fails, the other might work
    let res = await fetch(`https://ipapi.co/${ip}/json/`, { timeout: 8000 });
    if (res.ok) {
      const d = await res.json();
      if (!d.error) {
        return {
          city: d.city || 'Unknown',
          country: d.country_name || d.country || 'Unknown'
        };
      }
    }
    // Fallback service
    res = await fetch(`https://ipwhois.app/json/${ip}`, { timeout: 8000 });
    if (res.ok) {
      const d = await res.json();
      if (d.success !== false) {
        return {
          city: d.city || 'Unknown',
          country: d.country || 'Unknown'
        };
      }
    }
    return { city: 'Unknown', country: 'Unknown' };
  } catch {
    return { city: 'Unknown', country: 'Unknown' };
  }
}

app.post('/api/register', async (req, res) => {
  const { username, password, consent } = req.body;
  if (!consent) return res.status(403).json({ error: 'Must agree to data collection' });
  
  const { ip, port } = getClientInfo(req);
  const { city, country } = await getLocation(ip);
  
  db.run(
    `INSERT INTO users (username,password,signup_ip,signup_port,signup_city,signup_country,last_login_ip,last_login_port,last_login_city,last_login_country) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [username, password, ip, port, city, country, ip, port, city, country],
    err => err ? res.status(400).json({ error: 'Username taken' }) : res.json({ success: true })
  );
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { ip, port } = getClientInfo(req);
  const { city, country } = await getLocation(ip);
  
  db.get(`SELECT * FROM users WHERE username=? AND password=?`, [username, password], (err, user) => {
    if (!user) return res.status(401).json({ error: 'Wrong login' });
    db.run(
      `UPDATE users SET last_login_ip=?,last_login_port=?,last_login_city=?,last_login_country=? WHERE id=?`,
      [ip, port, city, country, user.id],
      () => res.json({ success: true, username })
    );
  });
});

app.post('/api/admin-users', (req, res) => {
  if (req.body.code !== ADMIN_CODE) return res.status(403).json({ error: 'Unauthorized' });
  db.all(`SELECT username,signup_ip,signup_port,signup_city,signup_country,last_login_ip,last_login_port,last_login_city,last_login_country FROM users ORDER BY id DESC`,
    (_, rows) => res.json(rows || [])
  );
});

app.listen(PORT, () => console.log('✅ Running — dual IP + location lookup'));
