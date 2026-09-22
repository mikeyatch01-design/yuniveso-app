require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { readSession } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const documentRoutes = require('./routes/documents');

const app = express();

app.use(helmet());
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120 })); // 120 req/min/IP, global backstop

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(readSession);

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/setup/seed', async (req, res) => {
  if (!process.env.JWT_SECRET || req.query.key !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  try {
    const seedDatabase = require('./seed');
    await seedDatabase();
    res.json({ ok: true, message: 'Demo data seeded. Check the Railway deploy logs for login credentials.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`YUNIVESO server listening on :${port}`));
