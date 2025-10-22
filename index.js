import express from "express";
import { createServer } from "http";
// const bodyParser = imp('body-parser');  // replaced by express.urlencoded *1
import "dotenv/config";
import mongoose from "mongoose";
import validator from "validator";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Server } from "socket.io";

import { ChatId, Message, User } from "./models/User.js";
import { issuedAtMap, loadIssuedAtMap } from "./cache/issuedAtCache.js";
import {
  THE_MESS,
  SORTED_MESS,
  MESS_TRACKER,
  MONGO_SAVED_MESS,
  restoreChats,
} from "./utils/restoreChats.js";
import {
  nicknameMap,
  uemailMap,
  chatIdMap,
  loadNicknameMap,
  loadChatIdMap,
} from "./cache/nicknameCache.js";
import { handleLogin } from "./authUtils/handleLogin.js";
import {
  PORT,
  host,
  allowedOrigins,
  uemailVerificationTokensMap,
} from "./utils/constVars.js";

const app = express();


app.use(express.urlencoded({ extended: false })); // *1
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// mongoose part

async function addUser(userData) {
  if (validator.isEmail(userData.uemail) && userData.pw1 === userData.pw2) {
    // checking for existing user
    if (uemailMap.get(userData.uemail)) return { code: "ougl" };

    const pwHash = await bcrypt.hash(userData.pw1, 12);
    const passedUserData = {
      uemail: userData.uemail,
      nickname: userData.name,
      password: pwHash,
      uemailVerified: false,
      dbSaveEnabled: false,
    };
    try {
      const newUser = await User.create(passedUserData);
      return newUser;
    } 
    catch (err) {
      if(err.code === 11000) {
        return { code : 'ougl'};
      }
      else {
      console.log("db error", err);
      return null;
      }
    }
  } else {
    return null;
  }
}

function authMiddleWare(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    // console.log("no tok", req.cookies);
    return res.status(401).json({ code: 0, codeMsg: "not signed in" });
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, userData) => {
    const issuedAt = issuedAtMap.get(userData._id);
    if (err)
      return res
        .status(403)
        .json({ code: 0, codeMsg: "Unauthorised -invalid token" });
    else if (!issuedAt || issuedAt !== userData.issuedAt)
      return res
        .status(403)
        .json({ code: 0, codeMsg: "unauthorised - expired token" });
    else if (!userData.uemailVerified) {
      if(nicknameMap.has(userData._id)) {
      }
      else return res.json({ code: 0, codeMsg: "unverified uemail" });
    }
    req.user = userData;
    next();
  });
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_SH_CHAT_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("connected to mongodb");
    await loadIssuedAtMap();
    await loadNicknameMap();
    await loadChatIdMap();
    await restoreChats(chatIdMap);
    console.log("caches loaded");
  } catch (err) {
    console.error("mongoDB connect failed::", err.message);
    process.exit(1);
  }
})();

app.use((req, res, next) => {
  console.log("route", req.method, req.originalUrl);
  next();
});

// app.get('/', (req,res)=> {
//   res.send('<h1>Hello sh-chat!</h1>') // exception to code-codeMsg convention
// });

app.post("/auth/signup", async (req, res) => {
  console.log("request received");
  const userData = {
    uemail: req.body.uemail,
    pw1: req.body.pw1,
    pw2: req.body.pw2,
    name: req.body.uemail.split("@")[0],
  };
  try {
    const result = await addUser(userData); // sanitised in this func
    if (!result) return res.json({ code: 0, codeMsg: "invalid params" });
    else if (result && result.code != "ougl") {
      console.log("new user added: ", req.body.uemail, " :: ", userData.name);
      // loadIssuedAtMap(); // fix this //fixed
      const newIssuedAt = await User.findOne(
        { uemail: userData.uemail },
        { _id: 1, issuedAt: 1, nickname: 1, uemail:1 } //wtf
      );
      issuedAtMap.set(newIssuedAt._id.toString(), newIssuedAt.issuedAt);
      console.info("debug_IAMap:", issuedAtMap, "NIA", newIssuedAt);
      nicknameMap.set(newIssuedAt._id.toString(), newIssuedAt.name);
      uemailMap.set(newIssuedAt.uemail, newIssuedAt.name)
    }
    // else if(result.code == 'ougl') res.json({code:0, codeMsg: 'Existing user, go to login'})
    req.body.loginEmail = req.body.uemail;
    req.body.loginPw = req.body.pw1;
    await handleLogin(req, res);
  } catch (err) {
    console.log('DEBUG::',err);
    res.json({ code: 0, codeMsg: "signup failed -maybe retry" });
  }
});

