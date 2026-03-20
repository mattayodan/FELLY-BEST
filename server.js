const express = require("express");
const { neon } = require("@neondatabase/serverless");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "Felly-BESTT1234";
const DATABASE_URL = process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Neon.");
}

const sql = neon(DATABASE_URL);
let schemaReadyPromise;

const ensureSchema = async () => {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        address TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_date TEXT NOT NULL,
        purchaser_name TEXT NOT NULL,
        purchaser_phone TEXT NOT NULL,
        purchaser_address TEXT NOT NULL,
        subtotal NUMERIC NOT NULL,
        delivery NUMERIC NOT NULL,
        total NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS order_items (
        id BIGSERIAL PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price NUMERIC NOT NULL
      )
    `;
  })();

  return schemaReadyPromise;
};

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

const normalizeItems = (items) => {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("At least one cart item is required.");
  }

  return items.map((item, index) => {
    const name = requireText(item.name, `Item ${index + 1} name`);
    const id = String(item.id || name).trim();
    const qty = Math.max(1, Number(item.qty || 1));
    const price = Math.max(0, Number(item.price || 0));

    if (!Number.isFinite(qty) || !Number.isFinite(price)) {
      throw new Error(`Invalid quantity or price in item ${index + 1}.`);
    }

    return { id, name, qty, price };
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

const normalizeOrderItems = (value) => {
  let items = [];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) items = parsed;
    } catch (_) {
      items = [];
    }
  }

  return items.map((item) => ({
    id: String(item.id || "").trim(),
    name: String(item.name || "").trim(),
    qty: Number(item.qty || 0),
    price: Number(item.price || 0)
  }));
};

const mapOrderRow = (row) => ({
  id: row.id,
  date: row.order_date,
  purchaser: {
    name: row.purchaser_name,
    phone: row.purchaser_phone,
    address: row.purchaser_address
  },
  items: normalizeOrderItems(row.items),
  subtotal: Number(row.subtotal || 0),
  delivery: Number(row.delivery || 0),
  total: Number(row.total || 0)
});

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", async (_req, res) => {
  await ensureSchema();
  res.json({ ok: true, storage: "neon" });
});

app.post("/api/admin/login", (req, res) => {
  const passcode = String((req.body || {}).passcode || "").trim();
  if (!passcode || passcode !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: "Invalid admin passcode." });
  }
  return res.json({ ok: true });
});

app.post("/api/customers/signin", async (req, res) => {
  try {
    await ensureSchema();
    const customer = normalizeCustomer(req.body || {});

    const rows = await sql`
      INSERT INTO customers (name, phone, address)
      VALUES (${customer.name}, ${customer.phone}, ${customer.address})
      ON CONFLICT (phone) DO UPDATE
      SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        updated_at = NOW()
      RETURNING name, phone, address
    `;

    res.json({ customer: rows[0] || customer });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to sign in customer." });
  }
});

app.get("/api/orders", async (req, res) => {
  if (!hasValidAdminPasscode(req)) {
    return res.status(401).json({ error: "Admin passcode required." });
  }

  try {
    await ensureSchema();
    const rows = await sql`
      SELECT
        o.id,
        o.order_date,
        o.purchaser_name,
        o.purchaser_phone,
        o.purchaser_address,
        o.subtotal,
        o.delivery,
        o.total,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.item_id,
              'name', oi.name,
              'qty', oi.qty,
              'price', oi.price
            )
            ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;

    return res.json({ orders: rows.map(mapOrderRow) });
  } catch (_) {
    return res.status(500).json({ error: "Unable to load orders." });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    await ensureSchema();
    const payload = req.body || {};
    const purchaser = normalizeCustomer(payload.purchaser || {});
    const items = normalizeItems(payload.items || []);
    const totals = computeTotals(items);
    const order = {
      id: `FB-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: new Date().toLocaleString(),
      purchaser,
      items,
      ...totals
    };

    await sql`
      INSERT INTO orders (
        id,
        order_date,
        purchaser_name,
        purchaser_phone,
        purchaser_address,
        subtotal,
        delivery,
        total
      )
      VALUES (
        ${order.id},
        ${order.date},
        ${order.purchaser.name},
        ${order.purchaser.phone},
        ${order.purchaser.address},
        ${order.subtotal},
        ${order.delivery},
        ${order.total}
      )
    `;

    for (const item of order.items) {
      await sql`
        INSERT INTO order_items (order_id, item_id, name, qty, price)
        VALUES (${order.id}, ${item.id}, ${item.name}, ${item.qty}, ${item.price})
      `;
    }

    res.status(201).json({ order });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to place order." });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  if (!hasValidAdminPasscode(req)) {
    return res.status(401).json({ error: "Admin passcode required." });
  }
  try {
    await ensureSchema();
    const id = String(req.params.id || "").trim();
    const rows = await sql`DELETE FROM orders WHERE id = ${id} RETURNING id`;

    if (!rows.length) {
      return res.status(404).json({ error: "Order not found." });
    }

    return res.json({ ok: true });
  } catch (_) {
    return res.status(500).json({ error: "Unable to remove order." });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Felly-Best backend running at http://localhost:${PORT} (Neon)`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize backend:", error);
    process.exit(1);
  });
