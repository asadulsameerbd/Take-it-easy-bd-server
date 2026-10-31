import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";

// ============================================================
// Cloudinary configuration
// ============================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ============================================================
// JWT configuration
// ============================================================

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing from server environment.");
  }

  if (String(secret).length < 32) {
    throw new Error(
      `JWT_SECRET is too short (${String(secret).length} chars). Must be at least 32 characters.`,
    );
  }

  return secret;
};

// ============================================================
// Customer token
// ============================================================

export const tokenFor = (user) =>
  jwt.sign(
    {
      sub: String(user._id),
      role: "customer",
    },
    getJwtSecret(),
    { expiresIn: "7d" },
  );

// ============================================================
// Admin token generator
// ============================================================

export const tokenForAdmin = (email = "store-admin") =>
  jwt.sign(
    {
      sub: "store-admin",
      role: "admin",
      email: String(email || "")
        .trim()
        .toLowerCase(),
    },
    getJwtSecret(),
    { expiresIn: "12h" },
  );

// ============================================================
// Extract Bearer token
// ============================================================

const getBearerToken = (req) => {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

// ============================================================
// Customer authentication
// ============================================================

export function auth(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        message: "Please log in first.",
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    if (decoded.role !== "customer" || !decoded.sub) {
      throw new Error("Invalid customer token.");
    }

    req.userId = decoded.sub;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Please log in first.",
    });
  }
}

// ============================================================
// Admin authentication
// ============================================================

export function admin(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        message: "Admin login required.",
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    if (decoded.role !== "admin") {
      throw new Error("Invalid admin token.");
    }

    req.adminId = decoded.sub || "store-admin";
    req.adminEmail = decoded.email || "";
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Admin login required.",
    });
  }
}

// ============================================================
// Slug helper
// ============================================================

export const slugify = (s) =>
  String(s || "product")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `product-${Date.now()}`;

// ============================================================
// Cloudinary Upload
// ============================================================

export async function uploadToCloudinary(dataUrl, folder = "take-it-easy") {
  if (!dataUrl) {
    throw new Error("Image is required.");
  }

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error("Cloudinary credentials are missing.");
  }

  try {
    let buffer;

    if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
      const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else if (typeof dataUrl === "string") {
      buffer = Buffer.from(dataUrl, "base64");
    } else if (Buffer.isBuffer(dataUrl)) {
      buffer = dataUrl;
    } else {
      throw new Error("Invalid image data format.");
    }

    if (!buffer.length) {
      throw new Error("Empty image data.");
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          transformation: [
            {
              quality: "auto:good",
              fetch_format: "auto",
            },
          ],
        },
        (error, uploadResult) => {
          if (error) {
            return reject(error);
          }
          resolve(uploadResult);
        },
      );

      stream.end(buffer);
    });

    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary upload error:", error.message);
    throw new Error(error.message || "Cloudinary upload failed.");
  }
}

// Backward compatibility
export const imgBB = uploadToCloudinary;

// ============================================================
// Telegram notification
// ============================================================

export async function telegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Telegram bot token or chat ID is missing.");
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
      result.description || `Telegram API failed: ${response.status}`,
    );
  }

  console.log("Telegram notification sent successfully.");
  return result;
}
