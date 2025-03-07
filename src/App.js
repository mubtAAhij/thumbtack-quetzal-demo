import "./App.css";
import { useEffect, useState, useRef, useCallback } from "react";

function App() {
    const [tempChatId, setTempChatId] = useState("");
    const [chatId, setChatId] = useState(
        localStorage.getItem("chatId") || undefined
    );
    const [messageInput, setMessageInput] = useState("");
    const socket = useRef(null);
    const [participant, setParticipant] = useState(
        localStorage.getItem("participant")
            ? Number(localStorage.getItem("participant"))
            : undefined
    );

    const [translatedMessages, setTranslatedMessages] = useState([]);
    const [preferredLanguage, setPreferredLanguage] = useState(
        localStorage.getItem("preferredLanguage") || "en-US"
    );

    const [showTranslatePopover, setShowTranslatePopover] = useState(false);
    const [tempLanguage, setTempLanguage] = useState(preferredLanguage);
    const [saveChoice, setSaveChoice] = useState(false);

    const createChat = useCallback(() => {
        return fetch("https://api.getquetzal.com/api/chat/new", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": "QTZL_2V266U004U857OOISBY1M8",
            },
            body: JSON.stringify({
                participants: [
                    { locale: "en-US", role: "User" },
                    {
                        locale: "pt-PT",
                        role: "Pro",
                    },
                ],
            }),
        })
            .then((res) => res.json())
            .then((data) => {
                console.log("New chat created:", data);

                if (data && data.chat_id) {
                    setChatId(data.chat_id);
                    localStorage.setItem("chatId", data.chat_id);
                } else {
                    console.error("API error for creating new chat");
                }
            })
            .catch((err) =>
                console.error("Error sending message to API:", err)
            );
    }, []);

    const sendForTranslation = useCallback(
        (message) => {
            return fetch("https://api.getquetzal.com/api/chat/message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": "QTZL_2V266U004U857OOISBY1M8",
                },
                body: JSON.stringify({
                    content: message.text,
                    participant: Number(message.username),
                    timestamp: message.timestamp,
                    chat_id: chatId,
                }),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data && data.translated_content) {
                        return data.translated_content;
                    }
                })
                .catch((err) =>
                    console.error("Error sending message to API:", err)
                );
        },
        [chatId]
    );

    useEffect(() => {
        socket.current = new WebSocket("ws://localhost:3005");

        socket.current.onopen = () => {
            console.log("Connected successfully.");
        };

        socket.current.onmessage = async (event) => {
            const msg = JSON.parse(event.data);

            const newMessage = JSON.parse(msg["utf8Data"]);
            if (newMessage.username === participant) {
                setTranslatedMessages([
                    ...translatedMessages,
                    JSON.parse(msg["utf8Data"]),
                ]);
            } else {
                const utf8Data = JSON.parse(msg["utf8Data"]);

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
    }, [participant, sendForTranslation, translatedMessages]);

    const fetchMessages = useCallback(() => {
        fetch(`http://localhost:3005/messages?chatId=${chatId}`)
            .then((res) => res.json())
            .then((data) => {
                fetch(
                    `https://api.getquetzal.com/api/chat/log?chat_id=${chatId}`,
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

                            const translatedLocalesMap = new Map(
                                response.messages.map((msg) => [
                                    msg.content,
                                    msg.translated_locale || "en-US", // Fallback to original content
                                ])
                            );

                            const updatedTranslatedMessages = data.map(
                                (message) => ({
                                    ...message, // Maintain the rest of the message object
                                    text:
                                        translatedLocalesMap.get(
                                            message.text
                                        ) === preferredLanguage
                                            ? translatedMap.get(message.text)
                                            : message.text, // Replace only content
                                })
                            );

                            setTranslatedMessages(updatedTranslatedMessages);
                        } else {
                            // If no response messages, default to original messages while maintaining object structure
                            setTranslatedMessages([]);
                        }
                    })
                    .catch((err) =>
                        console.error(
                            "Error fetching translated messages:",
                            err
                        )
                    );
            })
            .catch((err) => console.error("Error fetching messages:", err));
    }, [chatId, preferredLanguage]);

    useEffect(() => {
        if (chatId) {
            fetchMessages();
        }
    }, [chatId, fetchMessages]);

    const sendMessage = useCallback(() => {
        if (messageInput.trim() === "") {
            return;
        }

        const message = {
            text: messageInput,
            username: participant,
            timestamp: new Date().toISOString(),
            chatId,
        };

        // Send message via WebSocket
        socket.current.send(JSON.stringify(message));

        setMessageInput("");
    }, [chatId, messageInput, participant]);

    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        const locale = preferredLanguage || "en-US";
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
                        <option value="en-US">English</option>
                        <option value="es-ES">Spanish</option>
                        <option value="pt-PT">Portuguese</option>
                        <option value="zh-CN">Chinese (Simplified)</option>
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

            {!!chatId ? (
                <div>
                    <button
                        onClick={() => {
                            setChatId(undefined);
                        }}
                    >
                        Back
                    </button>
                    <p>
                        You are logged in as:{" "}
                        {participant === 0 ? "User" : "Pro"}
                    </p>
                    <p>Your chat ID is: {chatId}</p>
                    {/* Chat Container */}
                    <div className="chat-container">
                        <div className="chat-messages">
                            {translatedMessages.map((message, index) => (
                                <div
                                    className={`message ${
                                        Number(message["username"]) ===
                                        participant
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
                <div className="chat-input chat-input-login">
                    <p>Choose your role in this demo!</p>
                    <button
                        onClick={() => {
                            localStorage.setItem("participant", 0);
                            setParticipant(0);
                            if (tempChatId) {
                                localStorage.setItem("chatId", tempChatId);
                                setChatId(tempChatId);
                                setTempChatId("");
                            } else {
                                createChat();
                            }
                        }}
                    >
                        Connect as User (English speaker)
                    </button>
                    <button
                        onClick={() => {
                            localStorage.setItem("participant", 1);
                            setParticipant(1);
                            if (tempChatId) {
                                localStorage.setItem("chatId", tempChatId);
                                setChatId(tempChatId);
                                setTempChatId("");
                            } else {
                                createChat();
                            }
                        }}
                    >
                        Connect as Pro (Portuguese speaker)
                    </button>
                    <p>Or, join an existing chat:</p>
                    <input
                        type="text"
                        name="chatId"
                        placeholder="Chat ID like QTZLC_XXXXXXX"
                        value={tempChatId ?? ""}
                        onChange={(e) => {
                            setTempChatId(e.target.value);
                        }}
                    />
                </div>
            )}
        </div>
    );
}

export default App;
