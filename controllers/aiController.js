import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const chatWithAI = async (req, res) => {
  try {
    const { message, history = [], mode = "coding" } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const systemPrompt = `
You are CodePrep AI, an expert AI Coding Assistant and programming tutor.

Your main job is to help users learn programming, solve coding problems,
debug code, explain concepts, prepare for coding interviews, and improve code.

Current mode: ${mode}

Follow these rules:

1. Give accurate and practical programming answers.
2. Explain difficult concepts in simple language.
3. When debugging code, clearly identify the error and explain why it happens.
4. When generating code, provide clean, readable and properly formatted code.
5. When the user asks for a hint, do NOT immediately reveal the complete solution.
6. Prefer examples when they help understanding.
7. If the user provides code, analyze that code carefully before answering.
8. If there are multiple possible solutions, explain the best one first.
9. Never pretend that code was executed if you did not execute it.
10. Keep answers focused and useful.
`;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },

      ...history
        .filter(
          (item) =>
            item.role === "user" || item.role === "assistant"
        )
        .slice(-10),

      {
        role: "user",
        content: message,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
    });

    const reply = completion.choices[0]?.message?.content;

    return res.status(200).json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error("AI ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get AI response",
    });
  }
};