const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "Felly-BESTT1234";
const publicDir = path.join(__dirname, "public");

const host = String(process.env.DB_HOST || "localhost").trim();
const isHostedPostgres =
  Boolean(process.env.DATABASE_URL) ||
  (
    host &&
    !["localhost", "127.0.0.1"].includes(host) &&
    !host.endsWith(".local")
  );
const ssl = isHostedPostgres ? { rejectUnauthorized: false } : undefined;

// PostgreSQL connection pool
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: 10
    })
  : new Pool({
      host,
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "felly",
      ssl,
      max: 10
    });

// Middleware
app.use(express.json());
app.use(express.static(publicDir));

// Enable CORS for local development
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-passcode");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ------------------ Helper Functions ------------------

const requireText = (value, fieldName) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
};

const normalizeCustomer = (raw) => ({
  name: requireText(raw.name, "Name"),
  phone: requireText(raw.phone, "Phone number"),
  address: requireText(raw.address, "Address")
});

const normalizePhone = (value) => requireText(value, "Phone number");

const normalizeItems = (items) => {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("At least one cart item is required.");
  }

  return items.map((item, index) => {
    const name = requireText(item.name, `Item ${index + 1} name`);
    const id = String(item.id || name).trim();
    const qty = Math.max(1, Number(item.qty || 1));
    const price = Math.max(0, Number(item.price || 0));
    const image = String(item.image || item.image_url || "").trim();

    if (!Number.isFinite(qty) || !Number.isFinite(price)) {
      throw new Error(`Invalid quantity or price in item ${index + 1}.`);
    }

    return { id, name, qty, price, image };
  });
};

const computeTotals = (items) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const delivery = subtotal > 0 ? 0 : 0;
  const total = subtotal + delivery;
  return { subtotal, delivery, total };
};

const hasValidAdminPasscode = (req) =>
  String(req.headers["x-admin-passcode"] || "").trim() === ADMIN_PASSCODE;

// ------------------ Database Setup ------------------

