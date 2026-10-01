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

    // Check required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
    });

    // Create JWT token
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

    // Check required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Find user
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Make sure the account has a password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message:
          "This account uses Google Login. Please continue with Google.",
      });
    }

    // Compare password
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

    // Create JWT token
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
    const { credential } = req.body;

    // Check Google credential
    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required.",
      });
    }

    // Check Google Client ID
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error(
        "❌ GOOGLE_CLIENT_ID is missing in backend .env"
      );

      return res.status(500).json({
        success: false,
        message: "Google authentication is not configured.",
      });
    }

    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google account information.",
      });
    }

    const googleId = payload.sub;
    const email = payload.email?.toLowerCase().trim();
    const name = payload.name || "NexaAI User";
    const picture = payload.picture || "";

    // Validate Google data
    if (!googleId || !email) {
      return res.status(400).json({
        success: false,
        message:
          "Unable to get Google account information.",
      });
    }

    // Find existing user by Google ID OR email
    let user = await User.findOne({
      $or: [
        { googleId: googleId },
        { email: email },
      ],
    });

    // =================================================
    // CREATE NEW GOOGLE USER
    // =================================================

    if (!user) {
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

    // =================================================
    // UPDATE EXISTING USER
    // =================================================

    else {
      // Link Google account to existing user
      user.googleId = googleId;
      user.avatar = picture;

      // Keep existing password if user originally
      // created account with email/password.
      user.authProvider =
        user.password ? "local+google" : "google";

      await user.save();

      console.log(
        `✅ Existing user logged in with Google: ${email}`
      );
    }

    // =================================================
    // CREATE JWT
    // =================================================

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

    // =================================================
    // SEND RESPONSE
    // =================================================

    return res.json({
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
    console.error(
      "❌ Google Authentication Error:"
    );

    console.error(
      error?.message || error
    );

    return res.status(401).json({
      success: false,
      message: "Google authentication failed.",
    });
  }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

export default router;