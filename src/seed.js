import { Product, Banner } from "./models.js";

const demoProducts = [
  {
    sku: "TIE-TS-001",
    title: "Classic Oversized Tee",
    description:
      "A relaxed everyday tee made for easy layering. Soft-touch cotton with a clean silhouette.",
    price: 550,
    compareAtPrice: 650,
    category: "Oversized T-shirt",
    images: [
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL", "XXL"],
    sizeStock: { M: 5, L: 6, XL: 4, XXL: 3 },
    colors: ["White", "Black"],
    stock: 18,
    material: "Compact cotton",
    gsm: "220 GSM",
    tags: ["basic", "oversized", "everyday"],
    // ✅ Zone-wise delivery (0 = global default use হবে)
    deliveryCharges: { dhaka: 0, ashulia: 0, outside: 0 },
    active: true,
  },
  {
    sku: "TIE-TS-002",
    title: "Everyday Black Tee",
    description:
      "A versatile black oversized T-shirt with a structured drop-shoulder fit.",
    price: 590,
    compareAtPrice: 690,
    category: "Oversized T-shirt",
    images: [
      "https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL", "XXL"],
    sizeStock: { M: 4, L: 5, XL: 3, XXL: 2 },
    colors: ["Black"],
    stock: 14,
    material: "Cotton",
    gsm: "220 GSM",
    tags: ["black", "oversized"],
    deliveryCharges: { dhaka: 0, ashulia: 0, outside: 0 },
    active: true,
  },
  {
    sku: "TIE-TS-003",
    title: "Weekend Graphic Tee",
    description:
      "A graphic-inspired casual tee for relaxed weekends and daily wear.",
    price: 620,
    compareAtPrice: 720,
    category: "Graphic T-shirt",
    images: [
      "https://images.unsplash.com/photo-1527719327859-c6ce80353573?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL"],
    sizeStock: { M: 4, L: 4, XL: 2 },
    colors: ["Black", "White"],
    stock: 10,
    material: "Cotton blend",
    gsm: "220 GSM",
    tags: ["graphic", "weekend"],
    deliveryCharges: { dhaka: 0, ashulia: 0, outside: 0 },
    active: true,
  },
  {
    sku: "TIE-TS-004",
    title: "Minimal White Tee",
    description:
      "A clean white staple with a roomy fit and easy everyday styling.",
    price: 520,
    compareAtPrice: 600,
    category: "Basic T-shirt",
    images: [
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL", "XXL"],
    sizeStock: { M: 6, L: 6, XL: 5, XXL: 3 },
    colors: ["White"],
    stock: 20,
    material: "Compact cotton",
    gsm: "220 GSM",
    tags: ["white", "minimal", "basic"],
    deliveryCharges: { dhaka: 0, ashulia: 0, outside: 0 },
    active: true,
  },
  {
    sku: "TIE-TS-005",
    title: "Streetwear Drop Shoulder",
    description:
      "A roomy drop-shoulder fit designed for a laid-back streetwear look.",
    price: 650,
    compareAtPrice: 750,
    category: "Drop Shoulder",
    images: [
      "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL", "XXL"],
    sizeStock: { M: 3, L: 4, XL: 3, XXL: 2 },
    colors: ["Black", "Charcoal"],
    stock: 12,
    material: "Cotton",
    gsm: "230 GSM",
    tags: ["streetwear", "drop shoulder"],
    // ✅ Premium product — zone-wise আলাদা delivery charge
    deliveryCharges: { dhaka: 100, ashulia: 120, outside: 160 },
    active: true,
  },
  {
    sku: "TIE-TS-006",
    title: "Earth Tone Oversized Tee",
    description:
      "An easy neutral shade that pairs with denim, cargos, and everyday essentials.",
    price: 590,
    compareAtPrice: 680,
    category: "Oversized T-shirt",
    images: [
      "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL"],
    sizeStock: { M: 3, L: 3, XL: 3 },
    colors: ["Beige", "Olive"],
    stock: 9,
    material: "Cotton",
    gsm: "220 GSM",
    tags: ["neutral", "oversized"],
    deliveryCharges: { dhaka: 0, ashulia: 0, outside: 0 },
    active: true,
  },
  {
    sku: "TIE-TS-007",
    title: "Relaxed Fit Essential",
    description:
      "A dependable wardrobe basic with a relaxed fit and understated finish.",
    price: 540,
    compareAtPrice: 620,
    category: "Basic T-shirt",
    images: [
      "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL", "XXL"],
    sizeStock: { M: 5, L: 5, XL: 4, XXL: 2 },
    colors: ["White", "Black", "Grey"],
    stock: 16,
    material: "Cotton",
    gsm: "220 GSM",
    tags: ["essential", "basic"],
    deliveryCharges: { dhaka: 0, ashulia: 0, outside: 0 },
    active: true,
  },
  {
    sku: "TIE-TS-008",
    title: "Daily Rotation Tee",
    description:
      "Built for repeat wears, with a simple shape and easy styling.",
    price: 560,
    compareAtPrice: 640,
    category: "Casual T-shirt",
    images: [
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1000&q=85",
    ],
    sizes: ["M", "L", "XL"],
    sizeStock: { M: 4, L: 4, XL: 3 },
    colors: ["Black", "Cream"],
    stock: 11,
    material: "Cotton blend",
    gsm: "220 GSM",
    tags: ["casual", "daily"],
    deliveryCharges: { dhaka: 0, ashulia: 0, outside: 0 },
    active: true,
  },
];

const demoBanners = [
  {
    title: "Wear your own kind of easy.",
    subtitle: "Everyday essentials. Made to move with you.",
    imageUrl:
      "https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=1800&q=90",
    buttonText: "Shop collection",
    buttonLink: "/products",
    active: true,
    sortOrder: 1,
  },
  {
    title: "Your daily uniform, upgraded.",
    subtitle: "Relaxed fits. Easy colours. No extra fuss.",
    imageUrl:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1800&q=90",
    buttonText: "Explore the shop",
    buttonLink: "/products",
    active: true,
    sortOrder: 2,
  },
];

export async function seedDemoData() {
  const productCount = await Product.countDocuments();

  if (productCount === 0) {
    for (const item of demoProducts) {
      const slug = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await Product.create({ ...item, slug });
    }
    console.log(`Seeded ${demoProducts.length} demo products.`);
  }

  if ((await Banner.countDocuments()) === 0) {
    await Banner.insertMany(demoBanners);
    console.log(`Seeded ${demoBanners.length} demo banners.`);
  }
}
