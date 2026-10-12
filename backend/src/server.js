const http = require('http');
const app = require('./app');
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Set it in backend/.env');
  process.exit(1);
}

const PORT = Number(process.env.SERVER_PORT || 5000);

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Hospital Management System backend running on http://localhost:${PORT}`);
});
