import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { EventEmitter } from "events";

import { User, Product, Review, Order, Banner, Settings } from "./models.js";
import {
  tokenFor,
  auth,
  admin,
  slugify,
  uploadToCloudinary,
  telegram,
} from "./helpers.js";
import { seedDemoData } from "./seed.js";

const app = express();

// --------------------
// Basic configuration
// --------------------

const allowedOrigins = (
  process.env.CLIENT_ORIGIN || "https://takeiteasybd.vercel.app"
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS."));
    },
  }),
);

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

app.use((req, res, next) => {
  if (req.method === "GET") {
    res.set("Cache-Control", "public, max-age=60, s-maxage=120");
  }
  next();
});

// --------------------
// MongoDB connection
// --------------------

let connectionPromise = null;
let seedPromise = null;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;

  if (mongoose.connection.readyState === 2 && connectionPromise) {
    await connectionPromise;
    return;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is missing.");
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .then(() => {
        console.log("MongoDB connected.");
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  await connectionPromise;
}

async function initializeDatabase() {
  await connectDatabase();

  if (!seedPromise) {
    seedPromise = Promise.resolve()
      .then(() => seedDemoData())
      .catch((error) => {
        seedPromise = null;
        throw error;
      });
  }

  await seedPromise;
}

app.use((req, res, next) => {
  initializeDatabase()
    .then(() => next())
    .catch(next);
});

// --------------------
// Root and health check
// --------------------

app.get("/", (_req, res) => {
  res.json({
    name: "Take It Easy API",
    status: "running",
    endpoints: {
      health: "/api/health",
      products: "/api/products",
      banners: "/api/banners",
      orders: "/api/orders",
      deliverySettings: "/api/settings/delivery",
    },
  });
});

app.get("/api", (_req, res) => {
  res.json({ name: "Take It Easy API", status: "running" });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// --------------------
// Legacy URL compatibility
// --------------------

app.use((req, _res, next) => {
  const path = req.path;

  if (
    path === "/" ||
    path === "/api" ||
    path.startsWith("/api/") ||
    path.startsWith("/.well-known/")
  ) {
    return next();
  }

  req.url = `/api${req.url}`;
  next();
});

// --------------------
// Helpers
// --------------------

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const clean = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
});

const normalizeSizeStock = (raw) => {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw);
  if (typeof raw === "object") return raw;
  return {};
};

const buildSizeStock = (sizes, rawSizeStock) => {
  const result = {};
  for (const s of sizes) {
    result[s] = Math.max(0, Number(rawSizeStock?.[s] || 0));
  }
  return result;
};

const sumSizeStock = (sizeStock) =>
  Object.values(sizeStock).reduce((a, b) => a + Number(b || 0), 0);

const buildReportFilter = (query) => {
  const filter = {};

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) {
      const d = new Date(query.startDate);
      if (!isNaN(d.getTime())) filter.createdAt.$gte = d;
    }
    if (query.endDate) {
      const d = new Date(query.endDate);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = d;
      }
    }
    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  if (query.status && query.status !== "all") {
    filter.status = String(query.status);
  }

  return filter;
};

// ============================================================
// ✅ ২টা zone — customer choice বা city থেকে detect
// ============================================================
const VALID_ZONES = ["dhaka", "outside"];

const normalizeZone = (zone) => {
  const z = String(zone || "")
    .toLowerCase()
    .trim();
  if (z === "dhaka" || z === "inside" || z === "inside_dhaka") return "dhaka";
  return "outside";
};

const detectDeliveryZoneFromCity = (city, address = "") => {
  const text = `${city || ""} ${address || ""}`.toLowerCase();

  const dhakaKeywords = [
    "dhaka",
    "ঢাকা",
    "dhanmondi",
    "ধানমন্ডি",
    "mirpur",
    "মিরপুর",
    "uttara",
    "উত্তরা",
    "gulshan",
    "গুলশান",
    "banani",
    "বনানী",
    "motijheel",
    "মতিঝিল",
    "gazipur",
    "গাজীপুর",
    "narayanganj",
    "নারায়ণগঞ্জ",
    "tongi",
    "টঙ্গী",
    "keraniganj",
    "কেরানীগঞ্জ",
    "tejgaon",
    "তেজগাঁও",
    "mohammadpur",
    "মোহাম্মদপুর",
    "badda",
    "বাড্ডা",
    "khilgaon",
    "খিলগাঁও",
    "ashulia",
    "আশুলিয়া",
    "savar",
    "সাভার",
  ];

  if (dhakaKeywords.some((k) => text.includes(k))) return "dhaka";
  return "outside";
};

