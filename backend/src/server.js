require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const OpenAI = require("openai");
const diff = require("diff");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const token = process.env["GITHUB_TOKEN"];
const endpoint = process.env["LLM_ENDPOINT"];
const modelName = "gpt-4o-mini";

const client = new OpenAI({ baseURL: endpoint, apiKey: token });

let previousWebsiteContent = null;

// List of questions to ask
const questions = [
  "What type of website do you want to create? (e.g., blog, e-commerce, portfolio)",
  "What's the name of your website?",
  "What's the main purpose of your website?",
  "Who is your target audience?",
  "What key features do you want on your website?",
];

io.on("connection", (socket) => {
  console.log("A user connected");

  // Store current question index and user responses
  let currentQuestionIndex = 0;
  let userResponses = [];

  // Start the questionnaire by asking the first question
  socket.on("start questionnaire", () => {
    if (currentQuestionIndex < questions.length) {
      socket.emit("question", questions[currentQuestionIndex]);
    }
  });

  // Handle user's answer to each question
  socket.on("answer", (answer) => {
    // Store the answer
    userResponses.push(answer);

    // Move to the next question
    currentQuestionIndex++;

    if (currentQuestionIndex < questions.length) {
      // Ask the next question
      socket.emit("question", questions[currentQuestionIndex]);
    } else {
      // All questions answered, generate website content
      generateWebsiteContent(userResponses, socket);
    }
  });

  // Generate website content based on user responses
  const generateWebsiteContent = async (responses, socket) => {
    try {
      // Use the collected responses to generate a website
      const [
        websiteType,
        websiteName,
        websitePurpose,
        targetAudience,
        features,
      ] = responses;

      const prompt = `
        Based on the following details:
        - Type of website: ${websiteType}
        - Name: ${websiteName}
        - Purpose: ${websitePurpose}
        - Target audience: ${targetAudience}
        - Key features: ${features}
        Generate a responsive HTML structure using Tailwind CSS for styling based on the user's input.
      `;

      // Request the model to generate the website content
      const completion = await client.chat.completions.create({
        messages: [
          { role: "system", content: "You are a professional web developer." },
          { role: "user", content: prompt }, // User responses as the input
          {
            role: "user",
            content: `
            Response back in the following format only:
            reply: content you have generated
            code: html code you have generated
            nothing more than that.
            `,
          },
        ],
        temperature: 1.0,
        top_p: 1.0,
        max_tokens: 1000,
        model: modelName,
      });

      const generatedContent = completion.choices[0].message.content;

      // Calculate the diff with previous content (if exists)
      if (previousWebsiteContent) {
        const changes = diff.diffWords(
          previousWebsiteContent,
          generatedContent
        );
        socket.emit("website update", { changes });
      }

      previousWebsiteContent = generatedContent; // Update previous content for future diff

      // Send the generated website content to the client
      socket.emit("chat message", generatedContent);
      socket.emit("questionnaire complete"); // Notify that questionnaire is complete
    } catch (error) {
      console.error("Error:", error);
      socket.emit(
        "chat message",
        "AI: Sorry, I encountered an error while generating the website."
      );
    }
  };

  // Handle changes requested by the user after the website content has been generated
  socket.on("request change", async (changeRequest) => {
    if (!previousWebsiteContent) {
      socket.emit("chat message", "AI: Please generate the website first.");
      return;
    }

    try {
      const prompt = `
        The user has requested the following change: "${changeRequest}".
        The current HTML code is:
        ${previousWebsiteContent}
        Please provide the modified code with the requested changes.
      `;

      const completion = await client.chat.completions.create({
        messages: [
          { role: "system", content: "You are a professional web developer." },
          { role: "user", content: prompt }, // User's change request as the input
          {
            role: "user",
            content: `
            Response back in the following format only:
            reply: content you have generated
            code: html code you have generated
            nothing more than that.
            `,
          },
        ],
        temperature: 1.0,
        top_p: 1.0,
        max_tokens: 1000,
        model: modelName,
      });

      const modifiedContent = completion.choices[0].message.content;

      // Calculate the diff with previous content
      const changes = diff.diffWords(previousWebsiteContent, modifiedContent);
      socket.emit("website update", { changes });

      previousWebsiteContent = modifiedContent; // Update the previous content with the modified one
      socket.emit("chat message", modifiedContent);
    } catch (error) {
      console.error("Error:", error);
      socket.emit(
        "chat message",
        "AI: Sorry, I encountered an error while processing your request."
      );
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
