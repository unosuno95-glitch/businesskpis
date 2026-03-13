const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// SQLite database (file-based, no external DB needed)
const db = new Database(path.join(__dirname, "drinks.db"));
db.pragma("journal_mode = WAL");

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS drinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 1,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// GET all drinks (optionally filter by date range)
app.get("/api/drinks", (req, res) => {
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db.prepare("SELECT * FROM drinks WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC").all(from, to);
  } else {
    rows = db.prepare("SELECT * FROM drinks ORDER BY date DESC, id DESC").all();
  }
  res.json(rows);
});

// GET summary stats
app.get("/api/stats", (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const rows = db.prepare(`
    SELECT date, SUM(amount) as total
    FROM drinks
    WHERE date >= date('now', '-' || ? || ' days')
    GROUP BY date
    ORDER BY date ASC
  `).all(days);
  const totalDrinks = rows.reduce((s, r) => s + r.total, 0);
  const daysWithDrinks = rows.length;
  const avg = daysWithDrinks > 0 ? (totalDrinks / days).toFixed(1) : 0;
  res.json({ daily: rows, totalDrinks, daysWithDrinks, avgPerDay: parseFloat(avg) });
});

// POST a new drink
app.post("/api/drinks", (req, res) => {
  const { date, type, amount, note } = req.body;
  if (!date || !type) return res.status(400).json({ error: "date and type required" });
  const result = db.prepare("INSERT INTO drinks (date, type, amount, note) VALUES (?, ?, ?, ?)").run(date, type, amount || 1, note || "");
  const row = db.prepare("SELECT * FROM drinks WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE a drink
app.delete("/api/drinks/:id", (req, res) => {
  const result = db.prepare("DELETE FROM drinks WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.json({ deleted: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