const getGlobalDeliveryCharges = async () => {
  try {
    const s = await Settings.findOne({ key: "global" }).lean();
    const d = s?.deliveryCharges || {};
    return {
      dhaka: Math.max(0, Number(d.dhaka ?? 60)),
      outside: Math.max(0, Number(d.outside ?? 130)),
    };
  } catch {
    return { dhaka: 60, outside: 130 };
  }
};

// --------------------
// SSE: Live order updates
// --------------------

const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(100);

app.get("/api/admin/orders/stream", (req, res) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(`event: connected\ndata: {"ok":true}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      /* ignore */
    }
  }, 25000);

  function onNewOrder(order) {
    try {
      res.write(`event: new-order\ndata: ${JSON.stringify(order)}\n\n`);
    } catch {
      /* ignore */
    }
  }

  function onOrderUpdate(order) {
    try {
      res.write(`event: order-updated\ndata: ${JSON.stringify(order)}\n\n`);
    } catch {
      /* ignore */
    }
  }

  orderEvents.on("new-order", onNewOrder);
  orderEvents.on("order-updated", onOrderUpdate);

  req.on("close", () => {
    clearInterval(heartbeat);
    orderEvents.off("new-order", onNewOrder);
    orderEvents.off("order-updated", onOrderUpdate);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });
});

// --------------------
// Customer authentication
// --------------------

app.post(
  "/api/auth/register",
  wrap(async (req, res) => {
    const { name, email, password, phone = "" } = req.body;

    if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({
        message: "Name, email and password (8+ characters) required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      passwordHash: await bcrypt.hash(password, 12),
    });

    res.status(201).json({
      token: tokenFor(user),
      user: clean(user),
    });
  }),
);

app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const user = await User.findOne({ email });

    if (
      !user ||
      !(await bcrypt.compare(req.body.password || "", user.passwordHash))
    ) {
      return res.status(401).json({ message: "Email or password incorrect." });
    }

    res.json({ token: tokenFor(user), user: clean(user) });
  }),
);

app.get(
  "/api/auth/me",
  auth,
  wrap(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json({ user: clean(user) });
  }),
);

app.patch(
  "/api/auth/profile",
  auth,
  wrap(async (req, res) => {
    const { name, email, phone = "" } = req.body;

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ message: "Name and email required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.userId },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        name: name.trim(),
        email: normalizedEmail,
        phone: String(phone).trim(),
      },
      { new: true, runValidators: true },
    );

    if (!user) return res.status(404).json({ message: "User not found." });

    res.json({ user: clean(user) });
  }),
);

// --------------------
// Admin authentication
// --------------------

app.post(
  "/api/admin/login",
  wrap(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const adminEmail = String(process.env.ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET;

    if (!adminEmail || !adminPassword || !jwtSecret) {
      console.error("Admin login environment variables are missing.");
      return res
        .status(500)
        .json({ message: "Admin login is not configured." });
    }

    if (email !== adminEmail || req.body.password !== adminPassword) {
      return res.status(401).json({ message: "Invalid admin credentials." });
    }

    const token = jwt.sign({ role: "admin" }, jwtSecret, { expiresIn: "12h" });
    res.json({ token });
  }),
);

// ============================================================
// ✅ Public — global delivery charges (২টা zone)
// ============================================================
app.get(
  "/api/settings/delivery",
  wrap(async (_req, res) => {
    const deliveryCharges = await getGlobalDeliveryCharges();
    res.json({ deliveryCharges });
  }),
);

// --------------------
// Public products
// --------------------

app.get(
  "/api/products",
  wrap(async (req, res) => {
    const filter = { active: true };
    const query = String(req.query.q || "").trim();

    if (query) {
      const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: safeQuery, $options: "i" } },
        { description: { $regex: safeQuery, $options: "i" } },
      ];
    }

    if (req.query.category && req.query.category !== "All") {
      filter.category = String(req.query.category);
    }

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(products);
  }),
);

app.get(
  "/api/products/:slug",
  wrap(async (req, res) => {
    const conditions = [{ slug: req.params.slug }];

    if (mongoose.isValidObjectId(req.params.slug)) {
      conditions.push({ _id: req.params.slug });
    }

    const product = await Product.findOne({
      $or: conditions,
      active: true,
    }).lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const reviews = await Review.find({ product: product._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ product, reviews });
  }),
);

// --------------------
// Product reviews
// --------------------

app.post(
  "/api/products/:id/reviews",
  auth,
  wrap(async (req, res) => {
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || "").trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) {
      return res.status(400).json({ message: "Rating and review required." });
    }

    const [product, user] = await Promise.all([
      Product.findById(req.params.id),
      User.findById(req.userId),
    ]);

    if (!product || !user) {
      return res.status(404).json({
        message: "Please login and Order first to review this product.",
      });
    }

    const review = await Review.findOneAndUpdate(
      { product: product._id, user: user._id },
      {
        product: product._id,
        user: user._id,
        userName: user.name,
        rating,
        comment,
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    res.status(201).json(review);
  }),
);

// --------------------
// Public banners
// --------------------

app.get(
  "/api/banners",
  wrap(async (_req, res) => {
    const banners = await Banner.find({ active: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    res.json(banners);
  }),
);

// --------------------
// Image uploads — Cloudinary
// --------------------

app.post(
  "/api/uploads/image",
  admin,
  wrap(async (req, res) => {
    if (!req.body.imageData) {
      return res.status(400).json({ message: "Image data is required." });
    }
    const imageUrl = await uploadToCloudinary(
      req.body.imageData,
      "take-it-easy/banners",
    );
    res.status(201).json({ imageUrl });
  }),
);

app.post(
  "/api/uploads/images",
  admin,
  wrap(async (req, res) => {
    const images = req.body.images;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: "Images array is required." });
    }

    if (images.length > 10) {
      return res
        .status(400)
        .json({ message: "Maximum 10 images per request." });
    }

    const imageUrls = await Promise.all(
      images.map((imageData) =>
        uploadToCloudinary(imageData, "take-it-easy/products"),
      ),
    );

    res.status(201).json({ imageUrls });
  }),
);

app.post(
  "/api/public/payment-proof",
  wrap(async (req, res) => {
    if (!req.body.imageData) {
      return res
        .status(400)
        .json({ message: "Payment screenshot is required." });
    }

    const imageUrl = await uploadToCloudinary(
      req.body.imageData,
      "take-it-easy/payments",
    );

    res.status(201).json({ imageUrl });
  }),
);

// ============================================================
// ✅ Admin settings (global delivery charges — ২টা zone)
// ============================================================

app.get(
  "/api/admin/settings",
  admin,
  wrap(async (_req, res) => {
    let s = await Settings.findOne({ key: "global" });
    if (!s) {
      s = await Settings.create({
        key: "global",
        deliveryCharges: { dhaka: 60, outside: 130 },
      });
    }

    const d = s.deliveryCharges || {};
    res.json({
      deliveryCharges: {
        dhaka: Math.max(0, Number(d.dhaka ?? 60)),
        outside: Math.max(0, Number(d.outside ?? 130)),
      },
    });
  }),
);

app.patch(
  "/api/admin/settings",
  admin,
  wrap(async (req, res) => {
    const body = req.body.deliveryCharges || {};
    const dhaka = Number(body.dhaka);
    const outside = Number(body.outside);

    if (
      !Number.isFinite(dhaka) ||
      !Number.isFinite(outside) ||
      dhaka < 0 ||
      outside < 0
    ) {
      return res.status(400).json({
        message: "Valid delivery charges required for both zones.",
      });
    }

    const s = await Settings.findOneAndUpdate(
      { key: "global" },
      {
        $set: {
          deliveryCharges: { dhaka, outside },
          globalDeliveryCharge: dhaka,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const d = s.deliveryCharges || {};
    res.json({
      deliveryCharges: {
        dhaka: Math.max(0, Number(d.dhaka ?? 60)),
        outside: Math.max(0, Number(d.outside ?? 130)),
      },
    });
  }),
);

// --------------------
// Admin product management
// --------------------

app.get(
  "/api/admin/products",
  admin,
  wrap(async (_req, res) => {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    res.json(products);
  }),
);

// ✅ POST — ২টা zone delivery charges
app.post(
  "/api/admin/products",
  admin,
  wrap(async (req, res) => {
    const body = req.body;
    const price = Number(body.price);

    if (!body.title?.trim() || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: "Title and valid price required.",
      });
    }

    const sizes = Array.isArray(body.sizes) ? body.sizes : [];
    const rawSizeStock =
      body.sizeStock && typeof body.sizeStock === "object"
        ? body.sizeStock
        : {};
    const sizeStock = buildSizeStock(sizes, rawSizeStock);

    const totalStock = sizes.length
      ? sumSizeStock(sizeStock)
      : Math.max(0, Number(body.stock || 0));

    const dc = body.deliveryCharges || {};
    const deliveryCharges = {
      dhaka: Math.max(0, Number(dc.dhaka || 0)),
      outside: Math.max(0, Number(dc.outside || 0)),
    };

    const product = await Product.create({
      title: body.title.trim(),
      slug: `${slugify(body.title)}-${Date.now().toString(36)}`,
      description: body.description || "",
      price,
      cost: Math.max(0, Number(body.cost || 0)),
      compareAtPrice: Number(body.compareAtPrice || 0),
      discountPercent: Math.max(
        0,
        Math.min(90, Number(body.discountPercent || 0)),
      ),
      deliveryCharges,
      deliveryCharge: 0,
      category: body.category || "Clothing",
      images: Array.isArray(body.images) ? body.images : [],
      sizes,
      sizeStock,
      colors: Array.isArray(body.colors) ? body.colors : [],
      stock: totalStock,
      sku: body.sku || "",
      material: body.material || "",
      gsm: body.gsm || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
      active: true,
    });

    res.status(201).json(product);
  }),
);

// ✅ PATCH — ২টা zone delivery charges
app.patch(
  "/api/admin/products/:id",
  admin,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    const existing = await Product.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Product not found." });
    }

    const allowedFields = [
      "title",
      "description",
      "price",
      "cost",
      "compareAtPrice",
      "discountPercent",
      "deliveryCharges",
      "deliveryCharge",
      "category",
      "images",
      "sizes",
      "colors",
      "sku",
      "material",
      "gsm",
      "tags",
      "active",
    ];

    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] === undefined) continue;

      if (field === "deliveryCharges") {
        const raw = req.body.deliveryCharges || {};
        update.deliveryCharges = {
          dhaka: Math.max(0, Number(raw.dhaka || 0)),
          outside: Math.max(0, Number(raw.outside || 0)),
        };
        continue;
      }

      if (
        [
          "price",
          "cost",
          "compareAtPrice",
          "discountPercent",
          "deliveryCharge",
        ].includes(field)
      ) {
        const num = Number(req.body[field]);
        if (!Number.isFinite(num)) {
          return res.status(400).json({
            message: `Invalid value for ${field}.`,
          });
        }
        if (field === "discountPercent") {
          update[field] = Math.max(0, Math.min(90, num));
        } else if (field === "cost" || field === "deliveryCharge") {
          update[field] = Math.max(0, num);
        } else {
          update[field] = num;
        }
      } else if (["images", "sizes", "colors", "tags"].includes(field)) {
        update[field] = Array.isArray(req.body[field]) ? req.body[field] : [];
      } else if (field === "active") {
        update[field] = Boolean(req.body[field]);
      } else {
        update[field] = req.body[field];
      }
    }

    if (Object.keys(update).length === 0 && req.body.sizeStock === undefined) {
      return res.status(400).json({
        message: "No valid product fields provided.",
      });
    }

    if (update.title?.trim()) {
      update.title = update.title.trim();
      update.slug = `${slugify(update.title)}-${Date.now().toString(36)}`;
    }

    const nextSizes =
      update.sizes !== undefined ? update.sizes : existing.sizes || [];

    const shouldUpdateSizeStock =
      req.body.sizeStock !== undefined || update.sizes !== undefined;

    if (shouldUpdateSizeStock) {
      const prevSizeStock = normalizeSizeStock(existing.sizeStock);
      const rawSizeStock =
        req.body.sizeStock !== undefined ? req.body.sizeStock : prevSizeStock;
      const nextSizeStock = buildSizeStock(nextSizes, rawSizeStock);

      update.sizeStock = nextSizeStock;
      update.stock = nextSizes.length
        ? sumSizeStock(nextSizeStock)
        : Math.max(0, Number(req.body.stock || existing.stock || 0));
    } else if (req.body.stock !== undefined) {
      update.stock = Math.max(0, Number(req.body.stock || 0));
    }

    const product = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    res.json(product);
  }),
);

app.delete(
  "/api/admin/products/:id",
  admin,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    await Review.deleteMany({ product: product._id });
    res.json({ message: "Product deleted." });
  }),
);

// --------------------
// Admin banner management
// --------------------

app.get(
  "/api/admin/banners",
  admin,
  wrap(async (_req, res) => {
    const banners = await Banner.find().sort({ sortOrder: 1 }).lean();
    res.json(banners);
  }),
);

app.post(
  "/api/admin/banners",
  admin,
  wrap(async (req, res) => {
    const body = req.body;
    if (!body.imageUrl) {
      return res.status(400).json({ message: "Banner image required." });
    }

    const banner = await Banner.create({
      ...body,
      sortOrder: Number(body.sortOrder || 0),
    });

    res.status(201).json(banner);
  }),
);

app.patch(
  "/api/admin/banners/:id",
  admin,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid banner ID." });
    }

    const allowedFields = [
      "title",
      "subtitle",
      "imageUrl",
      "link",
      "active",
      "sortOrder",
    ];

    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] =
          field === "sortOrder" ? Number(req.body[field]) : req.body[field];
      }
    }

    const banner = await Banner.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!banner) {
      return res.status(404).json({ message: "Banner not found." });
    }

    res.json(banner);
  }),
);

app.delete(
  "/api/admin/banners/:id",
  admin,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid banner ID." });
    }

    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: "Banner not found." });
    }

    res.json({ message: "Banner deleted." });
  }),
);

// --------------------
// ✅ Create an order — ২টা zone
// --------------------

app.post(
  "/api/orders",
  wrap(async (req, res) => {
    const body = req.body;

    if (
      !body.customerName?.trim() ||
      !body.phone?.trim() ||
      !body.address?.trim() ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      return res.status(400).json({
        message: "Name, phone, address and cart items required.",
      });
    }

    const paymentMethods = ["cod", "bkash", "nagad", "rocket"];
    const method = paymentMethods.includes(body.paymentMethod)
      ? body.paymentMethod
      : "cod";

    if (
      method !== "cod" &&
      !String(body.transactionId || "").trim() &&
      !String(body.paymentScreenshot || "").trim()
    ) {
      return res.status(400).json({
        message: "Enter transaction ID or upload screenshot.",
      });
    }

    const productIds = body.items.map((item) => item.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      active: true,
    });

    const productMap = new Map(
      products.map((product) => [String(product._id), product]),
    );

    const items = [];

    for (const item of body.items) {
      const product = productMap.get(String(item.productId));

      if (!product) {
        return res.status(400).json({
          message: "A product is no longer available.",
        });
      }

      const quantity = Number(item.quantity || 1);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return res.status(400).json({ message: "Invalid product quantity." });
      }

      const size = String(item.size || "");

      if (size && product.sizeStock?.get(size) !== undefined) {
        const available = product.sizeStock.get(size) || 0;
        if (available < quantity) {
          return res.status(400).json({
            message: `${product.title} (Size: ${size}) — only ${available} left in stock.`,
          });
        }
      } else if (Number(product.stock || 0) < quantity) {
        return res.status(400).json({
          message: `${product.title} — only ${product.stock} left in stock.`,
        });
      }

      items.push({
        product: product._id,
        title: product.title,
        image: product.images?.[0] || "",
        price: product.price,
        quantity,
        size,
      });
    }

    for (const item of body.items) {
      const product = productMap.get(String(item.productId));
      const quantity = Number(item.quantity || 1);
      const size = String(item.size || "");

      if (size && product.sizeStock?.get(size) !== undefined) {
        const available = product.sizeStock.get(size) || 0;
        product.sizeStock.set(size, Math.max(0, available - quantity));
      }

      product.stock = Math.max(0, Number(product.stock || 0) - quantity);
      await product.save();
    }

    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // ============================================================
    // ✅ ২টা zone delivery — customer choice অথবা city থেকে detect
    // Priority: product zone charge > global zone charge
    // ============================================================
    const bodyZone = String(body.deliveryZone || "").trim();
    const zone = VALID_ZONES.includes(bodyZone)
      ? bodyZone
      : detectDeliveryZoneFromCity(body.city, body.address);

    const globalCharges = await getGlobalDeliveryCharges();

    const productZoneCharges = products
      .map((p) => {
        const dc = p.deliveryCharges || {};
        const val = Number(dc[zone] || 0);
        return val > 0 ? val : 0;
      })
      .filter((n) => n > 0);

    const autoDelivery = productZoneCharges.length
      ? Math.max(...productZoneCharges)
      : globalCharges[zone];

    const requestedDelivery = Number(body.deliveryCharge ?? autoDelivery);
    const deliveryCharge = Number.isFinite(requestedDelivery)
      ? Math.max(0, requestedDelivery)
      : autoDelivery;

    const orderNumber =
      `TIE-${Date.now().toString(36).toUpperCase()}-` +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    let userId = null;
    try {
      const decoded = jwt.verify(body.token || "", process.env.JWT_SECRET);
      if (decoded.role === "customer" && decoded.sub) {
        userId = decoded.sub;
      }
    } catch {
      // Guest checkout
    }

    const order = await Order.create({
      orderNumber,
      user: userId,
      customerName: body.customerName.trim(),
      phone: body.phone.trim(),
      email: body.email || "",
      address: body.address.trim(),
      city: body.city || "",
      items,
      subtotal,
      deliveryCharge,
      deliveryZone: zone,
      total: subtotal + deliveryCharge,
      paymentMethod: method,
      transactionId: body.transactionId || "",
      paymentScreenshot: body.paymentScreenshot || "",
      paymentStatus: method === "cod" ? "not_required" : "pending_verification",
    });

    const formatMoney = (amount) =>
      `৳${Number(amount || 0).toLocaleString("en-BD")}`;

    const paymentLabels = {
      cod: "Cash on Delivery (COD)",
      bkash: "bKash",
      nagad: "Nagad",
      rocket: "Rocket",
    };

    const zoneLabels = { dhaka: "Inside Dhaka", outside: "Outside Dhaka" };

    const itemList = items
      .map((item, index) => {
        const sizeText = item.size ? ` | Size: ${item.size}` : "";
        const lineTotal = item.price * item.quantity;

        return [
          `${index + 1}. ${item.title}`,
          `   Quantity: ${item.quantity}${sizeText}`,
          `   Unit Price: ${formatMoney(item.price)}`,
          `   Item Total: ${formatMoney(lineTotal)}`,
        ].join("\n");
      })
      .join("\n\n");

    const address = [order.address, order.city]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ");

    const paymentDetails =
      method === "cod"
        ? "Payment Status: Pay on delivery"
        : [
            `Transaction ID: ${order.transactionId || "Not provided"}`,
            `Payment Status: ${order.paymentStatus || "Pending verification"}`,
          ].join("\n");

    const notification = [
      "🛍️ TAKE IT EASY",
      "━━━━━━━━━━━━━━━━━━━━",
      "✨ NEW ORDER RECEIVED",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "🧾 ORDER INFORMATION",
      `Order ID: ${orderNumber}`,
      `Order Status: ${(order.status || "pending").toUpperCase()}`,
      `Delivery Zone: ${zoneLabels[zone] || zone}`,
      "",
      "👤 CUSTOMER DETAILS",
      `Name: ${order.customerName}`,
      `Phone: ${order.phone}`,
      `Address: ${address || "Not provided"}`,
      ...(order.email ? [`Email: ${order.email}`] : []),
      "",
      "📦 ORDER SUMMARY",
      "────────────────────",
      itemList,
      "",
      "💳 PAYMENT DETAILS",
      `Payment Method: ${paymentLabels[method] || method.toUpperCase()}`,
      paymentDetails,
      `Payment Screenshot: ${order.paymentScreenshot || "Not provided"}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      `Subtotal: ${formatMoney(order.subtotal)}`,
      `Delivery Charge (${zoneLabels[zone] || zone}): ${formatMoney(order.deliveryCharge)}`,
      `💰 TOTAL PAYABLE: ${formatMoney(order.total)}`,
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "Thank you for choosing TAKE IT EASY.",
      "Please review and process this order.",
    ].join("\n");

    try {
      await telegram(notification);
    } catch (error) {
      console.error("Telegram notification failed:", error.message);
    }

    try {
      orderEvents.emit("new-order", {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        phone: order.phone,
        address: order.address,
        city: order.city,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        deliveryZone: order.deliveryZone,
        createdAt: order.createdAt,
        items: order.items,
      });
    } catch (error) {
      console.error("SSE emit failed:", error.message);
    }

    res.status(201).json({
      orderNumber,
      status: order.status,
      total: order.total,
      deliveryZone: order.deliveryZone,
    });
  }),
);

