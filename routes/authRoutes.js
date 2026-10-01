import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

const router = express.Router();

// =====================================================
// AUTH ROUTER TEST
// =====================================================

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Auth router is working!",
  });
});

// =====================================================
// SIGN UP
// =====================================================

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
    });

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ Signup Error:");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to create account.",
    });
  }
});

// =====================================================
// LOGIN
// =====================================================

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        message:
          "This account uses Google Login. Please continue with Google.",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
      },
    });
  } catch (error) {
    console.error("❌ Login Error:");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to login.",
    });
  }
});

// =====================================================
// GOOGLE LOGIN
// =====================================================

router.post("/google", async (req, res) => {
  try {
    console.log("🔵 Google authentication request received.");

    const { credential } = req.body;

    // -------------------------------------------------
    // CHECK CREDENTIAL
    // -------------------------------------------------

    if (!credential) {
      console.error("❌ Google credential is missing.");

      return res.status(400).json({
        success: false,
        message: "Google credential is required.",
      });
    }

    console.log("🟢 Google credential received by backend.");

    // -------------------------------------------------
    // CHECK GOOGLE CLIENT ID
    // -------------------------------------------------

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error(
        "❌ GOOGLE_CLIENT_ID is missing from backend environment variables."
      );

      return res.status(500).json({
        success: false,
        message: "Google authentication is not configured.",
      });
    }

    console.log("🟢 GOOGLE_CLIENT_ID exists in backend.");

    // -------------------------------------------------
    // VERIFY GOOGLE ID TOKEN
    // -------------------------------------------------

    console.log("🔵 Verifying Google ID token...");

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    console.log("🟢 Google ID token verified successfully.");

    const payload = ticket.getPayload();

    if (!payload) {
      console.error("❌ Google token payload is empty.");

      return res.status(401).json({
        success: false,
        message: "Invalid Google account information.",
      });
    }

    console.log("🟢 Google token payload received.");

    // -------------------------------------------------
    // GET GOOGLE USER DATA
    // -------------------------------------------------

    const googleId = payload.sub;
    const email = payload.email?.toLowerCase().trim();
    const name = payload.name || "NexaAI User";
    const picture = payload.picture || "";

    console.log("🔵 Google email:", email);
    console.log("🔵 Google ID exists:", Boolean(googleId));

    // -------------------------------------------------
    // VALIDATE GOOGLE DATA
    // -------------------------------------------------

    if (!googleId || !email) {
      console.error(
        "❌ Google ID or email is missing from token."
      );

      return res.status(400).json({
        success: false,
        message:
          "Unable to get Google account information.",
      });
    }

    // -------------------------------------------------
    // FIND EXISTING USER
    // -------------------------------------------------

    console.log("🔵 Searching for existing user...");

    let user = await User.findOne({
      $or: [
        { googleId: googleId },
        { email: email },
      ],
    });

    // -------------------------------------------------
    // CREATE NEW GOOGLE USER
    // -------------------------------------------------

    if (!user) {
      console.log(
        "🔵 No existing user found. Creating Google user..."
      );

      user = await User.create({
        name: name.trim(),
        email,
        googleId,
        avatar: picture,
        authProvider: "google",
      });

      console.log(
        `✅ New Google user created: ${email}`
      );
    }

    // -------------------------------------------------
    // UPDATE EXISTING USER
    // -------------------------------------------------

    else {
      console.log(
        `🔵 Existing user found: ${email}`
      );

      user.googleId = googleId;
      user.avatar = picture;

      // Keep existing password if the account was
      // originally created with email/password.
      user.authProvider = "google";

      await user.save();

      console.log(
        `✅ Existing user logged in with Google: ${email}`
      );
    }

    // -------------------------------------------------
    // CHECK JWT SECRET
    // -------------------------------------------------

    if (!process.env.JWT_SECRET) {
      console.error(
        "❌ JWT_SECRET is missing from backend environment variables."
      );

      return res.status(500).json({
        success: false,
        message:
          "Server authentication is not configured.",
      });
    }

    console.log("🟢 JWT_SECRET exists.");

    // -------------------------------------------------
    // CREATE JWT
    // -------------------------------------------------

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    console.log(
      `✅ Google login completed successfully: ${email}`
    );

    // -------------------------------------------------
    // SEND RESPONSE
    // -------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Google login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
      },
    });
  } catch (error) {
    // =================================================
    // DETAILED GOOGLE ERROR
    // =================================================

    console.error(
      "❌ GOOGLE AUTHENTICATION ERROR"
    );

    console.error(
      "Error name:",
      error?.name
    );

    console.error(
      "Error message:",
      error?.message
    );

    console.error(
      "Error code:",
      error?.code
    );

    console.error(
      "Full error:",
      error
    );

    return res.status(401).json({
      success: false,
      message: "Google authentication failed.",
      error:
        error?.message ||
        "Unknown Google authentication error.",
    });
  }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

export default router;