const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const initSqlJs = require('sql.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_ROOT = ROOT;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_DIR = path.join(ROOT, 'storage');
const DB_PATH = path.join(DB_DIR, 'telemetry.sqlite');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp'
};

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, port: 4173, initDb: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--root' && argv[index + 1]) {
      args.root = path.resolve(ROOT, argv[index + 1]);
      index += 1;
    } else if (token === '--port' && argv[index + 1]) {
      args.port = Number(argv[index + 1]);
      index += 1;
    } else if (token === '--init-db') {
      args.initDb = true;
    }
  }
  return args;
}

async function loadDatabase() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const SQL = await initSqlJs();
  const db = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT NOT NULL,
      route_option_id TEXT,
      started_at TEXT NOT NULL,
      metadata_json TEXT
    );
    CREATE TABLE IF NOT EXISTS telemetry_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      variant_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL,
      accuracy REAL,
      captured_at TEXT NOT NULL,
      FOREIGN KEY(trip_id) REFERENCES trips(id)
    );
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      variant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL,
      accuracy REAL,
      captured_at TEXT NOT NULL,
      metadata_json TEXT,
      FOREIGN KEY(trip_id) REFERENCES trips(id)
    );
    CREATE TABLE IF NOT EXISTS stop_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT NOT NULL,
      cluster_key TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 1,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      review_note TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stop_candidates_cluster ON stop_candidates(variant_id, cluster_key, event_type);
  `);
  return { SQL, db };
}

function saveDatabase(db) {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > 1_000_000) {
        reject(new Error('Payload demasiado grande.'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sanitizeStaticPath(rootDir, urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0]);
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = path.normalize(path.join(rootDir, safePath));
  if (!absolutePath.startsWith(rootDir)) {
    return null;
  }
  return absolutePath;
}

function serveStatic(rootDir, req, res) {
  const rootCandidates = [rootDir];
  if (rootDir === ROOT) {
    rootCandidates.push(PUBLIC_DIR);
  }

  const filePath = rootCandidates
    .map((candidateRoot) => sanitizeStaticPath(candidateRoot, req.url || '/'))
    .find((candidatePath) => candidatePath && fs.existsSync(candidatePath) && !fs.statSync(candidatePath).isDirectory());

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=300'
  });
  fs.createReadStream(filePath).pipe(res);
}

function clusterKeyFrom(lat, lng) {
  return `${Number(lat).toFixed(4)}:${Number(lng).toFixed(4)}`;
}

function upsertCandidate(db, payload) {
  const clusterKey = clusterKeyFrom(payload.lat, payload.lng);
  const selectStmt = db.prepare(`
    SELECT id, hit_count, lat, lng
    FROM stop_candidates
    WHERE variant_id = ? AND cluster_key = ? AND event_type = ?
    LIMIT 1
  `);
  selectStmt.bind([payload.variantId, clusterKey, payload.eventType]);

  if (selectStmt.step()) {
    const row = selectStmt.getAsObject();
    const hitCount = Number(row.hit_count) + 1;
    const nextLat = Number((((Number(row.lat) * Number(row.hit_count)) + payload.lat) / hitCount).toFixed(6));
    const nextLng = Number((((Number(row.lng) * Number(row.hit_count)) + payload.lng) / hitCount).toFixed(6));
    db.run(`
      UPDATE stop_candidates
      SET hit_count = ?, lat = ?, lng = ?, last_seen_at = ?
      WHERE id = ?
    `, [hitCount, nextLat, nextLng, payload.timestamp, row.id]);
  } else {
    db.run(`
      INSERT INTO stop_candidates (
        variant_id, cluster_key, lat, lng, hit_count, event_type, status, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, 1, ?, 'pending', ?, ?)
    `, [payload.variantId, clusterKey, payload.lat, payload.lng, payload.eventType, payload.timestamp, payload.timestamp]);
  }

  selectStmt.free();
}

function queryRows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function createServer(options) {
  const { db } = await loadDatabase();
  if (options.initDb) {
    saveDatabase(db);
    console.log(`DB inicializada en ${DB_PATH}`);
    return null;
  }

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (requestUrl.pathname.startsWith('/telemetry')) {
      try {
        if (req.method === 'POST' && requestUrl.pathname === '/telemetry/trips/start') {
          const body = await readJsonBody(req);
          const startedAt = body.startedAt || new Date().toISOString();
          db.run(`
            INSERT INTO trips (variant_id, route_option_id, started_at, metadata_json)
            VALUES (?, ?, ?, ?)
          `, [
            body.variantId || '',
            body.routeOptionId || null,
            startedAt,
            JSON.stringify(body.metadata || {})
          ]);
          const tripId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
          saveDatabase(db);
          sendJson(res, 201, { tripId, startedAt });
          return;
        }

        const tripPointsMatch = requestUrl.pathname.match(/^\/telemetry\/trips\/(\d+)\/points$/);
        if (req.method === 'POST' && tripPointsMatch) {
          const body = await readJsonBody(req);
          const tripId = Number(tripPointsMatch[1]);
          const points = Array.isArray(body.points) ? body.points : [];
          points.forEach((point) => {
            db.run(`
              INSERT INTO telemetry_points (trip_id, variant_id, lat, lng, speed, accuracy, captured_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
              tripId,
              point.variantId || body.variantId || '',
              Number(point.lat),
              Number(point.lng),
              point.speed ?? null,
              point.accuracy ?? null,
              point.timestamp || new Date().toISOString()
            ]);
          });
          saveDatabase(db);
          sendJson(res, 200, { stored: points.length });
          return;
        }

        const tripEventsMatch = requestUrl.pathname.match(/^\/telemetry\/trips\/(\d+)\/events$/);
        if (req.method === 'POST' && tripEventsMatch) {
          const body = await readJsonBody(req);
          const tripId = Number(tripEventsMatch[1]);
          const events = Array.isArray(body.events) ? body.events : [];
          events.forEach((event) => {
            const timestamp = event.timestamp || new Date().toISOString();
            db.run(`
              INSERT INTO telemetry_events (trip_id, variant_id, event_type, lat, lng, speed, accuracy, captured_at, metadata_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              tripId,
              event.variantId || body.variantId || '',
              event.eventType,
              Number(event.lat),
              Number(event.lng),
              event.speed ?? null,
              event.accuracy ?? null,
              timestamp,
              JSON.stringify(event.metadata || {})
            ]);

            if (['boarding_confirmed', 'alighting_confirmed', 'manual_stop_hint'].includes(event.eventType)) {
              upsertCandidate(db, {
                variantId: event.variantId || body.variantId || '',
                lat: Number(event.lat),
                lng: Number(event.lng),
                eventType: event.eventType,
                timestamp
              });
            }
          });
          saveDatabase(db);
          sendJson(res, 200, { stored: events.length });
          return;
        }

        if (req.method === 'GET' && requestUrl.pathname === '/telemetry/stop-candidates') {
          const variantId = requestUrl.searchParams.get('variantId');
          const rows = variantId
            ? queryRows(db, `
                SELECT id, variant_id, lat, lng, hit_count, event_type, status, first_seen_at, last_seen_at, review_note
                FROM stop_candidates
                WHERE variant_id = ?
                ORDER BY hit_count DESC, last_seen_at DESC
              `, [variantId])
            : queryRows(db, `
                SELECT id, variant_id, lat, lng, hit_count, event_type, status, first_seen_at, last_seen_at, review_note
                FROM stop_candidates
                ORDER BY hit_count DESC, last_seen_at DESC
              `);
          sendJson(res, 200, { candidates: rows });
          return;
        }

        const reviewMatch = requestUrl.pathname.match(/^\/telemetry\/stop-candidates\/(\d+)\/review$/);
        if (req.method === 'POST' && reviewMatch) {
          const body = await readJsonBody(req);
          db.run(`
            UPDATE stop_candidates
            SET status = ?, review_note = ?
            WHERE id = ?
          `, [body.status || 'pending', body.reviewNote || null, Number(reviewMatch[1])]);
          saveDatabase(db);
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 404, { error: 'Telemetry endpoint no encontrado.' });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    serveStatic(options.root, req, res);
  });

  return server;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = await createServer(options);
  if (!server) return;
  server.listen(options.port, () => {
    console.log(`RutAPP server listo en http://localhost:${options.port} sirviendo ${options.root}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
