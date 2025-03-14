import "./App.css";
import { useEffect, useState, useRef, useCallback } from "react";
import arthur from "./arthur.jpg";
import billy from "./billy.jpg";
import UserSettingsPage from "./UserSettingsPage";

function App() {
    const [tempChatId, setTempChatId] = useState("");
    const [chatId, setChatId] = useState(
        localStorage.getItem("chatId") || undefined
    );
    const [quetzalChatId, setQuetzalChatId] = useState(
        localStorage.getItem("quetzalChatId") || undefined
    );
    const [messageInput, setMessageInput] = useState("");
    const socket = useRef(null);
    const [selectedRole, setSelectedRole] = useState(
        localStorage.getItem("selectedRole") || undefined
    );
    const [currentParticipant, setCurrentParticipant] = useState(
        localStorage.getItem("currentParticipant")
            ? JSON.parse(localStorage.getItem("currentParticipant"))
            : undefined
    );

    const [translatedMessages, setTranslatedMessages] = useState([]);
    const [translationOn, setTranslationOn] = useState(false);
    const [preferredLanguage, setPreferredLanguage] = useState(
        localStorage.getItem("preferredLanguage") || "en-US"
    );

    const [showUserSettingsPage, setShowUserSettingsPage] = useState(false);

    const [dropdownOpen, setDropdownOpen] = useState(false);

    const createChat = useCallback((role) => {
        fetch(`http://localhost:3005/newChat?preferredRole=${role}`)
            .then((res) => res.json())
            .then((data) => {
                setCurrentParticipant(data.currentParticipant);
                setChatId(data.chatId);
                setQuetzalChatId(data.quetzalChatId);
                localStorage.setItem(
                    "currentParticipant",
                    JSON.stringify(data.currentParticipant)
                );
                localStorage.setItem("chatId", data.chatId);
                localStorage.setItem("quetzalChatId", data.quetzalChatId);
            });
    }, []);

    useEffect(() => {
        socket.current = new WebSocket("ws://localhost:3005");

        socket.current.onopen = () => {
            console.log("Connected successfully.");
        };

        socket.current.onmessage = async (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === "messageCreated") {
                const newMessage = JSON.parse(msg["utf8Data"]);

                setTranslatedMessages([
                    ...translatedMessages,
                    {
                        ...newMessage,
                        messageId: msg.messageId,
                    },
                ]);
            } else if (msg.type === "translationFinished") {
                if (!translationOn) return;
                if (msg.result !== "ok") return;
                setTranslatedMessages((prevMessages) =>
                    prevMessages.map((message) => {
                        if (msg.message_ids.includes(message.messageId)) {
                            return {
                                ...message,
                                text:
                                    msg.translations[preferredLanguage] ||
                                    message.text,
                            };
                        }
                        return message;
                    })
                );
            }
        };

        return () => {
            socket.current.close();
        };
    }, [preferredLanguage, translatedMessages, translationOn]);

    const fetchMessages = useCallback(
        (newChatId, selectedRole) => {
            if (!newChatId || !selectedRole) return;
            fetch(
                `http://localhost:3005/messages?chatId=${newChatId}&selectedRole=${selectedRole}`
            )
                .then((res) => res.json())
                .then((data) => {
                    if (
                        !data.quetzalChatId ||
                        !data.participant ||
                        !data.messages
                    )
                        return;
                    setQuetzalChatId(data.quetzalChatId);
                    setCurrentParticipant(data.participant);
                    localStorage.setItem("quetzalChatId", data.quetzalChatId);
                    localStorage.setItem(
                        "currentParticipant",
                        JSON.stringify(data.participant)
                    );
                    fetch(
                        `https://api.getquetzal.com/api/chat/log?chat_id=${data.quetzalChatId}&limit=10&wait=true`,
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
                                const translationsMap = new Map(
                                    response.messages.map((msg) => [
                                        Number(msg.hash),
                                        msg.translations,
                                    ])
                                );

                                const updatedTranslatedMessages =
                                    data.messages.map((message) => ({
                                        ...message, // Maintain the rest of the message object
                                        text:
                                            currentParticipant &&
                                            translationsMap.get(
                                                Number(message.id)
                                            ) &&
                                            Object.keys(
                                                translationsMap.get(
                                                    Number(message.id)
                                                )
                                            ).includes(preferredLanguage) &&
                                            Number(message.participantId) !==
                                                currentParticipant.id
                                                ? translationsMap.get(
                                                      Number(message.id)
                                                  )[preferredLanguage]
                                                : message.text, // Replace only content
                                    }));

                                setTranslatedMessages(
                                    updatedTranslatedMessages
                                );
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
        },
        [currentParticipant, preferredLanguage]
    );

    useEffect(() => {
        if (chatId && !translatedMessages.length && currentParticipant) {
            fetchMessages(chatId, currentParticipant.role);
        }
    }, []);

    const sendMessage = useCallback(() => {
        if (messageInput.trim() === "") {
            return;
        }

        const message = {
            type: "newMessage",
            text: messageInput,
            participantId: currentParticipant.id,
            timestamp: new Date().toISOString(),
            chatId,
        };

        socket.current.send(JSON.stringify(message));

        setMessageInput("");
    }, [chatId, currentParticipant?.id, messageInput]);

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

    const handleSettingsUpdated = useCallback(
        (newSettings) => {
            setTranslationOn(newSettings.translationOn);
            localStorage.setItem("translationOn", newSettings.translationOn);
            if (newSettings.preferredLanguage) {
                setPreferredLanguage(newSettings.preferredLanguage);
                localStorage.setItem(
                    "preferredLanguage",
                    newSettings.preferredLanguage
                );
            }
            return fetch("https://api.getquetzal.com/api/chat/update", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": "QTZL_2V266U004U857OOISBY1M8",
                },
                body: JSON.stringify({
                    chat_id: quetzalChatId,
                    participants: [
                        {
                            id: currentParticipant.id.toString(),
                            locale: newSettings.preferredLanguage,
                        },
                    ],
                }),
            })
                .then((res) => res.json())
                .then((data) => {
                    console.log("Chat updated:", data);

                    fetchMessages(chatId, selectedRole);
                })
                .catch((err) =>
                    console.error("Error updating chat to API:", err)
                );
        },
        [
            chatId,
            currentParticipant?.id,
            fetchMessages,
            quetzalChatId,
            selectedRole,
        ]
    );

    if (showUserSettingsPage)
        return (
            <UserSettingsPage
                preferredLanguage={preferredLanguage}
                setShowUserSettingsPage={setShowUserSettingsPage}
                handleSaveSettings={handleSettingsUpdated}
            />
        );

    return (
        <div className="App">
            {/* Top Navbar */}
            <div className="top-navbar">
                <div className="logo">T</div>
                <div className="search-bar">
                    <input
                        type="text"
                        placeholder="Describe your project or problem"
                    />
                    <input
                        type="text"
                        className="zipcode-input"
                        placeholder="Zip Code"
                    />
                    <button className="search-button">🔍</button>
                </div>
                <div className="top-nav-buttons">
                    <button>Sign up as a pro</button>
                    <button>Plan</button>
                    <button>Team</button>
                    <button>Inbox</button>
                    {/* Profile Dropdown Button */}
                    <div className="profile-menu">
                        <button
                            className="profile-button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                        >
                            <span className="profile-initials">JT</span> John ▼
                        </button>

                        {/* Dropdown Menu */}
                        {dropdownOpen && (
                            <div className="dropdown-menu">
                                <button
                                    onClick={() => {
                                        setShowUserSettingsPage(true);
                                        setDropdownOpen(false);
                                    }}
                                >
                                    Profile
                                </button>
                                <button>Payment methods</button>
                                <button>Log out</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {chatId && quetzalChatId ? (
                <div className="main-window">
                    <div className="left-panel">
                        <div>
                            {/* Navbar */}
                            <div className="navbar">
                                <div className="navbar-left">Notarization</div>
                                <div className="navbar-right">
                                    <button className="navbar-button">
                                        📞 Call pro
                                    </button>
                                    <button className="navbar-button">
                                        ⭐ Review pro
                                    </button>
                                    <button className="navbar-button">
                                        ☰ Project details
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <button
                                onClick={() => {
                                    setChatId(undefined);
                                }}
                            >
                                Back
                            </button>
                            <p>You are logged in as: {selectedRole}</p>
                            <p>Your chat ID is: {chatId}</p>
                            {/* Chat Container */}
                            <div className="chat-container">
                                <div className="chat-messages">
                                    <div className="default-message-container">
                                        <div className="default-message">
                                            <p>
                                                <strong>New:</strong> Send and
                                                receive messages in your native
                                                language.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setShowUserSettingsPage(
                                                        true
                                                    );
                                                }}
                                            >
                                                Try it now
                                            </button>
                                        </div>
                                    </div>
                                    {translatedMessages.map(
                                        (message, index) => (
                                            <div
                                                className={`message ${
                                                    Number(
                                                        message["participantId"]
                                                    ) === currentParticipant.id
                                                        ? "sent"
                                                        : "received"
                                                }`}
                                                key={index}
                                            >
                                                <span className="message-content">
                                                    {message["text"]}
                                                </span>
                                                <span className="message-timestamp">
                                                    {formatTime(
                                                        message["timestamp"]
                                                    )}
                                                </span>
                                            </div>
                                        )
                                    )}
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
                    </div>
                    <div className="right-panel">
                        <p>Side panel</p>
                    </div>
                </div>
            ) : (
                <div className="chat-input chat-input-login">
                    <p>Choose your role in this demo!</p>
                    <p>Join as User and chat with Arthur:</p>
                    <div
                        className="user-list-option"
                        onClick={() => {
                            localStorage.setItem("selectedRole", "User");
                            setSelectedRole("User");
                            if (tempChatId) {
                                localStorage.setItem("chatId", tempChatId);
                                setChatId(tempChatId);
                                fetchMessages(tempChatId, "Pro");
                                setTempChatId("");
                            } else {
                                createChat("User");
                            }
                        }}
                    >
                        <img src={arthur} alt="user" className="profile-pic" />
                        <div style={{ flexGrow: "1" }}>
                            <p style={{ fontWeight: "bold" }}>Arthur Santos</p>
                            <p style={{ fontSize: "14px" }}>Notary Public</p>
                        </div>
                        <p style={{ fontSize: "18px" }}>➜</p>
                    </div>
                    <p>Join as Pro and chat with Billy:</p>
                    <div
                        className="user-list-option"
                        onClick={() => {
                            localStorage.setItem("selectedRole", "Pro");
                            setSelectedRole("Pro");
                            if (tempChatId) {
                                localStorage.setItem("chatId", tempChatId);
                                setChatId(tempChatId);
                                fetchMessages(tempChatId, "Pro");
                                setTempChatId("");
                            } else {
                                createChat("Pro");
                            }
                        }}
                    >
                        <img src={billy} alt="user" className="profile-pic" />
                        <div style={{ flexGrow: "1" }}>
                            <p style={{ fontWeight: "bold" }}>Billy Brandy</p>
                            <p style={{ fontSize: "14px" }}>Customer #348934</p>
                        </div>
                        <p style={{ fontSize: "18px" }}>➜</p>
                    </div>
                    <p>
                        Or, type an existing Chat ID and then click one of the
                        options above to join
                    </p>
                    <input
                        type="text"
                        name="chatId"
                        placeholder="Chat ID"
                        value={tempChatId ?? ""}
                        style={{ width: "75%" }}
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