// --------------------
// Track an order
// --------------------

app.post(
  "/api/orders/track",
  wrap(async (req, res) => {
    const orderNumber = String(req.body.orderNumber || "").trim();
    const phone = String(req.body.phone || "").trim();

    if (!orderNumber || !phone) {
      return res.status(400).json({
        message: "Order number and phone are required.",
      });
    }

    const order = await Order.findOne({ orderNumber, phone })
      .select("-user -email -paymentScreenshot -transactionId")
      .lean();

    if (!order) {
      return res.status(404).json({
        message: "Order number and phone did not match.",
      });
    }

    res.json(order);
  }),
);

// --------------------
// Customer order history
// --------------------

app.get(
  "/api/orders/mine",
  auth,
  wrap(async (req, res) => {
    const orders = await Order.find({ user: req.userId })
      .select("-paymentScreenshot -transactionId")
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  }),
);

// --------------------
// Admin order management
// --------------------

app.get(
  "/api/admin/orders/new",
  admin,
  wrap(async (_req, res) => {
    const orders = await Order.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(orders);
  }),
);

app.get(
  "/api/admin/orders",
  admin,
  wrap(async (_req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json(orders);
  }),
);

app.patch(
  "/api/admin/orders/:id",
  admin,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    const update = {};

    const allowedStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    const allowedPaymentStatuses = [
      "not_required",
      "pending_verification",
      "verified",
      "rejected",
    ];

    if (allowedStatuses.includes(req.body.status)) {
      update.status = req.body.status;
    }

    if (allowedPaymentStatuses.includes(req.body.paymentStatus)) {
      update.paymentStatus = req.body.paymentStatus;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        message: "No valid order changes provided.",
      });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    try {
      orderEvents.emit("order-updated", {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
      });
    } catch (error) {
      console.error("SSE emit failed:", error.message);
    }

    res.json(order);
  }),
);