app.post("/auth/login", async (req, res) => {
  await handleLogin(req, res);
});

app.get("/auth/status", (req, res) => {
  // unprotected route /!\
  const token = req.cookies.token;
  if (!token) return res.json({ code: 0, codeMsg: "unauthenticated" });
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET_KEY);
    res.json({ code: 1, codeMsg: `your'e in ${user.uemail}` });
  } catch {
    res.json({ code: 0, codeMsg: "invalid/expired token" });
  }
});

app.post("/profile/nickname", authMiddleWare, async (req, res) => {
  let nickname = req.body.nickname;

  if (!nickname || typeof nickname != "string") {
    return res.json({
      code: 0,
      codeMsg: "Invalid Nickname",
    });
  }
  nickname = nickname.trim();
  if (nickname.length === 0 || nickname.length > 30) {
    return res.json({
      code: 0,
      codeMsg: "Nickname must be 1-30 chars",
    });
  }
  // see if you have to restrict characters [with regex]
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { nickname: nickname } }
    ); // 'const nick = ' be taken out?
    // loadNicknameMap();
    nicknameMap.set(req.user.uemail, nickname);
    return res.json({
      code: 1,
      codeMsg: `nickname changed to ${nickname}`,
      nickname: nickname,
    });
  } catch (err) {
    return res.json({ code: 0, codeMsg: "nickname update failed" });
  }
});

app.get("/profile", authMiddleWare, async (req, res) => {
  return res.json({
    code: 1,
    codeMsg: "get it",
    profile: {
      uid: req.user._id,
      uemail: req.user.uemail,
      nickname: uemailMap.get(req.user.uemail) || req.user.uemail.split("@")[0],
      profilePicURL: "", // to be impl-ed
    },
  });
});

app.post("/chat/new", authMiddleWare, async (req, res) => {
  console.log("create-chat...");
  if (
    !Array.isArray(req.body.members) ||
    (req.body.members.length == 1 &&
      req.body.members.includes(req.user.uemail)) ||
    req.body.members.length == 0
  )
    return res.json({ code: 0, codeMsg: "invalid request" });
  const chatId = req.user._id + Date.now().toString(); //toString needed?
  const hasUnknown = req.body.members.some((member) => !uemailMap.has(member));

  if (hasUnknown) {
    return res.json({ code: 0, codeMsg: "unknown memeber in list" });
  }

  const members = Array.from(new Set([...req.body.members, req.user.uemail]));

  if (members.length == 2) {
    // this is supposed to be addl handling on server. this situaton should be managed on client
    const yourChatId = await ChatId.findOne(
      {
        members: { $all: [members[0], members[1]], $size: 2 },
      },
      {
        chatId: 1,
      }
    );
    if (yourChatId) {
      // add support for groups too
      return res.json({ code: 2, codeMsg: "chat exists", chatId: yourChatId });
    }
  }
  if (members.length > 2 && !req.body.chatName) {
    return res.json({ code: 0, codeMsg: "group requires a name" });
  }
  const newChatId = {
    chatId: chatId,
    chatName: req.body.chatName,
    members: members, // make this into map - keeping as arr for no
    admin: req.user.uemail,
    mods: [],
  };
  try {
    await ChatId.create(newChatId);
    loadChatIdMap();
    return res.json({ code: 1, codeMsg: "chat created", chatId: newChatId });
  } catch (err) {
    return res.json({ code: 0, codeMsg: "failed, server error" });
  }
});

app.get("/chats", authMiddleWare, async (req, res) => {
  const chatId = req.query.chatId; // optional
  const query = {
    chatId: chatId ? ChatId : { $exists: true },
    members: { $in: [req.user.uemail] },
  };
  const chats = await ChatId.find(query, { _id: 0, __v: 0 });
  return res.json({ code: 1, chats: Array.from(chats) });
});

