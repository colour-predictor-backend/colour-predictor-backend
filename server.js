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
  signup_city TEXT,
  signup_country TEXT,
  last_login_ip TEXT,
  last_login_city TEXT,
  last_login_country TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

function getRealIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'Unknown';
}

async function getLocation(ip) {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    const d = await res.json();
    return d.city ? { city: d.city, country: d.country_name } : { city: 'Unknown', country: 'Unknown' };
  } catch { return { city: 'Unknown', country: 'Unknown' }; }
}

app.post('/api/register', async (req, res) => {
  const { username, password, consent } = req.body;
  if (!consent) return res.status(403).json({ error: 'Must agree' });
  const ip = getRealIP(req);
  const { city, country } = await getLocation(ip);
  db.run(`INSERT INTO users (username,password,signup_ip,signup_city,signup_country) VALUES (?,?,?,?,?)`,
    [username, password, ip, city, country], err => 
      err ? res.status(400).json({ error: 'Username taken' }) : res.json({ success: true })
  );
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = getRealIP(req);
  const { city, country } = await getLocation(ip);
  db.get(`SELECT * FROM users WHERE username=? AND password=?`, [username, password], (err, user) => {
    if (!user) return res.status(401).json({ error: 'Wrong login' });
    db.run(`UPDATE users SET last_login_ip=?,last_login_city=?,last_login_country=? WHERE id=?`,
      [ip, city, country, user.id]);
    res.json({ success: true, username });
  });
});

app.post('/api/admin-users', (req, res) => {
  if (req.body.code !== ADMIN_CODE) return res.status(403).json({ error: 'No' });
  db.all(`SELECT username,signup_ip,signup_city,signup_country,last_login_ip,last_login_city,last_login_country FROM users ORDER BY id DESC`,
    (_, rows) => res.json(rows || [])
  );
});

app.listen(PORT, () => console.log('✅ Running'));
