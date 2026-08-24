const createError = require("http-errors");
const JWT = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { UserModel } = require("../app/models/user");
const mongoose = require("mongoose");
const moment = require("moment-jalali");
const crypto = require("crypto");

function secretKeyGenerator() {
  return crypto.randomBytes(32).toString("hex").toUpperCase();
}

function generateRandomNumber(length) {
  if (length === 5) {
    return Math.floor(10000 + Math.random() * 90000);
  }
  if (length === 6) {
    return Math.floor(100000 + Math.random() * 900000);
  }
}

function toPersianDigits(n) {
  const farsiDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return n.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x)]);
}

async function setAccessToken(res, user) {
  const cookieOptions = {
    maxAge: 1000 * 60 * 60 * 24 * 1,
    httpOnly: true,
    signed: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "development" ? false : true,
  };

  res.cookie(
    "accessToken",
    await generateToken(user, "1d", process.env.ACCESS_TOKEN_SECRET_KEY),
    cookieOptions,
  );
}

async function setRefreshToken(res, user) {
  const cookieOptions = {
    maxAge: 1000 * 60 * 60 * 24 * 365,
    httpOnly: true,
    signed: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "development" ? false : true,
  };

  res.cookie(
    "refreshToken",
    await generateToken(user, "1y", process.env.REFRESH_TOKEN_SECRET_KEY),
    cookieOptions,
  );
}

function generateToken(user, expiresIn, secret) {
  return new Promise((resolve, reject) => {
    const payload = {
      _id: user._id,
    };

    const options = {
      expiresIn,
    };

    JWT.sign(
      payload,
      secret || process.env.TOKEN_SECRET_KEY,
      options,
      (err, token) => {
        if (err) reject(createError.InternalServerError("خطای سروری"));
        resolve(token);
      },
    );
  });
}
function verifyRefreshToken(req) {
  const refreshToken = req.signedCookies["refreshToken"];
  if (!refreshToken) {
    throw createError.Unauthorized("لطفا وارد حساب کاربری خود شوید.");
  }
  const token = cookieParser.signedCookie(
    refreshToken,
    process.env.COOKIE_PARSER_SECRET_KEY,
  );
  return new Promise((resolve, reject) => {
    JWT.verify(
      token,
      process.env.REFRESH_TOKEN_SECRET_KEY,
      async (err, payload) => {
        try {
          if (err)
            reject(createError.Unauthorized("لطفا حساب کاربری خود شوید"));
          const { _id } = payload;
          const user = await UserModel.findById(_id, {
            password: 0,
            otp: 0,
            resetLink: 0,
          });
          if (!user) reject(createError.Unauthorized("حساب کاربری یافت نشد"));
          return resolve(_id);
        } catch (error) {
          reject(createError.Unauthorized("حساب کاربری یافت نشد"));
        }
      },
    );
  });
}

