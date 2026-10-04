require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');

const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const storeRoutes = require('./routes/storeRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const shelfRoutes = require('./routes/shelfRoutes');
const integrationRoutes = require('./routes/integrationRoutes');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/shelf-zones', shelfRoutes);
app.use('/api/integrations', integrationRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Eklavya Retail Vision backend running on http://localhost:${PORT}`);
  console.log(`Accepting frontend connections from: ${FRONTEND_URL}`);
});

module.exports = { app, server };
