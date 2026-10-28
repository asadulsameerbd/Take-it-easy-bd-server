import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";

// ✅ Cloudinary configure
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

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

/* ============================================================ */
/* ✅ Cloudinary Upload — replaces imgBB()                      */
/* ============================================================ */
export async function uploadToCloudinary(dataUrl, folder = "take-it-easy") {
  if (!dataUrl) {
    throw new Error("Image is required.");
  }

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error(
      "Cloudinary credentials missing in server .env (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)",
    );
  }

  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder,
      resource_type: "image",
      transformation: [{ quality: "auto:good", fetch_format: "auto" }],
    });

    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error(
      error?.message || "Cloudinary upload failed. Please try again.",
    );
  }
}

// ✅ Backward compat — পুরনো imgBB() call-ও কাজ করবে
export const imgBB = uploadToCloudinary;

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
