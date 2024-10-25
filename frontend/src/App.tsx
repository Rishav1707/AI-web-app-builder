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

  useEffect(() => {
    socket.on("chat message", (msg) => {
      setChatHistory((prev) => [...prev, `AI: ${msg}`]);
      setWebsiteContent(msg);
    });

    socket.on("website update", ({ changes }) => {
      setWebsiteContent((prev) => {
        let updatedContent = prev;

        changes.forEach(
          (change: { added?: boolean; removed?: boolean; value: string }) => {
            if (change.added) {
              updatedContent += change.value;
            } else if (change.removed) {
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

    socket.on("question", (question) => {
      setCurrentQuestion(question);
    });

    socket.on("questionnaire complete", () => {
      setIsQuestionnaire(false);
      setChatHistory((prev) => [
        ...prev,
        "AI: The questionnaire is complete! You can now request changes.",
      ]);
    });

    socket.emit("start questionnaire");

    return () => {
      socket.off("chat message");
      socket.off("website update");
      socket.off("question");
      socket.off("questionnaire complete");
    };
  }, []);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    if (isQuestionnaire && currentQuestion) {
      socket.emit("answer", inputMessage);
      setChatHistory((prev) => [
        ...prev,
        `AI: ${currentQuestion}`,
        `You: ${inputMessage}`,
      ]);
      setInputMessage("");
    } else {
      socket.emit("chat message", inputMessage);
      setChatHistory((prev) => [...prev, `You: ${inputMessage}`]);
      setInputMessage("");
    }
  };

  const handleRequestChange = () => {
    if (!inputMessage.trim()) return;

    if (!isQuestionnaire) {
      socket.emit("request change", inputMessage);
      setChatHistory((prev) => [...prev, `You: ${inputMessage}`]);
      setInputMessage("");
    }
  };

  return (
    <div className="flex h-screen">
      <div className="w-[30%] p-4 border-r">
        <h2 className="text-2xl font-bold mb-4">
          {isQuestionnaire ? "Initial Questionnaire" : "Chat with AI"}
        </h2>
        <div className="h-[calc(100vh-150px)] overflow-auto mb-4">
          {chatHistory.map((msg, index) => (
            <div key={index} className="mb-2">
              {msg.startsWith("AI") ? (
                <div className="text-left">{msg}</div>
              ) : (
                <div className="text-right">{msg}</div>
              )}
            </div>
          ))}
          {isQuestionnaire && currentQuestion && (
            <div className="mb-2 font-bold">{currentQuestion}</div>
          )}
        </div>
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
