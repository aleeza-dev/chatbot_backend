import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";

import Feedback from "./models/Feedback.js";
import Chat from "./models/Chat.js";
import authRoutes from "./routes/authRoutes.js";
import authMiddleware from "./middleware/authMiddleware.js";

dotenv.config();

// =====================================================
// GEMINI AI
// =====================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// =====================================================
// APP CONFIG
// =====================================================

const app = express();
const PORT = process.env.PORT || 5000;

// =====================================================
// MONGODB CONNECTION
// =====================================================

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in .env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:");
    console.error(error.message);

    process.exit(1);
  }
};

// =====================================================
// MIDDLEWARE
// =====================================================

const allowedOrigins = [
  "http://localhost:5173",
  "https://chatbotfrontend-mu.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

app.use(express.json());

// =====================================================
// AUTH ROUTES
// =====================================================

app.use("/api/auth", authRoutes);

// =====================================================
// TEST ROUTE
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "NexaAI backend is running 🚀",
  });
});

// =====================================================
// MODE PROMPTS
// =====================================================

const modePrompts = {
  general: `
You are NexaAI, a helpful AI assistant.

You can help the user with:
- General questions
- Learning
- Programming
- Technology
- Writing
- Problem solving
- Everyday questions

Give clear, accurate and useful answers.

Use simple explanations when possible.
`,

  coding: `
You are NexaAI, an expert programming assistant.

Help the user with:
- Programming concepts
- Writing code
- Algorithms
- Data structures
- Programming languages
- Web development
- Software development
- Best practices

Give accurate and practical answers.

When code is required:
- Use clean and readable code.
- Use proper code blocks.
- Explain important parts briefly.
- Prefer beginner-friendly explanations when possible.
`,

  study: `
You are NexaAI in Study mode.

Help the user understand educational concepts clearly.

You can help with:
- Computer science
- Mathematics
- Programming
- Engineering
- General academic topics
- Exam preparation
- Concept explanations

Explain difficult topics in simple language.

Use examples when useful.

If the user asks for a step-by-step explanation, provide it clearly.
`,

  explain: `
You are NexaAI in Explain Code mode.

Your job is to explain programming code clearly.

When the user provides code:

1. Explain what the code does.
2. Explain the important lines step by step.
3. Explain the logic in simple language.
4. Explain important programming concepts involved.
5. Give a small example when useful.
6. Mention potential problems if relevant.

Assume the user may be a beginner.

Do not unnecessarily complicate the explanation.
`,

  debug: `
You are NexaAI in Debug Code mode.

Your job is to find and fix programming errors.

When the user provides code or an error:

1. Identify the problem.
2. Explain why the error occurs.
3. Provide the corrected code.
4. Explain exactly what was changed.
5. Mention any additional important issue you notice.

Do not change unrelated parts of the user's code.

If the error message is incomplete, ask for the missing information.
`,

  hint: `
You are NexaAI in Hint mode.

The user wants help solving a programming problem without immediately receiving the complete solution.

Give progressive hints.

Start with a small conceptual hint.

If the user asks for another hint, provide a stronger hint.

Do not immediately reveal the complete solution unless the user explicitly asks for it.

Encourage the user to think through the problem themselves.
`,

  generate: `
You are NexaAI in Code Generation mode.

Your job is to generate clean, working programming code based on the user's requirements.

Before generating code, understand what the user wants.

Provide:
1. A complete solution.
2. Clean and readable code.
3. A short explanation.
4. Important setup or usage instructions when necessary.

Use practical and maintainable solutions.

Do not add unnecessary complexity.
`,

  interview: `
You are NexaAI in Mock Interview mode.

Act as a technical interviewer.

Ask the user ONE interview question at a time.

The interview can cover:
- Programming
- Data structures
- Algorithms
- OOP
- Web development
- Databases
- Computer science fundamentals

When starting:
- Ask one appropriate question.
- Do not reveal the answer.

After the user answers:
1. Evaluate their answer.
2. Explain what they did well.
3. Explain what could be improved.
4. Give the correct approach if necessary.
5. Ask the next interview question.

Do not ask multiple interview questions at once.
`,
};

// =====================================================
// GEMINI RETRY FUNCTION
// =====================================================