app.get("/user/exists", authMiddleWare, (req, res) => {
  // req: uemail={uemail}

  if (validator.isEmail(req.query.uemail) && uemailMap.has(req.query.uemail)) {
    return res.json({
      code: 1,
      uemail: req.query.uemail,
      nickname: uemailMap.get(req.query.uemail),
      codeMsg: "user_exists",
    });
  }
  return res.json({ code: 0, uemail: null, codeMsg: "non_existent_user" });
});
app.post("/users/nicknames", authMiddleWare, (req, res) => {
  if (!Array.isArray(req.body.users)) {
    return res.json({
      code: 0,
      codeMsg: "users must be array",
    });
  }
  const users = req.body.users;
  const hasInvalidOrUnknownEmails = users.some((user) => {
    return !validator.isEmail(user) || !uemailMap.has(user);
  });
  if (hasInvalidOrUnknownEmails) {
    return res.json({
      code: 0,
      codeMsg: "invalid/unknown users in array",
    });
  }
  const nicknames = users.map((user) => {
    return {
      uemail: user,
      nickname: uemailMap.get(user) || user.split("@")[0],
    };
  });
  return res.json({
    code: 1,
    codeMsg: "get your contacts",
    contacts: nicknames,
  });
});

// docs on message DS's:
//   THE_MESS -> Map(s_uid: message)
//   SORTED_MESS -> Map(s_uid: Map(suid: message)) // supposed to be refs to THE_MESS elements
//   MESS_TRACKER -> Map(s_uid: Set(member1,member2,...))

// socket replacing POST /messages
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  },
});

io.use((socket, next) => {
  // auth area. move this to middleware later
  const tokenHeader = socket.handshake.headers.cookie || "";
  const token = tokenHeader.match(/(?:^|;\s*)token=([^;]*)/)?.[1];
  if (!token) {
    console.log("SOCK:", socket.id, " : no token");
    socket.disconnect(true);
    return;
  }
  try {
    const userData = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const validIssuedAt = issuedAtMap.get(userData._id);
    if (!validIssuedAt || userData.issuedAt !== validIssuedAt) {
      console.log(socket.id, " : Invalid token -expired");
      socket.disconnect(true);
      return;
    } else if (!userData.uemailVerified) {
      console.log(socket.id, " : sock:unverified uemail");
      socket.disconnect(true);
      return;
    }
    socket.user = userData;
    userSocketMap.set(socket.user.uemail, socket.id);
    setTimeout(() => pushMessagesToClient(), 500);
    console.log(`SOCK: ${socket.user.uemail} connected`);
    next();
  } catch (err) {
    console.log(socket.id, " : Invalid token");
    socket.disconnect(true);
    return;
  } // auth end
});

const userSocketMap = new Map();

