const WebSocket = require("websocket").server;
const http = require("http");
const cors = require("cors");
const Sequelize = require("sequelize");
const axios = require("axios");

const sequelize = new Sequelize(process.env.DATABASE_URL);

const Message = sequelize.define("Message", {
    participantId: Sequelize.DataTypes.STRING,
    text: Sequelize.DataTypes.STRING,
    timestamp: Sequelize.DataTypes.DATE,
    chatId: Sequelize.DataTypes.INTEGER,
});

const Participant = sequelize.define("Participant", {
    locale: Sequelize.DataTypes.STRING,
    translationOn: Sequelize.DataTypes.BOOLEAN,
    chatIds: Sequelize.DataTypes.ARRAY(Sequelize.INTEGER),
    role: Sequelize.DataTypes.STRING,
});

const Chat = sequelize.define("Chat", {
    participantIds: Sequelize.DataTypes.ARRAY(Sequelize.INTEGER),
    quetzalChatId: Sequelize.DataTypes.STRING,
});

sequelize
    .authenticate()
    .then(() => {
        console.log("Connection has been established successfully.");
        Message.sync();
        Participant.sync();
        Chat.sync();
        createServer();
    })
    .catch((err) => {
        console.error("Unable to connect to the database:", err);
    });

function createServer() {
    const httpServer = http.Server((req, res) => {
        cors()(req, res, async () => {
            const url = new URL(req.url, `http://${req.headers.host}`);
            if (url.pathname === "/messages") {
                const chatId = url.searchParams.get("chatId");
                const selectedRole = url.searchParams.get("selectedRole");
                const before = url.searchParams.get("before"); // ISO timestamp for messages before this time
                const after = url.searchParams.get("after"); // ISO timestamp for messages after this time
                const limit = parseInt(url.searchParams.get("limit")) || 10; // Default limit to 10 if not provided

                if (!chatId || !selectedRole) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(
                        JSON.stringify({
                            error: "chatId and selectedRole are required",
                        })
                    );
                    return;
                }

                Chat.findByPk(chatId).then((chat) => {
                    if (!chat) {
                        res.writeHead(500, { "Content-Type": "text/plain" });
                        res.end("Incorrect chatId provided");
                        return;
                    }

                    Participant.findAll({
                        where: {
                            role: selectedRole,
                            chatIds: { [Sequelize.Op.contains]: [chatId] },
                        },
                    }).then((participants) => {
                        if (!participants || !participants.length) {
                            res.writeHead(500, {
                                "Content-Type": "text/plain",
                            });
                            res.end("Participant not found");
                            return;
                        }

                        // Construct dynamic query condition
                        let whereCondition = { chatId };
                        if (before && after) {
                            whereCondition.timestamp = {
                                [Sequelize.Op.lt]: new Date(before),
                                [Sequelize.Op.gt]: new Date(after),
                            };
                        } else if (before) {
                            whereCondition.timestamp = {
                                [Sequelize.Op.lt]: new Date(before),
                            };
                        } else if (after) {
                            whereCondition.timestamp = {
                                [Sequelize.Op.gt]: new Date(after),
                            };
                        }

                        // Determine sort order
                        const order =
                            before || (!before && !after)
                                ? [["timestamp", "DESC"]]
                                : [["timestamp", "ASC"]];

                        Message.findAll({
                            where: whereCondition,
                            order: order,
                            limit: limit,
                        }).then((messages) => {
                            // If fetching `before`, reverse messages to return in chronological order
                            if (before || (!before && !after))
                                messages.reverse();

                            res.writeHead(200, {
                                "Content-Type": "application/json",
                            });
                            res.end(
                                JSON.stringify({
                                    messages,
                                    quetzalChatId: chat.quetzalChatId,
                                    participant: participants[0],
                                })
                            );
                        });
                    });
                });
            } else if (url.pathname === "/newChat") {
                const preferredRole = url.searchParams.get("preferredRole");
                // Create two dummy participants
                const participant1 = await Participant.create({
                    locale: "en-US",
                    translationOn: false,
                    chatIds: [],
                    role: "User",
                });

                const participant2 = await Participant.create({
                    locale: "en-US",
                    translationOn: false,
                    chatIds: [],
                    role: "Pro",
                });

                axios
                    .post(
                        "https://api.getquetzal.com/api/chat/new",
                        {
                            participants: [
                                {
                                    id: participant1.id,
                                    locale: participant1.locale,
                                    role: participant1.role,
                                },
                                {
                                    id: participant2.id,
                                    locale: participant2.locale,
                                    role: participant2.role,
                                },
                            ],
                        },
                        {
                            headers: {
                                "Content-Type": "application/json",
                                "api-key": "QTZL_2V266U004U857OOISBY1M8",
                            },
                        }
                    )
                    .then(async (response) => {
                        const chat = await Chat.create({
                            participantIds: [participant1.id, participant2.id],
                            quetzalChatId: response.data.quetzal_chat_id,
                        });

                        participant1.chatIds = [chat.id];
                        participant2.chatIds = [chat.id];

                        participant1.save();
                        participant2.save();

                        res.writeHead(200, {
                            "Content-Type": "application/json",
                        });
                        res.end(
                            JSON.stringify({
                                chatId: chat.id,
                                quetzalChatId: response.data.quetzal_chat_id,
                                currentParticipant:
                                    preferredRole === "User"
                                        ? participant1
                                        : participant2,
                            })
                        );
                    })
                    .catch((err) =>
                        console.error("Error sending message to API:", err)
                    );
            }
        });
    });

    const webSocketServer = new WebSocket({
        httpServer: httpServer,
    });

    webSocketServer.on("request", (req) => {
        const connection = req.accept(null, req.origin);

        connection.on("message", async (message) => {
            let msg = JSON.parse(message.utf8Data);

            if (msg.type === "newMessage") {
                const dbMessage = await Message.create({
                    participantId: msg.participantId,
                    text: msg.text,
                    timestamp: msg.timestamp,
                    chatId: msg.chatId,
                });

                let chat = await Chat.findByPk(msg.chatId);

                if (!chat) {
                    console.log("Unable to find chat");
                    return;
                }

                webSocketServer.broadcast(
                    JSON.stringify({
                        ...message,
                        messageId: dbMessage.id,
                        type: "messageCreated",
                    })
                );

                try {
                    const response = await axios.post(
                        "https://api.getquetzal.com/api/chat/messages/new",
                        {
                            chat_id: chat.quetzalChatId,
                            messages: [
                                {
                                    hash: dbMessage.id,
                                    content: msg.text,
                                    timestamp: msg.timestamp,
                                    participant: msg.participantId.toString(),
                                },
                            ],
                        },
                        {
                            headers: {
                                "Content-Type": "application/json",
                                "api-key": "QTZL_2V266U004U857OOISBY1M8",
                            },
                        }
                    );

                    if (
                        response.data.result === "ok" &&
                        response.data.messages &&
                        response.data.messages.length
                    ) {
                        webSocketServer.broadcast(
                            JSON.stringify({
                                type: "translationFinished",
                                message_ids: [dbMessage.id],
                                translations:
                                    response.data.messages[0].translations,
                                result: "ok",
                            })
                        );
                    } else {
                        webSocketServer.broadcast(
                            JSON.stringify({
                                type: "translationFinished",
                                message_ids: [dbMessage.id],
                                result:
                                    response.data.message ||
                                    "Translation error",
                            })
                        );
                    }
                } catch (error) {
                    console.error("Error sending message to API:", error);

                    webSocketServer.broadcast(
                        JSON.stringify({
                            type: "translationFinished",
                            message_ids: [dbMessage.id],
                            result: error.message || "Translation error",
                        })
                    );
                }
            }
        });

        connection.on("close", () => {
            // defer conn
        });
    });

    httpServer.listen(3005, () => console.log("Listening on port 3005"));
}