const initDB = async () => {
  try {
    const client = await pool.connect();
    client.release();

    console.log("Connected to PostgreSQL!");

    // Create tables sequentially
    const customerTable = `
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(255) NOT NULL UNIQUE,
        address VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const ordersTable = `
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        order_date VARCHAR(50) NOT NULL,
        purchaser_name VARCHAR(255) NOT NULL,
        purchaser_phone VARCHAR(255) NOT NULL,
        purchaser_address VARCHAR(255) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        delivery DECIMAL(10,2) NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const orderItemsTable = `
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) NOT NULL,
        item_id VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        qty INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        image_url TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `;

    const customerUpdateTrigger = `
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;

    const customerUpdateTriggerBinding = `
      DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
      CREATE TRIGGER customers_set_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `;

    await pool.query(customerTable);
    await pool.query(ordersTable);
    await pool.query(orderItemsTable);
    await pool.query("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT");
    await pool.query(customerUpdateTrigger);
    await pool.query(customerUpdateTriggerBinding);
    console.log("Database schema ensured.");
  } catch (err) {
    console.error("WARNING: Database initialization failed:", err.message);
    console.error("Server is running, but API endpoints will fail until database is fixed.");
    // process.exit(1) removed so the website still loads
  }
};

// ------------------ Routes ------------------

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, storage: "postgres" });
});

app.post("/api/admin/login", (req, res) => {
  const passcode = String((req.body || {}).passcode || "").trim();
  if (!passcode || passcode !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: "Invalid admin passcode." });
  }
  return res.json({ ok: true, message: "Admin login successful." });
});

app.post("/api/customers/signup", async (req, res) => {
  try {
    const customer = normalizeCustomer(req.body || {});

    const query = `
      INSERT INTO customers (name, phone, address)
      VALUES ($1, $2, $3)
      RETURNING name, phone, address
    `;
    const values = [customer.name, customer.phone, customer.address];

    const { rows } = await pool.query(query, values);
    res.status(201).json({
      customer: rows[0],
      message: "Customer sign-up successful."
    });
  } catch (error) {
    console.error("Signup Error:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "This phone number already has an account. Please log in." });
    }
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/customers/login", async (req, res) => {
  try {
    const phone = normalizePhone((req.body || {}).phone);
    const query = `
      SELECT name, phone, address
      FROM customers
      WHERE phone = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [phone]);

    if (!rows.length) {
      return res.status(404).json({ error: "Account not found. Please sign up first." });
    }

    return res.json({
      customer: rows[0],
      message: "Customer login successful."
    });
  } catch (error) {
    console.error("Customer Login Error:", error);
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/customers/signin", async (req, res) => {
  try {
    const customer = normalizeCustomer(req.body || {});

    const query = `
      INSERT INTO customers (name, phone, address)
      VALUES ($1, $2, $3)
      ON CONFLICT (phone) DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address
      RETURNING name, phone, address
    `;
    const values = [customer.name, customer.phone, customer.address];

    const { rows } = await pool.query(query, values);
    res.json({ customer: rows[0] });
  } catch (error) {
    console.error("Signin Error:", error);
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/orders", async (req, res) => {
  if (!hasValidAdminPasscode(req)) {
    return res.status(401).json({ error: "Admin passcode required." });
  }

  const query = `
    SELECT o.*, oi.item_id, oi.name AS item_name, oi.qty, oi.price, oi.image_url
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    ORDER BY o.created_at DESC
  `;

  try {
    const { rows } = await pool.query(query);
    // Map orders and items
    const ordersMap = {};
    rows.forEach((row) => {
      if (!ordersMap[row.id]) {
        ordersMap[row.id] = {
          id: row.id,
          date: row.order_date,
          purchaser: {
            name: row.purchaser_name,
            phone: row.purchaser_phone,
            address: row.purchaser_address
          },
          items: [],
          subtotal: Number(row.subtotal),
          delivery: Number(row.delivery),
          total: Number(row.total)
        };
      }
      if (row.item_id) {
        ordersMap[row.id].items.push({
          id: row.item_id,
          name: row.item_name,
          qty: Number(row.qty),
          price: Number(row.price),
          image: row.image_url || ""
        });
      }
    });

    res.json({ orders: Object.values(ordersMap) });
  } catch (error) {
    console.error("Fetch Orders Error:", error);
    res.status(500).json({ error: "Unable to load orders." });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const payload = req.body || {};
    const purchaser = normalizeCustomer(payload.purchaser || {});
    const items = normalizeItems(payload.items || []);
    const totals = computeTotals(items);
    const orderId = `FB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const orderDate = new Date().toLocaleString();

    // Insert order
    const orderQuery = `
      INSERT INTO orders (id, order_date, purchaser_name, purchaser_phone, purchaser_address, subtotal, delivery, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const orderValues = [
      orderId, orderDate, purchaser.name, purchaser.phone, purchaser.address,
      totals.subtotal, totals.delivery, totals.total
    ];

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(orderQuery, orderValues);

      const itemQuery = `
        INSERT INTO order_items (order_id, item_id, name, qty, price, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

      for (const item of items) {
        await client.query(itemQuery, [orderId, item.id, item.name, item.qty, item.price, item.image || ""]);
      }

      await client.query("COMMIT");
    } catch (dbError) {
      await client.query("ROLLBACK");
      throw dbError;
    } finally {
      client.release();
    }

    res.status(201).json({ order: { id: orderId, date: orderDate, purchaser, items, ...totals } });
  } catch (error) {
    console.error("Order Error:", error);
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  if (!hasValidAdminPasscode(req)) {
    return res.status(401).json({ error: "Admin passcode required." });
  }

  const orderId = String(req.params.id || "").trim();
  const query = `DELETE FROM orders WHERE id = $1`;

  try {
    const result = await pool.query(query, [orderId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Order not found." });
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete Order Error:", error);
    res.status(500).json({ error: "Unable to remove order." });
  }
});

// Initialize the database once per runtime boot.
const dbReady = initDB();

// ------------------ Start Server ------------------
if (require.main === module) {
  dbReady.then(() => {
    app.listen(PORT, () => {
      console.log(`Felly-Best backend running at http://localhost:${PORT} (PostgreSQL)`);
    });
  });
}

module.exports = app;