async function getUserCartDetail(userId) {
  const cartDetail = await UserModel.aggregate([
    {
      $match: { _id: userId },
    },
    {
      $project: {
        cart: 1,
        name: 1,
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "cart.products.productId",
        foreignField: "_id",
        as: "productDetail",
      },
    },
    {
      $lookup: {
        from: "coupons",
        localField: "cart.coupon",
        foreignField: "_id",
        as: "coupon",
      },
    },
    {
      $project: {
        name: 1,
        coupon: { $arrayElemAt: ["$coupon", 0] },
        cart: 1,
        productDetail: {
          _id: 1,
          slug: 1,
          title: 1,
          icon: 1,
          discount: 1,
          price: 1,
          offPrice: 1,
          imageLink: 1,
        },
      },
    },
  ]);

  if (!cartDetail.length) return [];

  const cart = cartDetail[0];

  // --------------------------------------------------
  // Add quantity to each product
  // --------------------------------------------------

  let productDetail = cart.productDetail.map((product) => {
    const cartProduct = cart.cart.products.find(
      (item) => item.productId.toString() === product._id.toString(),
    );

    return {
      ...product,
      quantity: cartProduct?.quantity || 0,
    };
  });

  // --------------------------------------------------
  // Apply coupon
  // --------------------------------------------------

  let coupon = cart.coupon;

  if (!coupon) {
    coupon = null;
  } else {
    const isExpiredCoupon =
      coupon.expireDate && new Date(coupon.expireDate).getTime() < Date.now();

    const isReachedLimit = coupon.usageCount >= coupon.usageLimit;

    if (!coupon.isActive || isReachedLimit || isExpiredCoupon) {
      coupon = null;
    } else {
      productDetail = productDetail.map((product) => {
        // Product already has discount
        if (product.discount) return product;

        const couponHasProduct = coupon.productIds?.some(
          (id) => id.toString() === product._id.toString(),
        );

        if (!couponHasProduct) return product;

        // Fixed product coupon
        if (coupon.type === "fixedProduct") {
          if (product.price < coupon.amount) {
            return product;
          }

          return {
            ...product,
            offPrice: product.price - coupon.amount,
          };
        }

        // Percentage coupon
        if (coupon.type === "percent") {
          return {
            ...product,
            offPrice: parseInt(product.price * (1 - coupon.amount / 100)),
          };
        }

        return product;
      });

      coupon = {
        code: coupon.code,
        _id: coupon._id,
      };
    }
  }

  // --------------------------------------------------
  // Payment details
  // --------------------------------------------------

  const totalPrice = productDetail.reduce(
    (total, product) => total + parseInt(product.offPrice * product.quantity),
    0,
  );

  const totalGrossPrice = productDetail.reduce(
    (total, product) => total + parseInt(product.price * product.quantity),
    0,
  );

  const totalOffAmount = productDetail.reduce(
    (total, product) =>
      total + parseInt((product.price - product.offPrice) * product.quantity),
    0,
  );

  const orderItems = productDetail.map((product) => ({
    price: product.offPrice,
    product: product._id,
  }));

  const productIds = productDetail.map((product) => product._id);

  const description = `${productDetail
    .map((product) => product.title)
    .join(" - ")} | ${cart.name}`;

  const payDetail = {
    totalOffAmount,
    totalPrice,
    totalGrossPrice,
    orderItems,
    productIds,
    description,
  };

  return copyObject([
    {
      ...cart,
      productDetail,
      coupon,
      payDetail,
    },
  ]);
}
function copyObject(object) {
  return JSON.parse(JSON.stringify(object));
}
function deleteInvalidPropertyInObject(data = {}, blackListFields = []) {
  // let nullishData = ["", " ", "0", 0, null, undefined];
  let nullishData = ["", " ", null, undefined];
  Object.keys(data).forEach((key) => {
    if (blackListFields.includes(key)) delete data[key];
    if (typeof data[key] == "string") data[key] = data[key].trim();
    if (Array.isArray(data[key]) && data[key].length > 0)
      data[key] = data[key].map((item) => item.trim());
    if (Array.isArray(data[key]) && data[key].length == 0) delete data[key];
    if (nullishData.includes(data[key])) delete data[key];
  });
}
async function checkProductExist(id) {
  const { ProductModel } = require("../app/models/product");
  if (!mongoose.isValidObjectId(id))
    throw createError.BadRequest("شناسه محصول ارسال شده صحیح نمیباشد");
  const product = await ProductModel.findById(id);
  if (!product) throw createError.NotFound("محصولی یافت نشد");
  return product;
}

function invoiceNumberGenerator() {
  return (
    moment().format("jYYYYjMMjDDHHmmssSSS") +
    String(process.hrtime()[1]).padStart(9, 0)
  );
}

module.exports = {
  generateRandomNumber,
  toPersianDigits,
  setAccessToken,
  setRefreshToken,
  verifyRefreshToken,
  getUserCartDetail,
  copyObject,
  deleteInvalidPropertyInObject,
  checkProductExist,
  invoiceNumberGenerator,
  secretKeyGenerator,
};
