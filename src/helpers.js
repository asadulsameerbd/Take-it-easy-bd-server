import jwt from "jsonwebtoken";

export const tokenFor = (user) =>
  jwt.sign(
    { sub: String(user._id), role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

export function auth(req, res, next) {
  try {
    const t = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    const d = jwt.verify(t, process.env.JWT_SECRET);

    if (d.role !== "customer") throw new Error();

    req.userId = d.sub;
    next();
  } catch {
    return res.status(401).json({
      message: "Please log in first.",
    });
  }
}

export function admin(req, res, next) {
  try {
    const t = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (jwt.verify(t, process.env.JWT_SECRET).role !== "admin") {
      throw new Error();
    }

    next();
  } catch {
    return res.status(401).json({
      message: "Admin login required.",
    });
  }
}

export const slugify = (s) =>
  String(s || "product")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `product-${Date.now()}`;

export async function imgBB(dataUrl) {
  if (!dataUrl) {
    throw new Error("Image is required.");
  }

  if (!process.env.IMGBB_API_KEY) {
    throw new Error("Set IMGBB_API_KEY in server .env");
  }

  const image = String(dataUrl).replace(/^data:image\/\w+;base64,/, "");

  const body = new URLSearchParams({ image });

  const r = await fetch(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
    {
      method: "POST",
      body,
    },
  );

  const j = await r.json();

  if (!r.ok || !j.success) {
    throw new Error(j.error?.message || "ImgBB upload failed");
  }

  return j.data.url;
}

export async function telegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing in server .env");
  }

  if (!chatId) {
    throw new Error("TELEGRAM_CHAT_ID is missing in server .env");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(message),
      }),
    },
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      result.description ||
        `Telegram API failed with status ${response.status}`,
    );
  }

  console.log("Telegram notification sent successfully.");
  return result;
}
