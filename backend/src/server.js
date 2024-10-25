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
let currentQuestionIndex = 0;
let questions = [];
let userResponses = [];

io.on("connection", (socket) => {
  socket.on("start questionnaire", async () => {
    try {
      const prompt = `
        Ask some necessary questions that are required for you to get some context about the website.
        Respond with questions only.
        The questions should not be more than 5.
      `;

      const completion = await client.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a professional web developer who create incredible website for the restaurents and cafes.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 1.0,
        top_p: 1.0,
        max_tokens: 1000,
        model: modelName,
      });

      questions = completion.choices[0].message.content
        .split("\n")
        .filter(Boolean);
      currentQuestionIndex = 0;
      userResponses = [];

      if (questions.length > 0) {
        socket.emit("question", questions[currentQuestionIndex]);
      } else {
        socket.emit(
          "chat message",
          "No questions generated. Please provide details manually."
        );
      }
    } catch (error) {
      console.error("Error:", error);
      socket.emit(
        "chat message",
        "AI: Sorry, I encountered an error while generating questions."
      );
    }
  });

  socket.on("answer", (answer) => {
    userResponses.push(answer);
    currentQuestionIndex++;

    if (currentQuestionIndex < questions.length) {
      socket.emit("question", questions[currentQuestionIndex]);
    } else {
      generateWebsiteContent(userResponses, questions, socket);
    }
  });

  const generateWebsiteContent = async (responses, questions, socket) => {
    try {
      const prompt = `
        Based on the following details:
        ${questions
          .map(
            (question, index) =>
              `Ques ${index + 1}: ${question}\nAns: ${responses[index]}`
          )
          .join("\n")}
        Generate a responsive HTML structure using Tailwind CSS for styling and JavaScript for adding functionality based on the user's input.
        Default text color should be black.
        While creating website just keep few key components in mind:
        - It include Header & Menu
        - It include Images
        - It include content
        - It include testimonials
        - It include Footer
        - It include logo
        - It include CTA
        - It include Forms
        - It include FAQ
      `;

      const completion = await client.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a professional web developer who create incredible website for the restaurents and cafes.",
          },
          { role: "user", content: prompt },
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
        max_tokens: 2000,
        model: modelName,
      });

      const generatedContent = completion.choices[0].message.content;

      if (previousWebsiteContent) {
        const changes = diff.diffWords(
          previousWebsiteContent,
          generatedContent
        );
        socket.emit("website update", { changes });
      }

      previousWebsiteContent = generatedContent;
      socket.emit("chat message", generatedContent);
      socket.emit("questionnaire complete");
    } catch (error) {
      console.error("Error:", error);
      socket.emit(
        "chat message",
        "AI: Sorry, I encountered an error while generating the website."
      );
    }
  };

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
          {
            role: "system",
            content:
              "You are a professional web developer who create incredible website for the restaurents and cafes.",
          },
          { role: "user", content: prompt },
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
        max_tokens: 2000,
        model: modelName,
      });

      const modifiedContent = completion.choices[0].message.content;

      const changes = diff.diffWords(previousWebsiteContent, modifiedContent);
      socket.emit("website update", { changes });

      previousWebsiteContent = modifiedContent;
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
