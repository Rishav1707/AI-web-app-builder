import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const socket = io("http://localhost:3001");

export default function AIWebsiteCreator() {
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [websiteContent, setWebsiteContent] = useState(
    "<div>Your website will appear here</div>"
  );
  const [isQuestionnaire, setIsQuestionnaire] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [answers, setAnswers] = useState<string[]>([]); // To store the answers to all questions

  useEffect(() => {
    // Listen for incoming chat messages and website updates
    socket.on("chat message", (msg) => {
      setChatHistory((prev) => [...prev, `AI: ${msg}`]);
      setWebsiteContent(msg); // Update the website preview with the new content
    });

    // Apply the changes sent by the server to update the website preview
    socket.on("website update", ({ changes }) => {
      setWebsiteContent((prev) => {
        // Create an array to hold the updated content based on the diff changes
        let updatedContent = prev;

        // Iterate over changes and apply each change
        changes.forEach(
          (change: { added?: boolean; removed?: boolean; value: string }) => {
            if (change.added) {
              updatedContent += change.value; // Add the new content
            } else if (change.removed) {
              // Remove the corresponding content; find the index of removed content
              const startIndex = updatedContent.indexOf(change.value);
              if (startIndex !== -1) {
                updatedContent =
                  updatedContent.slice(0, startIndex) +
                  updatedContent.slice(startIndex + change.value.length);
              }
            }
          }
        );

        return updatedContent;
      });
    });

    // Listen for questions from the server and display them one by one
    socket.on("question", (question) => {
      setCurrentQuestion(question);
    });

    // When the questionnaire is complete, stop asking questions and prepare to generate the code
    socket.on("questionnaire complete", () => {
      setIsQuestionnaire(false);
    });

    // Start the questionnaire process once the component is mounted
    socket.emit("start questionnaire");

    return () => {
      // Clean up event listeners when the component is unmounted
      socket.off("chat message");
      socket.off("website update");
      socket.off("question");
      socket.off("questionnaire complete");
    };
  }, []);

  const handleSendMessage = () => {
    if (isQuestionnaire && currentQuestion) {
      // Send the answer back to the server
      socket.emit("answer", inputMessage);

      // Update chat history with the question and answer
      setChatHistory((prev) => [
        ...prev,
        `Q: ${currentQuestion}`,
        `A: ${inputMessage}`,
      ]);

      // Store the answer in the answers array
      setAnswers((prev) => [...prev, inputMessage]);

      // Clear input field after sending an answer
      setInputMessage("");
    } else {
      // Handle regular chat messages after the questionnaire
      socket.emit("chat message", inputMessage);
      setChatHistory((prev) => [...prev, `You: ${inputMessage}`]);
      setInputMessage(""); // Clear input field after sending a message
    }
  };

  // New function to handle change requests
  const handleRequestChange = () => {
    if (!isQuestionnaire) {
      // Emit the change request to the server
      socket.emit("request change", inputMessage);
      setChatHistory((prev) => [...prev, `You: ${inputMessage}`]);
      setInputMessage(""); // Clear input field after sending the request
    }
  };

  return (
    <div className="flex h-screen">
      <div className="w-[30%] p-4 border-r">
        <h2 className="text-2xl font-bold mb-4">
          {isQuestionnaire ? "Initial Questionnaire" : "Chat with AI"}
        </h2>
        <div className="h-[calc(100vh-150px)] overflow-auto mb-4">
          {/* Display chat history */}
          {chatHistory.map((msg, index) => (
            <div key={index} className="mb-2">
              {msg}
            </div>
          ))}
          {/* Display the current question if the questionnaire is ongoing */}
          {isQuestionnaire && currentQuestion && (
            <div className="mb-2 font-bold">{currentQuestion}</div>
          )}
        </div>
        {/* Input field and send button */}
        <div className="flex">
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              isQuestionnaire ? "Type your answer..." : "Request a change..."
            }
            className="flex-grow mr-2"
          />
          <Button
            onClick={isQuestionnaire ? handleSendMessage : handleRequestChange}
          >
            Send
          </Button>
        </div>
      </div>
      {/* Website preview */}
      <div className="w-[70%] p-4">
        <h2 className="text-2xl font-bold mb-4">Website Preview</h2>
        <Card className="h-[calc(100vh-100px)] overflow-y-auto">
          <CardContent>
            <div dangerouslySetInnerHTML={{ __html: websiteContent }} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