// ============================================================
// Admin — Delivery Charge Override
// ============================================================
app.patch(
  "/api/admin/orders/:id/delivery-charge",
  admin,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    const newCharge = Number(req.body.deliveryCharge);

    if (!Number.isFinite(newCharge) || newCharge < 0) {
      return res
        .status(400)
        .json({ message: "Valid delivery charge required." });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    order.deliveryCharge = newCharge;
    order.total = Number(order.subtotal || 0) + newCharge;
    await order.save();

    try {
      orderEvents.emit("order-updated", {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryCharge: order.deliveryCharge,
        total: order.total,
      });
    } catch (error) {
      console.error("SSE emit failed:", error.message);
    }

    res.json({
      message: "Delivery charge updated",
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        deliveryCharge: order.deliveryCharge,
        total: order.total,
      },
    });
  }),
);

// ============================================================
// Admin — Delete an order
// ============================================================
app.delete(
  "/api/admin/orders/:id",
  admin,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    try {
      orderEvents.emit("order-updated", {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        deleted: true,
      });
    } catch (error) {
      console.error("SSE emit failed:", error.message);
    }

    res.json({
      message: "Order deleted successfully.",
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
  }),
);

// ============================================================
// Admin — Reports
// ============================================================
app.get(
  "/api/admin/reports",
  admin,
  wrap(async (req, res) => {
    const filter = buildReportFilter(req.query);

    const orders = await Order.find(filter).lean();
    const products = await Product.find().lean();

    const costMap = new Map();
    for (const p of products) {
      costMap.set(String(p._id), Number(p.cost || 0));
    }

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let totalWaste = 0;
    let deliveredOrders = 0;
    let cancelledOrders = 0;
    let pendingOrders = 0;
    let paidOrders = 0;
    let totalDeliveryCollected = 0;
    let totalItemsSold = 0;

    const perProduct = new Map();

    for (const order of orders) {
      const isCancelled = order.status === "cancelled";
      const isDelivered = order.status === "delivered";
      const isPending = order.status === "pending";

      if (isCancelled) cancelledOrders++;
      if (isDelivered) deliveredOrders++;
      if (isPending) pendingOrders++;
      if (order.paymentStatus === "verified") paidOrders++;

      if (!isCancelled) {
        totalRevenue += Number(order.total || 0);
        totalDeliveryCollected += Number(order.deliveryCharge || 0);
      }

      for (const item of order.items || []) {
        const quantity = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const cost = costMap.get(String(item.product)) || 0;

        totalItemsSold += quantity;

        const itemRevenue = price * quantity;
        const itemCost = cost * quantity;

        const key = String(item.product);
        if (!perProduct.has(key)) {
          perProduct.set(key, {
            productId: key,
            title: item.title || "Unknown",
            quantitySold: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
            cancelledQty: 0,
          });
        }
        const bucket = perProduct.get(key);

        if (isCancelled) {
          totalWaste += itemCost;
          bucket.cancelledQty += quantity;
        } else if (isDelivered) {
          totalCost += itemCost;
          totalProfit += itemRevenue - itemCost;
          bucket.quantitySold += quantity;
          bucket.revenue += itemRevenue;
          bucket.cost += itemCost;
          bucket.profit += itemRevenue - itemCost;
        } else {
          bucket.quantitySold += quantity;
          bucket.revenue += itemRevenue;
          bucket.cost += itemCost;
          bucket.profit += itemRevenue - itemCost;
        }
      }
    }

    for (const bucket of perProduct.values()) {
      if (bucket.profit < 0) {
        totalLoss += Math.abs(bucket.profit);
      }
    }

    const perProductList = Array.from(perProduct.values()).sort(
      (a, b) => b.profit - a.profit,
    );

    res.json({
      period: {
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
      },
      summary: {
        totalOrders: orders.length,
        deliveredOrders,
        cancelledOrders,
        pendingOrders,
        paidOrders,
        totalRevenue,
        totalCost,
        totalProfit,
        totalLoss,
        totalWaste,
        totalDeliveryCollected,
        totalItemsSold,
      },
      perProduct: perProductList,
    });
  }),
);

