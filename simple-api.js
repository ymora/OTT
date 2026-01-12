const http = require('http');
const url = require('url');

// Mock data simple
const mockData = {
  users: [
    { id: 1, email: 'admin@example.com', role: 'admin', name: 'Admin User' },
    { id: 2, email: 'tech@example.com', role: 'technicien', name: 'Tech User' }
  ],
  devices: [
    { id: 1, name: 'OTT-001', iccid: '8933100000000000001', status: 'online', battery: 85 }
  ]
};

// Serveur HTTP simple
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  if (path === '/api.php/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '3.1.0-simple'
    }));
    return;
  }

  if (path === '/api.php/auth/login' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { email, password } = JSON.parse(body);
        const user = mockData.users.find(u => u.email === email);
        
        if (user && (password === 'Admin1234!' || password === 'Tech1234!')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            user: user,
            token: 'mock-jwt-token-' + user.id
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (path === '/api.php/devices' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      devices: mockData.devices
    }));
    return;
  }

  // Fallback
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    message: 'Mock API endpoint',
    method: method,
    url: path,
    timestamp: new Date().toISOString()
  }));
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`🚀 OTT Simple API running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api.php/health`);
  console.log(`👤 Login: POST http://localhost:${PORT}/api.php/auth/login`);
  console.log(`📱 Devices: http://localhost:${PORT}/api.php/devices`);
});

module.exports = server;
