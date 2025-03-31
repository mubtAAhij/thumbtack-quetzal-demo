import "./App.css";
import { useEffect, useState, useRef, useCallback } from "react";
import arthur from "./arthur.jpg";
import billy from "./billy.jpg";
import UserSettingsPage from "./UserSettingsPage";
import {
    QuetzalMessageDisplayState,
    useQuetzalChat,
} from "@quetzallabs/react-chat-sdk";

function App() {
    const {
        setUpChat,
        maybeUpdateChat,
        fetchTranslationsByExternalIdAndStore,
        translateBatchMessagesAndStore,
        getTranslationForCurrentParticipant,
        setCurrentParticipantId,
        setTranslatedMessageDisplayState,
        translatedMessageDisplayStates,
        showDisplayStatusChangeButtons,
    } = useQuetzalChat();

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
    const [translationOn, setTranslationOn] = useState(
        localStorage.getItem("translationOn") || true
    );
    const [preferredLanguage, setPreferredLanguage] = useState(
        localStorage.getItem("preferredLanguage") || "en-US"
    );

    const [showUserSettingsPage, setShowUserSettingsPage] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [earliestMessageTime, setEarliestMessageTime] = useState(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const messagesContainerRef = useRef(null);

    const createChat = useCallback(
        (role) => {
            fetch(`http://localhost:3005/newChat?preferredRole=${role}`)
                .then((res) => res.json())
                .then((data) => {
                    setCurrentParticipant(data.currentParticipant);
                    setCurrentParticipantId(data.currentParticipant.id);
                    setChatId(data.chatId);
                    setQuetzalChatId(data.quetzalChatId);
                    localStorage.setItem(
                        "currentParticipant",
                        JSON.stringify(data.currentParticipant)
                    );
                    localStorage.setItem("chatId", data.chatId);
                    localStorage.setItem("quetzalChatId", data.quetzalChatId);
                });
        },
        [setCurrentParticipantId]
    );

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
                        id: msg.messageId,
                        translated: false,
                    },
                ]);
            } else if (msg.type === "translationFinished") {
                if (!translationOn) return;
                if (msg.result !== "ok") return;
                setTranslatedMessages((prevMessages) =>
                    prevMessages.map((message) => {
                        if (msg.message_ids.includes(message.id)) {
                            return {
                                ...message,
                                translated: true,
                                originalText: message.text,
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
        async (
            newChatId,
            selectedRole,
            newPreferredLanguage,
            before = null
        ) => {
            if (!newChatId || !selectedRole) return;

            setIsLoadingMore(true);
            const container = messagesContainerRef.current;

            try {
                // Step 1: Fetch raw messages from your backend
                const url = new URL("http://localhost:3005/messages");
                url.searchParams.append("chatId", newChatId);
                url.searchParams.append("selectedRole", selectedRole);
                url.searchParams.append("limit", "10");
                if (before) url.searchParams.append("before", before);

                const res = await fetch(url);
                const data = await res.json();

                if (!data.quetzalChatId || !data.participant || !data.messages)
                    return;

                setQuetzalChatId(data.quetzalChatId);
                setCurrentParticipant(data.participant);
                setCurrentParticipantId(data.participant.id);
                localStorage.setItem("quetzalChatId", data.quetzalChatId);
                localStorage.setItem(
                    "currentParticipant",
                    JSON.stringify(data.participant)
                );

                // Step 2: Maybe update chat settings based on preferred language
                await maybeUpdateChat([
                    {
                        externalId: data.participant.id.toString(),
                        locale: newPreferredLanguage,
                    },
                ]);

                if (data.messages.length === 0) {
                    setHasMoreMessages(false);
                    return;
                }

                // Step 3: Fetch existing translations
                const messageIds = data.messages.map((msg) => msg.id);
                const { missing } = await fetchTranslationsByExternalIdAndStore(
                    messageIds
                );

                // Step 4: Request any missing translations
                if (missing.length > 0) {
                    const missingMessagePayload = data.messages
                        .filter((msg) => missing.includes(msg.id))
                        .map((msg) => ({
                            hash: msg.id,
                            content: msg.text,
                            participant: msg.participantId,
                        }));

                    await translateBatchMessagesAndStore(missingMessagePayload);
                }

                // Step 5: Build final message list with translations injected
                const finalMessages = data.messages.map((msg) => {
                    const { text: translatedText, available } =
                        getTranslationForCurrentParticipant(msg.id);

                    return {
                        ...msg,
                        originalText: msg.text,
                        text: available ? translatedText : msg.text,
                        translated: true,
                    };
                });

                setTranslatedMessages((prevMessages) => {
                    const oldMessages = prevMessages.filter(
                        (msg) => !finalMessages.some((m) => m.id === msg.id)
                    );
                    return [...finalMessages, ...oldMessages];
                });

                if (finalMessages.length > 0) {
                    setEarliestMessageTime(finalMessages[0].timestamp);
                }

                if (finalMessages.length < 10) {
                    setHasMoreMessages(false);
                }

                setTimeout(() => {
                    if (container) {
                        container.scrollTop = container.scrollHeight;
                    }
                }, 0);
            } catch (error) {
                console.error("Error fetching messages:", error);
            } finally {
                setIsLoadingMore(false);
            }
        },
        [
            setCurrentParticipantId,
            maybeUpdateChat,
            fetchTranslationsByExternalIdAndStore,
            translateBatchMessagesAndStore,
            getTranslationForCurrentParticipant,
        ]
    );

    const handleScroll = useCallback(() => {
        if (!messagesContainerRef.current || isLoadingMore || !hasMoreMessages)
            return;

        if (messagesContainerRef.current.scrollTop === 0) {
            fetchMessages(
                chatId,
                selectedRole,
                preferredLanguage,
                earliestMessageTime
            );
        }
    }, [
        chatId,
        earliestMessageTime,
        fetchMessages,
        hasMoreMessages,
        isLoadingMore,
        preferredLanguage,
        selectedRole,
    ]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        let firstScroll = true; // Flag to prevent immediate fetch

        const handleScrollEvent = () => {
            if (firstScroll) {
                firstScroll = false;
                return;
            }
            handleScroll();
        };

        container.addEventListener("scroll", handleScrollEvent);
        return () => container.removeEventListener("scroll", handleScrollEvent);
    }, [handleScroll]);

    useEffect(() => {
        const fetchInitialData = async () => {
            if (chatId && !translatedMessages.length && currentParticipant) {
                localStorage.setItem("translationOn", true);
                await setUpChat(chatId);
                fetchMessages(
                    chatId,
                    currentParticipant.role,
                    preferredLanguage
                );
            }
        };
        fetchInitialData();
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
        async (newSettings) => {
            setTranslationOn(newSettings.translationOn);
            localStorage.setItem("translationOn", newSettings.translationOn);
            if (newSettings.preferredLanguage) {
                setPreferredLanguage(newSettings.preferredLanguage);
                localStorage.setItem(
                    "preferredLanguage",
                    newSettings.preferredLanguage
                );

                setTranslatedMessages([]);
                setHasMoreMessages(true);
                setIsLoadingMore(false);

                fetchMessages(
                    chatId,
                    selectedRole,
                    newSettings.preferredLanguage
                );
            }
        },
        [chatId, fetchMessages, selectedRole]
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
                                <div
                                    className="chat-messages"
                                    ref={messagesContainerRef}
                                    onScroll={handleScroll}
                                >
                                    <div className="translation-banner">
                                        <div className="translation-icon">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 16 16"
                                                width="2em"
                                                height="2em"
                                            >
                                                <g fill="currentColor">
                                                    <path d="M4.545 6.714L4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286zm1.634-.736L5.5 3.956h-.049l-.679 2.022z"></path>
                                                    <path d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm7.138 9.995q.289.451.63.846c-.748.575-1.673 1.001-2.768 1.292c.178.217.451.635.555.867c1.125-.359 2.08-.844 2.886-1.494c.777.665 1.739 1.165 2.93 1.472c.133-.254.414-.673.629-.89c-1.125-.253-2.057-.694-2.82-1.284c.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6 6 0 0 1-.415-.492a2 2 0 0 1-.94.31"></path>
                                                </g>
                                            </svg>
                                        </div>
                                        <div className="translation-text">
                                            <div className="heading">
                                                Translation on
                                            </div>
                                            <div>
                                                Messages in this chat will be
                                                translated to{" "}
                                                {(() => {
                                                    const locale =
                                                        new Intl.Locale(
                                                            preferredLanguage
                                                        );
                                                    const languageCode =
                                                        locale.language;
                                                    const languageNames =
                                                        new Intl.DisplayNames(
                                                            ["en"],
                                                            { type: "language" }
                                                        );
                                                    return languageNames.of(
                                                        languageCode
                                                    );
                                                })()}
                                                .
                                                <button
                                                    onClick={() =>
                                                        setShowUserSettingsPage(
                                                            true
                                                        )
                                                    }
                                                >
                                                    Change language
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    {isLoadingMore && (
                                        <p className="loading-spinner">
                                            Loading more messages...
                                        </p>
                                    )}
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
                                                    {translatedMessageDisplayStates.get(
                                                        message.id
                                                    ) ===
                                                    QuetzalMessageDisplayState.ORIGINAL
                                                        ? message[
                                                              "originalText"
                                                          ]
                                                        : message["text"]}
                                                </span>
                                                <span className="message-timestamp">
                                                    {formatTime(
                                                        message["timestamp"]
                                                    )}
                                                </span>
                                                {Number(
                                                    message["participantId"]
                                                ) !== currentParticipant.id &&
                                                showDisplayStatusChangeButtons ? (
                                                    <div className="message-status">
                                                        {message.translated ===
                                                        false ? (
                                                            <div className="spinner"></div>
                                                        ) : translatedMessageDisplayStates.get(
                                                              message.id
                                                          ) ===
                                                          QuetzalMessageDisplayState.ORIGINAL ? (
                                                            <button
                                                                className="show-original"
                                                                onClick={() =>
                                                                    setTranslatedMessageDisplayState(
                                                                        message.id,
                                                                        QuetzalMessageDisplayState.TRANSLATED
                                                                    )
                                                                }
                                                            >
                                                                Show translation
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="show-original"
                                                                onClick={() =>
                                                                    setTranslatedMessageDisplayState(
                                                                        message.id,
                                                                        QuetzalMessageDisplayState.ORIGINAL
                                                                    )
                                                                }
                                                            >
                                                                Show original
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : null}
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
                        onClick={async () => {
                            localStorage.setItem("selectedRole", "User");
                            localStorage.setItem("translationOn", true);
                            setSelectedRole("User");
                            if (tempChatId) {
                                localStorage.setItem("chatId", tempChatId);
                                setChatId(tempChatId);
                                await setUpChat(tempChatId);
                                fetchMessages(tempChatId, "User", "en-US");
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
                        onClick={async () => {
                            localStorage.setItem("selectedRole", "Pro");
                            localStorage.setItem("translationOn", true);
                            setSelectedRole("Pro");
                            if (tempChatId) {
                                localStorage.setItem("chatId", tempChatId);
                                setChatId(tempChatId);
                                await setUpChat(tempChatId);
                                fetchMessages(tempChatId, "Pro", "en-US");
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