// ============================================================
// Admin — CSV Export
// ============================================================
app.get(
  "/api/admin/reports/export",
  admin,
  wrap(async (req, res) => {
    const filter = buildReportFilter(req.query);

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    const products = await Product.find().lean();

    const costMap = new Map();
    for (const p of products) {
      costMap.set(String(p._id), Number(p.cost || 0));
    }

    const header = [
      "Order Number",
      "Order Date",
      "Status",
      "Delivery Zone",
      "Payment Status",
      "Payment Method",
      "Customer Name",
      "Phone",
      "Address",
      "Product Title",
      "Size",
      "Quantity",
      "Unit Price",
      "Unit Cost",
      "Item Revenue",
      "Item Cost",
      "Item Profit",
      "Delivery Charge",
      "Order Subtotal",
      "Order Total",
    ];

    const csvSafe = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const rows = [header.map(csvSafe).join(",")];

    for (const order of orders) {
      const isCancelled = order.status === "cancelled";

      for (const item of order.items || []) {
        const qty = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const cost = costMap.get(String(item.product)) || 0;
        const revenue = price * qty;
        const itemCost = cost * qty;
        const profit = isCancelled ? -itemCost : revenue - itemCost;

        rows.push(
          [
            order.orderNumber,
            order.createdAt ? new Date(order.createdAt).toISOString() : "",
            order.status,
            order.deliveryZone || "",
            order.paymentStatus,
            order.paymentMethod,
            order.customerName,
            order.phone,
            `${order.address || ""}${order.city ? `, ${order.city}` : ""}`,
            item.title,
            item.size || "",
            qty,
            price,
            cost,
            revenue,
            itemCost,
            profit,
            order.deliveryCharge || 0,
            order.subtotal || 0,
            order.total || 0,
          ]
            .map(csvSafe)
            .join(","),
        );
      }
    }

    const csv = rows.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="take-it-easy-report-${Date.now()}.csv"`,
    );
    res.send(csv);
  }),
);

// --------------------
// Unknown API routes
// --------------------

app.use((req, res) => {
  res.status(404).json({
    message: "API route not found.",
    path: req.originalUrl,
    hint: "Check the API URL. Available endpoints use /api/...",
  });
});

// --------------------
// Central error handler
// --------------------

app.use((error, _req, res, _next) => {
  console.error(error);

  if (res.headersSent) return;

  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;

  res.status(status).json({
    message: status === 500 ? "Internal server error." : error.message,
  });
});

// --------------------
// Vercel Serverless export
// --------------------

export default app;
