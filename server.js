const http = require('http');
const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = 8080;
const SELENIUM_GRID_PORT = 786;
const APPIUM_PORT = 4725;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Internal Device Lab</title>
        <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: #0f0f0f;
            color: #f0f0f0;
            font-family: 'Roboto Mono', monospace;
            padding: 20px;
          }
          h1 {
            color: #00bfff;
            font-size: 2rem;
            margin-bottom: 20px;
          }
          .card {
            background: #1a1a1a;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
          }
          .card-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 10px;
            color: #00bfff;
          }
          .status-block {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          .btn {
            background: #222;
            border: 1px solid #555;
            padding: 6px 12px;
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
          }
          .btn:hover, .btn.active {
            background-color: #007acc;
          }
          pre {
            background: #121212;
            padding: 15px;
            border-radius: 6px;
            overflow-y: auto;
            max-height: 300px;
            font-size: 0.9em;
            color: #eaeaea;
            border: 1px solid #444;
          }
          .tab-bar {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
          }
          .tab-content {
            display: none;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 10px;
            background-color: #1a1a1a;
          }
          .tab-content.active {
            display: block;
          }
          .flex-row {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
          }
          .flex-col {
            flex: 1;
          }
          a {
            color: #00aaff;
            text-decoration: none;
          }
          details {
            margin-top: 8px;
          }
          summary {
            cursor: pointer;
            padding: 4px 0;
          }
          ul {
            padding-left: 20px;
            margin-top: 6px;
          }
        </style>
      </head>
      <body>
        <h1>🧪 Internal Device Lab</h1>

        <div id="cleanup-card" class="card" style="margin-bottom: 20px;">
          <div class="card-header">🧹 <span>Cleanup Status</span></div>
          <pre id="cleanup-log">Waiting for cleanup to start...</pre>
        </div>

        <div class="flex-row">
          <div class="card flex-col">
            <div class="card-header">💻 <span>Device Status</span></div>
            <div class="status-block">
              <div>
                <div>Active Devices: <span id="active-devices">0</span></div>
                <details id="device-dropdown">
                  <summary>Show Device List</summary>
                  <ul id="device-list"></ul>
                </details>
              </div>
              <button class="btn" onclick="fetchDevices()">🔄 Refresh</button>
            </div>
          </div>

          <div class="card flex-col">
            <div class="card-header">🧭 <span>Architecture Links</span></div>
            <div>
              <div>Selenium Grid: <a href="http://localhost:${SELENIUM_GRID_PORT}/ui/" target="_blank">http://localhost:${SELENIUM_GRID_PORT}/ui/</a></div>
              <div>Appium Status: <a href="http://localhost:${APPIUM_PORT}/status" target="_blank">http://localhost:${APPIUM_PORT}/status</a></div>
            </div>
          </div>
        </div>

        <div class="tab-bar">
          <button class="btn active" data-tab="1">🖥 Emulator</button>
          <button class="btn" data-tab="2">📱 Appium</button>
          <button class="btn" data-tab="3">🌐 Selenium Grid</button>
        </div>

        <div id="tab-1" class="tab-content active"><pre id="output1">Loading Emulator Logs...</pre></div>
        <div id="tab-2" class="tab-content"><pre id="output2"></pre></div>
        <div id="tab-3" class="tab-content"><pre id="output3"></pre></div>

        <script>
          document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.onclick = () => {
              document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
              document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
              btn.classList.add('active');
              document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
            };
          });

          ['script1','script2','script3'].forEach((s, i) => {
            const ws = new WebSocket('ws://' + location.host + '/' + s);
            ws.onmessage = (e) => {
              const output = document.getElementById('output' + (i+1));
              output.textContent += e.data;
              output.scrollTop = output.scrollHeight;
            };
          });

          const cleanupWs = new WebSocket('ws://' + location.host + '/cleanup');
          const cleanupLog = document.getElementById('cleanup-log');
          const cleanupCard = document.getElementById('cleanup-card');

          cleanupWs.onmessage = (e) => {
            const msg = e.data;
            cleanupLog.textContent += msg;
            cleanupLog.scrollTop = cleanupLog.scrollHeight;
            if (msg.includes('Cleanup exited with code 0')) {
              setTimeout(() => cleanupCard?.remove(), 1500);
            }
          };

          cleanupWs.onclose = cleanupWs.onerror = () => {
            cleanupCard?.remove();
          };

          function fetchDevices() {
            fetch('/devices')
              .then(res => res.json())
              .then(data => {
                document.getElementById('active-devices').textContent = data.deviceCount;
                const ul = document.getElementById('device-list');
                ul.innerHTML = '';
                data.devices.forEach(dev => {
                  const li = document.createElement('li');
                  li.textContent = dev;
                  ul.appendChild(li);
                });
              });
          }
          fetchDevices();
          setInterval(fetchDevices, 10000);
        </script>
      </body>
      </html>
    `);
  } else if (req.url === '/devices') {
    exec('adb devices', (err, stdout) => {
      if (err) return res.end(JSON.stringify({ deviceCount: 0, devices: [] }));
      const lines = stdout.split('\n').slice(1).map(l => l.trim()).filter(l => l.endsWith('\tdevice'));
      const devices = lines.map(l => l.split('\t')[0]);
      res.end(JSON.stringify({ deviceCount: devices.length, devices }));
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocket.Server({ server });

const scripts = {
  '/script1': process.platform === 'win32' ? ['cmd', ['/c', path.join(__dirname, 'windows', 'start-emulator.bat')]] : ['bash', ['./your_script1.sh']],
  '/script2': process.platform === 'win32' ? ['cmd', ['/c', path.join(__dirname, 'windows', 'appium.bat')]] : ['bash', ['./your_script2.sh']],
  '/script3': process.platform === 'win32' ? ['cmd', ['/c', path.join(__dirname, 'windows', 'selenium-grid.bat')]] : ['bash', ['./your_script3.sh']],
};

let appiumStarted = false;
let seleniumStarted = false;
let servicesStarted = false;
let cleanupRunning = false;

const cleanupClients = new Set();

function broadcastCleanup(message) {
  cleanupClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

async function runCleanupWithBroadcast() {
  cleanupRunning = true;

  const cleanupScript = process.platform === 'win32'
    ? path.join(__dirname, 'windows', 'cleanup.bat')
    : './cleanup.sh';

  const proc = spawn(cleanupScript, [], { shell: true });

  proc.stdout.on('data', data => broadcastCleanup(data.toString()));
  proc.stderr.on('data', data => broadcastCleanup(data.toString()));

  await new Promise((resolve, reject) => {
    proc.on('close', code => {
      cleanupRunning = false;
      broadcastCleanup(`[Cleanup exited with code ${code}]\n`);

      cleanupClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.close();
      });
      cleanupClients.clear();

      code === 0 ? resolve() : reject(new Error(`Cleanup failed with code ${code}`));
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const isPortFree = (port) => {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
      if (err) return resolve(true);
      resolve(!stdout || stdout.trim().length === 0);
    });
  });
};

const waitForCleanup = async () => {
  const maxRetries = 10;
  const delayMs = 2000;

  for (let i = 0; i < maxRetries; i++) {
    const adbOutput = await new Promise(resolve => exec('adb devices', (_, stdout) => resolve(stdout)));
    const emulators = (adbOutput.match(/emulator-/g) || []).length;

    const portsFree = await Promise.all([
      isPortFree(APPIUM_PORT),
      isPortFree(SELENIUM_GRID_PORT),
      isPortFree(5555),
    ]);

    if (emulators === 0 && portsFree.every(free => free)) {
      console.log('Cleanup validation passed: no emulators running and ports are free.');
      return;
    }

    console.log(`Waiting for cleanup... attempt ${i + 1}`);
    await delay(delayMs);
  }

  throw new Error('Cleanup validation failed: emulators or ports still in use after timeout.');
};

async function startEmulatorAndServices() {
  if (servicesStarted) return;
  servicesStarted = true;

  console.log('Running cleanup before starting services...');
  await runCleanupWithBroadcast();
  await waitForCleanup();

  console.log('Cleanup done. Starting emulator service.');

  const emulatorScript = scripts['/script1'];

  let emulatorLogBuffer = '';

  const emulatorProc = spawn(emulatorScript[0], emulatorScript[1], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

  emulatorProc.on('error', (err) => {
    console.error('Emulator spawn error:', err);
  });

  emulatorProc.stdout.on('data', (data) => {
    const msg = data.toString();
    emulatorLogBuffer += msg.toLowerCase();

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.path === '/script1') {
        client.send(msg);
      }
    });

    if (!appiumStarted && emulatorLogBuffer.includes('boot completed')) {
      appiumStarted = true;
      startAppiumAndSeleniumGrid();
    }

    if (emulatorLogBuffer.length > 1000) {
      emulatorLogBuffer = emulatorLogBuffer.slice(-1000);
    }
  });

  emulatorProc.stderr.on('data', data => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.path === '/script1') {
        client.send(data.toString());
      }
    });
  });

  emulatorProc.on('close', code => {
    console.log(`Emulator exited with code ${code}`);
  });
}

async function startAppiumAndSeleniumGrid() {
  const appiumScript = scripts['/script2'];
  const appiumProc = spawn(appiumScript[0], appiumScript[1], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

  appiumProc.on('error', (err) => {
    console.error('Appium process spawn error:', err);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.path === '/script2') {
        client.send(`[Appium spawn error: ${err.message}]`);
      }
    });
  });

  appiumProc.stdout.on('data', async (data) => {
    const msg = data.toString();
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.path === '/script2') {
        client.send(msg);
      }
    });

    // Wait for Appium to be ready before starting Selenium Grid
    if (!seleniumStarted && msg.toLowerCase().includes('listener started')) {
      seleniumStarted = true;

      await killPort(SELENIUM_GRID_PORT);
      await delay(2000);

      const seleniumScript = scripts['/script3'];
      const seleniumProc = spawn(seleniumScript[0], seleniumScript[1], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

      seleniumProc.on('error', (err) => {
        console.error('Selenium Grid process spawn error:', err);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client.path === '/script3') {
            client.send(`[Selenium Grid spawn error: ${err.message}]`);
          }
        });
      });

      seleniumProc.stdout.on('data', data => {
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client.path === '/script3') {
            client.send(data.toString());
          }
        });
      });

      seleniumProc.stderr.on('data', data => {
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client.path === '/script3') {
            client.send(data.toString());
          }
        });
      });
    }
  });

  appiumProc.stderr.on('data', data => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.path === '/script2') {
        client.send(data.toString());
      }
    });
  });
}

const killPort = (port) => {
  return new Promise((resolve) => {
    let cmd;

    if (process.platform === 'win32') {
      // Windows: find processes on port and kill
      cmd = `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /F /PID %a`;
    } else {
      // macOS/Linux: use lsof to find and kill processes on port
      cmd = `lsof -ti tcp:${port} | xargs -r kill -9 || true`;
    }

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.log(`No process on port ${port} or failed to kill.`);
      } else if (stdout.trim()) {
        console.log(`Killed process(es) on port ${port}:\n${stdout}`);
      }
      resolve();
    });
  });
};


wss.on('connection', (ws, req) => {
  ws.path = req.url;

  if (ws.path === '/cleanup') {
    cleanupClients.add(ws);
    ws.on('close', () => cleanupClients.delete(ws));

    if (!cleanupRunning) {
      runCleanupWithBroadcast().catch(err => {
        broadcastCleanup(`[Cleanup error: ${err.message}]`);
      });
    }
    return;
  }

  if (!servicesStarted) {
    startEmulatorAndServices().catch(err => {
      console.error('Startup error:', err);
      ws.send(`[Startup error: ${err.message}]`);
      ws.close();
    });
  }
});

function openBrowser(url) {
  const start = { win32: 'start', darwin: 'open', linux: 'xdg-open' }[process.platform];
  if (start) exec(`${start} ${url}`);
}

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  openBrowser(url);
  console.log(`Server running at ${url}`);
});