io.on("connection", (socket) => {
  socket.on("messagesToServer", (messages) => {
    if (!Array.isArray(messages) || !messages.length) {
      socket.emit("messagesToServer", {
        code: 0,
        codeMsg: "Malformed req, should be array",
      });
      return;
    }
    // console.log("DEBUG::socMes:", messages);
    const isMalformed = messages.some((messageObj) => {
      return (
        !("chatId" in messageObj) ||
        !("content" in messageObj) ||
        !chatIdMap.has(messageObj.chatId) ||
        !chatIdMap.get(messageObj.chatId).includes(socket.user.uemail) ||
        messageObj.content.trim() == ""
      );
    });

    if (isMalformed) {
      // console.log("malformed req l316");
      socket.emit("messagesToServer", {
        code: 0,
        codeMsg: "malformed req l316",
      });
      return;
    }
    messages.forEach(async (message) => {
      const timeStamp = Date.now();
      const mes_uid =
        socket.user._id + timeStamp + Math.floor(Math.random() * 1000);
      socket.emit("messagesToServerS", {
        code: 1,
        codeMsg: "get s_uid",
        temp_uid: message.temp_uid,
        s_uid: mes_uid,
      });

      message.timestamp = timeStamp;
      message.s_uid = mes_uid;
      message.sendPending = 0;
      message.sender = socket.user.uemail;

      THE_MESS.set(mes_uid, message);
      async function saveToMongo(mes_uid) {
        if (!THE_MESS.has(mes_uid)) return;
        try {
          const newMessage = {
            s_uid: message.s_uid,
            message: message,
          };
          await Message.create(newMessage);
          MONGO_SAVED_MESS.add(message.s_uid);
          console.log("mess saved to MONGO");
        } catch (err) {
          console.error("Error saving mes to Mongo::", err.message);
        }
      }
      setTimeout(() => saveToMongo(mes_uid), 10000);

      const members = chatIdMap.get(message.chatId);

      if (!MESS_TRACKER.has(message.s_uid)) {
        MESS_TRACKER.set(message.s_uid, new Set());
      }
      members.forEach((member) => {
        if (member != socket.user.uemail) {
          if (!SORTED_MESS.has(member)) {
            SORTED_MESS.set(member, new Map());
          }

          SORTED_MESS.get(member).set(
            THE_MESS.get(mes_uid).s_uid,
            THE_MESS.get(mes_uid)
          );

          MESS_TRACKER.get(message.s_uid).add(member);
        }
      });
    });
    // socket.emit('messagesToServer',{code:1, codeMsg: 'messages accepted'});
    pushMessagesToClient();
    return;
  });

  // reliability release stuff
  socket.on("confirmMessagesToClient", (s_uids) => {
    const { uemail } = socket.user;
    console.info(`CMTC:: received ${s_uids}`);
    s_uids.forEach(async (s_uid) => {
      SORTED_MESS?.get(uemail)?.delete(s_uid);
      MESS_TRACKER?.get(s_uid)?.delete(uemail);
      if (MESS_TRACKER?.get(s_uid)?.size == 0) {
        THE_MESS?.delete(s_uid);
        MESS_TRACKER?.delete(s_uid); // missed earier, fixed <3
        try {
          if (MONGO_SAVED_MESS.has(s_uid)) {
            await Message.findOneAndDelete({ s_uid: s_uid });
            MONGO_SAVED_MESS.delete(s_uid);
            console.log("mess deleted from MONGO");
          }
        } catch (err) {
          console.log("failed to delete from mongo");
        }
      }
    });
    if (SORTED_MESS?.get(uemail)?.size === 0) {
      SORTED_MESS?.delete(uemail);
    }
  });

  socket.on("disconnect", () => {
    userSocketMap.delete(socket.user.uemail);
    console.log(`SOCK: ${socket.user.uemail} disconnected`);
  });
});

function pushMessagesToClient() {
  userSocketMap.forEach((socketId, uemail) => {
    try {
      if (SORTED_MESS.has(uemail)) {
        const messages = [...SORTED_MESS.get(uemail)].map((mes) => {
          return mes[1];
        });
        io.to(socketId).emit("messagesToClient", messages);
        // console.info('messages sent to ',uemail,'see', messages)
      }
    } catch (err) {
      console.log("error on sending:", err);
    }
  });
}

server.listen(PORT, () => {
  console.log("sock server running");
});

app.get("/chat-room", authMiddleWare, (req, res) => {
  const nickname = uemailMap.get(req.user.uemail) || req.user.uemail;
  res.status(200).json({ code: 1, msg: `Hello ${nickname}!` });
});

app.get("/updateToken", authMiddleWare, async (req, res) => {
  if(!req.user.uemailVerified && nicknameMap.has(req.user._id)) {
    req.body={loginEmail: req.user.uemail};
    await handleLogin(req,res, true);
  }
})

app.get("/auth/logout", authMiddleWare, (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ code: 1, codeMsg: "logged out" });
});

app.get("/auth/verifyEmail", async (req, res) => {
  try {
    const userEmail = uemailVerificationTokensMap.get(req.query.token);
    if(!userEmail) throw new Error();
    const updatedUser = await User.findOneAndUpdate(
      { uemail: userEmail },
      { $set: { uemailVerified: true } },
      { new: true }
    );
    if (updatedUser) {
      nicknameMap.set(updatedUser._id, updatedUser.nickname)
      res.send(
        `<div align="center">
          <h2>Email has been verified.</h2> 

          </a>
          </div>`
      );
    }
  } catch (e) {
    res.send("Link probably expired");
  }
});

// keeping for later
// app.use((err, req, res, next)=> {
//   console.error(err.stack);
//   res.status(500).json({code:0, codeMsg: 'server error'})
// })

app.listen(PORT, () => {
  console.log(`server running at ${host}`);
});
