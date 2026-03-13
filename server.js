const express = require("express");
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "drinks.db");

let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      finished INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  // Migration: add finished column if missing
  const cols = all("PRAGMA table_info(trips)");
  if (!cols.find(c => c.name === "finished")) {
    db.run("ALTER TABLE trips ADD COLUMN finished INTEGER NOT NULL DEFAULT 0");
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS drinks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id)
    )
  `);
  // Ensure at least one trip exists
  const count = all("SELECT COUNT(*) as c FROM trips");
  if (count[0].c === 0) {
    db.run("INSERT INTO trips (name) VALUES (?)", ["My Trip"]);
  }
  save();
}

function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Trips ---
app.get("/api/trips", (req, res) => {
  const rows = all("SELECT t.*, (SELECT COUNT(*) FROM drinks WHERE trip_id = t.id) as drink_count FROM trips t ORDER BY t.id DESC");
  res.json(rows);
});

app.post("/api/trips", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  db.run("INSERT INTO trips (name) VALUES (?)", [name]);
  save();
  const row = all("SELECT * FROM trips ORDER BY id DESC LIMIT 1");
  res.status(201).json(row[0]);
});

app.put("/api/trips/:id", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const trip = all("SELECT * FROM trips WHERE id = ?", [req.params.id]);
  if (trip.length === 0) return res.status(404).json({ error: "not found" });
  if (trip[0].finished) return res.status(400).json({ error: "trip is finished" });
  db.run("UPDATE trips SET name = ? WHERE id = ?", [name, req.params.id]);
  save();
  const row = all("SELECT * FROM trips WHERE id = ?", [req.params.id]);
  res.json(row[0]);
});

app.put("/api/trips/:id/finish", (req, res) => {
  const trip = all("SELECT * FROM trips WHERE id = ?", [req.params.id]);
  if (trip.length === 0) return res.status(404).json({ error: "not found" });
  const finished = trip[0].finished ? 0 : 1;
  db.run("UPDATE trips SET finished = ? WHERE id = ?", [finished, req.params.id]);
  save();
  const row = all("SELECT * FROM trips WHERE id = ?", [req.params.id]);
  res.json(row[0]);
});

app.delete("/api/trips/:id", (req, res) => {
  const count = all("SELECT COUNT(*) as c FROM trips");
  if (count[0].c <= 1) return res.status(400).json({ error: "cannot delete last trip" });
  db.run("DELETE FROM drinks WHERE trip_id = ?", [req.params.id]);
  db.run("DELETE FROM trips WHERE id = ?", [req.params.id]);
  save();
  res.json({ deleted: true });
});

// --- Drinks (scoped to trip) ---
app.get("/api/trips/:tripId/drinks", (req, res) => {
  const rows = all("SELECT * FROM drinks WHERE trip_id = ? ORDER BY date DESC, id DESC", [req.params.tripId]);
  res.json(rows);
});

app.post("/api/trips/:tripId/drinks", (req, res) => {
  const trip = all("SELECT * FROM trips WHERE id = ?", [req.params.tripId]);
  if (trip.length === 0) return res.status(404).json({ error: "trip not found" });
  if (trip[0].finished) return res.status(400).json({ error: "trip is finished" });
  const { date, type, amount, note } = req.body;
  if (!date || !type) return res.status(400).json({ error: "date and type required" });
  db.run("INSERT INTO drinks (trip_id, date, type, amount, note) VALUES (?, ?, ?, ?, ?)", [req.params.tripId, date, type, amount || 1, note || ""]);
  save();
  const row = all("SELECT * FROM drinks ORDER BY id DESC LIMIT 1");
  res.status(201).json(row[0]);
});

app.delete("/api/drinks/:id", (req, res) => {
  const drink = all("SELECT d.*, t.finished FROM drinks d JOIN trips t ON t.id = d.trip_id WHERE d.id = ?", [req.params.id]);
  if (drink.length === 0) return res.status(404).json({ error: "not found" });
  if (drink[0].finished) return res.status(400).json({ error: "trip is finished" });
  db.run("DELETE FROM drinks WHERE id = ?", [req.params.id]);
  save();
  res.json({ deleted: true });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
