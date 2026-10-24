import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, default: "" },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 90 },
    category: { type: String, default: "Clothing" },
    images: [String],
    sizes: [String],
    colors: [String],

    // ✅ per-size stock — { M: 10, L: 0, XL: 5 }
    // Mongoose-এ Map হিসেবে define করলে .save() করলে auto .set()/.get() পাবে
    sizeStock: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    // ✅ Legacy total stock — sizeStock এর sum রাখো (backward compat)
    stock: { type: Number, default: 0 },

    sku: String,
    material: String,
    gsm: String,
    tags: [String],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: String,
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true, maxlength: 1200 },
  },
  { timestamps: true },
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    customerName: String,
    phone: { type: String, index: true },
    email: String,
    address: String,
    city: String,
    items: [
      {
        product: mongoose.Schema.Types.ObjectId,
        title: String,
        image: String,
        price: Number,
        quantity: Number,
        size: String,
      },
    ],
    subtotal: Number,
    deliveryCharge: Number,
    total: Number,
    paymentMethod: { type: String, enum: ["cod", "bkash", "nagad", "rocket"] },
    paymentNumber: { type: String, default: "01933200699" },
    transactionId: { type: String, default: "" },
    paymentScreenshot: { type: String, default: "" },
    paymentStatus: {
      type: String,
      enum: ["not_required", "pending_verification", "verified", "rejected"],
      default: "not_required",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
  },
  { timestamps: true },
);

const bannerSchema = new mongoose.Schema(
  {
    title: String,
    subtitle: String,
    imageUrl: { type: String, required: true },
    buttonText: { type: String, default: "Shop now" },
    buttonLink: { type: String, default: "/products" },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
export const Product = mongoose.model("Product", productSchema);
export const Review = mongoose.model("Review", reviewSchema);
export const Order = mongoose.model("Order", orderSchema);
export const Banner = mongoose.model("Banner", bannerSchema);
