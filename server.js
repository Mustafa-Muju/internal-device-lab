const http = require('http');
const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = 8080;
const SELENIUM_GRID_PORT = 786;
const APPIUM_PORT = 4725;
const SELENIUM_GRID_URL = `http://localhost:${SELENIUM_GRID_PORT}`;
const APPIUM_URL = `http://localhost:${APPIUM_PORT}`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Internal Device Lab</title>
        <style>
          body { background: #121212; color: #ffffff; font-family: monospace; }
          pre { height: 350px; overflow-y: scroll; background: #333; padding: 15px; }
          button { padding: 10px; }
          button.active { background: #0050ff; color: white; }
          .tab-content { display: none; }
          .tab-content.active { display: block; }
          #cleanup-card {
            background: #333;
            color: #eee;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 8px;
            font-family: monospace;
            height: 120px;
            overflow-y: auto;
            white-space: pre-wrap;
          }
          #status-card {
            background: #222;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 8px;
          }
          #status-card a {
            color: #00aaff;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <h1>Internal Device Lab</h1>

        <div id="cleanup-card">
          <strong>Cleanup Status:</strong>
          <pre id="cleanup-log" style="margin-top:8px;"></pre>
        </div>

        <div id="status-card">
          <strong>Active Emulators:</strong> <span id="active-emulators">0</span><br />
          <strong>Selenium Grid URL:</strong> <a href="${SELENIUM_GRID_URL}" target="_blank">${SELENIUM_GRID_URL}</a><br />
          <strong>Appium Server URL:</strong> <a href="${APPIUM_URL}" target="_blank">${APPIUM_URL}</a>
        </div>

        <button data-tab="1" class="active">Emulator</button>
        <button data-tab="2">Appium</button>
        <button data-tab="3">Selenium Grid</button>
        <button onclick="fetchDevices()">🔄 Check Devices</button>
        <div>
          <strong>Connected Devices:</strong> <span id="device-count">0</span>
        </div>
        <div id="tab-1" class="tab-content active"><pre id="output1"></pre></div>
        <div id="tab-2" class="tab-content"><pre id="output2"></pre></div>
        <div id="tab-3" class="tab-content"><pre id="output3"></pre></div>

        <script>
          document.querySelectorAll('button[data-tab]').forEach(btn => {
            btn.onclick = () => {
              document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
              document.querySelectorAll('button[data-tab]').forEach(b => b.classList.remove('active'));
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

          cleanupWs.onmessage = (e) => {
            cleanupLog.textContent += e.data;
            cleanupLog.scrollTop = cleanupLog.scrollHeight;
          };

          cleanupWs.onclose = () => {
            const cleanupCard = document.getElementById('cleanup-card');
            if (cleanupCard) cleanupCard.remove();
          };

          cleanupWs.onerror = () => {
            const cleanupCard = document.getElementById('cleanup-card');
            if (cleanupCard) cleanupCard.remove();
          };

          function fetchDevices(){
            fetch('/devices').then(res => res.json()).then(data => {
              document.getElementById('device-count').textContent = data.count;
              document.getElementById('active-emulators').textContent = data.emulatorCount || 0;
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
      if (err) return res.end(JSON.stringify({ count: 0, emulatorCount: 0 }));
      const deviceCount = (stdout.match(/\tdevice/g) || []).length;
      const emulatorCount = (stdout.match(/emulator-/g) || []).length;
      res.end(JSON.stringify({ count: deviceCount, emulatorCount }));
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
