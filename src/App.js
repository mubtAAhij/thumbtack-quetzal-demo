import "./App.css";
import { useEffect, useState, useRef, useCallback } from "react";

function App() {
    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState("");
    const socket = useRef(null);
    const [username, setUsername] = useState("");
    const [existingUserName, setExistingUsername] = useState(
        localStorage.getItem("username") || ""
    );

    const [translatedMessages, setTranslatedMessages] = useState([]);

    const [translationEnabled, setTranslationEnabled] = useState(
        JSON.parse(localStorage.getItem("translationEnabled")) || false
    );
    const [preferredLanguage, setPreferredLanguage] = useState(
        localStorage.getItem("preferredLanguage") || "English"
    );

    const [showTranslatePopover, setShowTranslatePopover] = useState(false);
    const [tempLanguage, setTempLanguage] = useState(preferredLanguage);
    const [saveChoice, setSaveChoice] = useState(false);

    const sendForTranslation = useCallback((message) => {
        return fetch("https://api.getquetzal.com/api/chat/message", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": "QTZL_2V266U004U857OOISBY1M8",
            },
            body: JSON.stringify({
                content: message.text,
                participant: preferredLanguage === 'Portuguese' ? 1 : 0, // Hardcoded
                timestamp: message.timestamp,
                chat_id: "QTZLC0000005",
            }),
        })
            .then((res) => res.json())
            .then((data) => {
                console.log("Message sent to API:", data);

                if (data && data.translated_content) {
                    return data.translated_content;
                }
            })
            .catch((err) =>
                console.error("Error sending message to API:", err)
            );
    }, [preferredLanguage]);

    useEffect(() => {
        socket.current = new WebSocket("ws://localhost:3005");

        socket.current.onopen = () => {
            console.log("Connected successfully.");
        };

        socket.current.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            console.log("got my new message!", msg);

            const newMessage = JSON.parse(msg["utf8Data"]);
            console.log("usernames", newMessage.username, existingUserName);
            if (newMessage.username === existingUserName) {
                setMessages([...messages, JSON.parse(msg["utf8Data"])]);
                setTranslatedMessages([
                    ...translatedMessages,
                    JSON.parse(msg["utf8Data"]),
                ]);
            } else {
                const utf8Data = JSON.parse(msg["utf8Data"]);
                setMessages([...messages, utf8Data]);

                const translatedMessageContent = await sendForTranslation(
                    newMessage
                );

                utf8Data.text = translatedMessageContent;

                setTranslatedMessages([...translatedMessages, utf8Data]);
            }
        };

        return () => {
            socket.current.close();
        };
    }, [existingUserName, messages, sendForTranslation, translatedMessages]);

    const fetchMessages = useCallback(() => {
        fetch("http://localhost:3005/messages")
            .then((res) => res.json())
            .then((data) => {
                fetch(
                    "https://api.getquetzal.com/api/chat/log?chat_id=QTZLC0000005",
                    {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "api-key": "QTZL_2V266U004U857OOISBY1M8",
                        },
                    }
                )
                    .then((res) => res.json())
                    .then((response) => {
                        if (
                            response.messages &&
                            Array.isArray(response.messages) &&
                            response.messages.length
                        ) {
                            const translatedMap = new Map(
                                response.messages.map((msg) => [
                                    msg.content,
                                    msg.translated_content || msg.content, // Fallback to original content
                                ])
                            );

                            const updatedTranslatedMessages = data.map(
                                (message) => ({
                                    ...message, // Maintain the rest of the message object
                                    text:
                                        translatedMap.get(message.text) ||
                                        message.text, // Replace only content
                                })
                            );

                            setTranslatedMessages(updatedTranslatedMessages);
                        } else {
                            // If no response messages, default to original messages while maintaining object structure
                            setTranslatedMessages(
                                data.map((msg) => ({ ...msg }))
                            );
                        }
                    })
                    .catch((err) =>
                        console.error(
                            "Error fetching translated messages:",
                            err
                        )
                    );

                setMessages(data);
            })
            .catch((err) => console.error("Error fetching messages:", err));
    }, []);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    const sendMessage = useCallback(() => {
        if (messageInput.trim() === "") {
            return;
        }

        const message = {
            text: messageInput,
            username: existingUserName,
            timestamp: new Date().toISOString(),
        };

        // Send message via WebSocket
        socket.current.send(JSON.stringify(message));

        setMessageInput("");
    }, [existingUserName, messageInput]);

    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        const localeMap = {
            English: "en-US",
            Spanish: "es-ES",
            Portuguese: "pt-PT",
            "Chinese (Simplified)": "zh-CN",
        };
        const locale = localeMap[preferredLanguage] || "en-US";
        return new Intl.DateTimeFormat(locale, {
            hour: "numeric",
            minute: "numeric",
            hour12: true,
        }).format(date);
    };

    return (
        <div className="App">
            {/* Navbar */}
            <div className="navbar">
                <div className="navbar-left">Notarization</div>
                <div className="navbar-right">
                    <button
                        className="navbar-button"
                        onClick={() =>
                            setShowTranslatePopover(!showTranslatePopover)
                        }
                    >
                        🌍 Translate
                    </button>
                    <button className="navbar-button">📞 Call pro</button>
                    <button className="navbar-button">⭐ Review pro</button>
                    <button className="navbar-button">☰ Project details</button>
                </div>
            </div>

            {/* Translate Popover */}
            {showTranslatePopover && (
                <div className="popover">
                    <h3>Translate</h3>
                    <p>
                        Automatically translate messages written by Pros to your
                        native language.
                    </p>
                    <select
                        value={tempLanguage}
                        onChange={(e) => setTempLanguage(e.target.value)}
                    >
                        <option value="English">English</option>
                        <option value="Spanish">Spanish</option>
                        <option value="Portuguese">Portuguese</option>
                        <option value="Chinese (Simplified)">
                            Chinese (Simplified)
                        </option>
                    </select>
                    <label>
                        <input
                            type="checkbox"
                            checked={saveChoice}
                            onChange={() => setSaveChoice(!saveChoice)}
                        />
                        Save my choice for all chats
                    </label>
                    <div className="popover-buttons">
                        <button onClick={() => setShowTranslatePopover(false)}>
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                setPreferredLanguage(tempLanguage);
                                if (saveChoice) {
                                    localStorage.setItem(
                                        "preferredLanguage",
                                        tempLanguage
                                    );
                                }
                                setShowTranslatePopover(false);
                            }}
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}

            {existingUserName ? (
                <div>
                    {/* Chat Container */}
                    <div className="chat-container">
                        <div className="chat-messages">
                            {(translatedMessages.length && preferredLanguage === 'Portuguese'
                                ? translatedMessages
                                : messages
                            ).map((message, index) => (
                                <div
                                    className={`message ${
                                        message["username"] === existingUserName
                                            ? "sent"
                                            : "received"
                                    }`}
                                    key={index}
                                >
                                    <span className="message-content">
                                        {message["text"]}
                                    </span>
                                    <span className="message-timestamp">
                                        {formatTime(message["timestamp"])}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="chat-input">
                            <input
                                type="text"
                                placeholder="Type your message"
                                value={messageInput}
                                onChange={(e) =>
                                    setMessageInput(e.target.value)
                                }
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        messageInput.trim() !== ""
                                    ) {
                                        sendMessage();
                                    }
                                }}
                            />
                            <button onClick={sendMessage}>Send</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="chat-input">
                    <input
                        type="text"
                        placeholder="Enter your username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <button
                        onClick={() => {
                            const u = username.trim();
                            localStorage.setItem("username", u);
                            setExistingUsername(u);
                        }}
                    >
                        Connect
                    </button>
                </div>
            )}
        </div>
    );
}

export default App;