const generateAIResponse = async (contents) => {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(
        `🤖 Gemini request attempt ${attempt + 1}/${maxRetries}`
      );

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents,
      });

      console.log("✅ Gemini response received");

      return response;
    } catch (error) {
      console.error(
        `⚠️ Gemini attempt ${attempt + 1} failed`
      );

      console.error(
        error?.message || error
      );

      const status =
        error?.status ||
        error?.code ||
        error?.response?.status;

      const isTemporaryError =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        status === "RESOURCE_EXHAUSTED" ||
        status === "UNAVAILABLE";

      // If this is not a temporary error,
      // don't keep retrying.
      if (!isTemporaryError) {
        throw error;
      }

      // Last attempt failed
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff:
      // 1 second
      // 2 seconds
      // 4 seconds

      const delay =
        1000 * Math.pow(2, attempt);

      console.log(
        `⏳ Gemini temporarily unavailable. Retrying in ${
          delay / 1000
        } seconds...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );
    }
  }

  throw new Error(
    "Gemini AI is currently unavailable."
  );
};

// =====================================================
// FRIENDLY GEMINI ERROR
// =====================================================

const getGeminiErrorMessage = (error) => {
  const status =
    error?.status ||
    error?.code ||
    error?.response?.status;

  if (
    status === 503 ||
    status === "UNAVAILABLE"
  ) {
    return "NexaAI is temporarily busy right now. Please try again in a few seconds. 💙";
  }

  if (
    status === 429 ||
    status === "RESOURCE_EXHAUSTED"
  ) {
    return "NexaAI is receiving too many requests right now. Please wait a moment and try again.";
  }

  if (
    status === 500 ||
    status === 502 ||
    status === 504
  ) {
    return "NexaAI is temporarily unavailable. Please try again in a few moments.";
  }

  return "NexaAI could not generate a response right now. Please try again.";
};

// =====================================================
// CHAT ROUTE
// =====================================================

app.post(
  "/api/chat",
  authMiddleware,
  async (req, res) => {
    try {
      const {
        message,
        history = [],
        mode = "general",
      } = req.body;

      // -------------------------------------------------
      // Validate message
      // -------------------------------------------------

      if (!message || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: "Message is required",
        });
      }

      // -------------------------------------------------
      // Select mode prompt
      // -------------------------------------------------

      const selectedPrompt =
        modePrompts[mode] ||
        modePrompts.general;

      // -------------------------------------------------
      // Clean conversation history
      // -------------------------------------------------

      const cleanHistory =
        Array.isArray(history)
          ? history
              .filter(
                (item) =>
                  item &&
                  (item.role === "user" ||
                    item.role === "assistant") &&
                  typeof item.content === "string"
              )
              .slice(-10)
          : [];

      // -------------------------------------------------
      // Build conversation
      // -------------------------------------------------

      const conversation = [
        {
          role: "system",
          content: selectedPrompt,
        },

        ...cleanHistory,

        {
          role: "user",
          content: message.trim(),
        },
      ];

      // -------------------------------------------------
      // Convert conversation to text
      // -------------------------------------------------

      const formattedConversation =
        conversation
          .map((item) => {
            if (item.role === "system") {
              return `SYSTEM:\n${item.content}`;
            }

            if (item.role === "user") {
              return `USER:\n${item.content}`;
            }

            return `ASSISTANT:\n${item.content}`;
          })
          .join("\n\n");

      console.log(
        `🤖 NexaAI request | User: ${req.user.userId} | Mode: ${mode}`
      );

      // -------------------------------------------------
      // Send request to Gemini with retry
      // -------------------------------------------------

      const aiResponse =
        await generateAIResponse(
          formattedConversation
        );

      // -------------------------------------------------
      // Get AI response
      // -------------------------------------------------

      const reply =
        aiResponse?.text ||
        "Sorry, NexaAI could not generate a response.";

      // -------------------------------------------------
      // Save chat to MongoDB
      // -------------------------------------------------

      const savedChat = await Chat.create({
        userId: req.user.userId,
        message: message.trim(),
        aiResponse: reply,
        mode,
      });

      console.log(
        `💬 Chat saved successfully | Chat ID: ${savedChat._id}`
      );

      // -------------------------------------------------
      // Send response to frontend
      // -------------------------------------------------

      return res.json({
        success: true,
        reply,
        mode,
      });
    } catch (error) {
      console.error("❌ NexaAI Error:");
      console.error(error);

      const friendlyMessage =
        getGeminiErrorMessage(error);

      return res.status(503).json({
        success: false,
        message: friendlyMessage,
      });
    }
  }
);

// =====================================================
// CHAT HISTORY ROUTE
// =====================================================

app.get(
  "/api/history",
  authMiddleware,
  async (req, res) => {
    try {
      const chats = await Chat.find({
        userId: req.user.userId,
      })
        .sort({ createdAt: -1 })
        .limit(100);

      return res.json({
        success: true,
        history: chats,
      });
    } catch (error) {
      console.error("❌ History Error:");
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Unable to load chat history.",
      });
    }
  }
);

// =====================================================
// FEEDBACK ROUTE
// =====================================================

app.post(
  "/api/feedback",
  async (req, res) => {
    try {
      const {
        message,
        aiResponse,
        feedback,
        mode = "general",
      } = req.body;

      // -------------------------------------------------
      // Validate feedback
      // -------------------------------------------------

      if (
        !message ||
        !aiResponse ||
        !["like", "dislike"].includes(
          feedback
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid message, aiResponse and feedback are required",
        });
      }

      // -------------------------------------------------
      // Save feedback to MongoDB
      // -------------------------------------------------

      const savedFeedback =
        await Feedback.create({
          message,
          aiResponse,
          feedback,
          mode,
        });

      console.log(
        `👍/👎 Feedback saved | Type: ${feedback} | Mode: ${mode}`
      );

      // -------------------------------------------------
      // Send response
      // -------------------------------------------------

      return res.status(201).json({
        success: true,
        message: "Feedback saved successfully",
        feedback: savedFeedback,
      });
    } catch (error) {
      console.error(
        "❌ Feedback Error:"
      );
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Unable to save feedback",
      });
    }
  }
);

// =====================================================
// 404 ROUTE
// =====================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// =====================================================
// START SERVER
// =====================================================

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(
      `🚀 NexaAI backend running on port ${PORT}`
    );

    console.log(
      "🤖 Gemini AI connected"
    );
  });
};

startServer();