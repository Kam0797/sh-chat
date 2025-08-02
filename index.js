import express from 'express';
import {createServer}  from 'http'
// const bodyParser = imp('body-parser');  // replaced by express.urlencoded *1
import 'dotenv/config';
import mongoose from 'mongoose';
import validator from 'validator'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { Server } from 'socket.io'



import { ChatId, User } from './models/User.js'
import { issuedAtMap, loadIssuedAtMap } from './cache/issuedAtCache.js';
import { nicknameMap, uemailMap, chatIdMap, loadNicknameMap, loadChatIdMap } from './cache/nicknameCache.js';

const app = express();

let THE_MESS = new Map();
let SORTED_MESS = new Map();
let MESS_TRACKER = new Map();

const allowedOrigins = ['http://127.0.0.1:5500','https://Kam0797.github.io']

app.use(express.urlencoded({extended:false}));  // *1
app.use(cors({
  origin: function(origin, callback) {
    if(!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    }
    else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());


// mongoose part

async function addUser(userData) {
  if (validator.isEmail(userData.uemail) && userData.pw1 === userData.pw2){
    // checking for existing user
    if(uemailMap.get(userData.uemail)) return { code: 'ougl'};
    
    const pwHash = await bcrypt.hash(userData.pw1,12);
    const passedUserData = {
      uemail: userData.uemail,
      nickname: userData.name,
      password: pwHash,
      uemailVerified: false,
      dbSaveEnabled: false,
    }
    try {
    const newUser = await User.create(passedUserData);
    return newUser;
    }
    catch(err) {
      console.log('db error', err);
      return null;
    }
  }
  else {
    return null;
  }
}

function authMiddleWare(req,res,next) {
  const token = req.cookies.token;

  if (!token) {console.log('no tok',req.cookies); return res.status(401).json({code:0, codeMsg: 'not signed in'})};

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, userData) => {
    const issuedAt = issuedAtMap.get(userData._id);
    if(err) return res.status(403).json({ code:0, codeMsg: 'Unauthorised -invalid token'});
    else if(!issuedAt || issuedAt !== userData.issuedAt) return res.status(403).json({ code:0, codeMsg: 'unauthorised - invalid token'})

    req.user = userData;
    next();
  });
}

// IIFE Immediately Invoked Functional Expression 
// (async () {
//  [async code , for example next 2 lines] 
//    try{await some}
//    catch (err) {someother}
// })();
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_SH_CHAT_URI);
    console.log('connected to mongodb');
    await loadIssuedAtMap();
    await loadNicknameMap();
    await loadChatIdMap();
    console.log('caches loaded');
  }
  catch (err) {
    console.error('mongoDB connect failed',err)
  }
})();

app.use((req, res, next)=> {
  console.log('route',req.method,req.originalUrl);
  next();
})

// app.get('/', (req,res)=> {
//   res.send('<h1>Hello sh-chat!</h1>') // exception to code-codeMsg convention
// });


app.post('/auth/signup', async (req,res)=> {
  console.log("request received");
  const userData = {
    uemail: req.body.uemail,
    pw1: req.body.pw1,
    pw2: req.body.pw2,
    name: req.body.uemail.split('@')[0]
  }
  try {
    const result = await addUser(userData);
    if(result && result.code != 'ougl') {
  console.log("new user added: ",req.body.uemail," :: ", userData.name);
    loadIssuedAtMap(); loadNicknameMap(); 
      res.json({
      code:1, 
      codeMsg: 'Signup success, go to login'
    });
    }
    else if(result.code == 'ougl') res.json({code:0, codeMsg: 'Existing user, go to login'})
  }
  catch (err) {
    console.log(err);
    res.json({code:0, codeMsg: 'signup failed -maybe retry'});
  }
});

app.post('/auth/login', async(req, res)=> {

  try{
  const user = await User.findOne({uemail: req.body.loginEmail});
    if(!user){
      console.log('user not found',req.body.loginEmail);
      return res.json({code:0, codeMsg: 'auth failed - unregistered user'})
    }

  const passwordMatched = await bcrypt.compare(req.body.loginPw,user.password);
  if (passwordMatched) {
    console.log(req.body.loginEmail,' logged in @',new Date().toDateString());
    //
    const token = jwt.sign({
      _id: user._id.toString(),
      uemail: user.uemail,
      dbSaveEnabled: user.dbSaveEnabled,
      issuedAt: user.issuedAt
    }, process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.JWT_EXPIRY });

    //sameSite seems to be changed
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    console.log(req.cookies);
    res.json({code:1, codeMsg: 'auth success'})

  }
  else {
    console.log('auth failed:',req.body.loginEmail);
    res.json({code:0, codeMsg: 'auth failed, check email and password'})
  }
  }catch(err) {
    console.log('login error',err);
    return res.json({code:0, codeMsg: "auth failed - server's pain"})
  }
})



  app.get('/auth/status', (req,res)=> {
    const token = req.cookies.token;
    if(!token) return res.json({code:0, codeMsg: 'unauthenticated'});
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET_KEY);
      res.json({code:1, codeMsg: `your'e in ${user.uemail}`})
    }
    catch {
      res.json({code:0, codeMsg: 'invalid/expired token'})
    }
  })

app.post('/profile/nickname', authMiddleWare, async (req, res)=> {
  try {
    const nick = await User.updateOne({_id: req.user._id},{ $set: {nickname: req.body.nickname}}); // 'const nick = ' be taken out?
    loadNicknameMap();
    res.json({code:1, codeMsg: `nickname changed to ${req.body.nickname}`})
  }catch (err) {
    console.log('nickname update error:', err);
    res.json({code:0, codeMsg: 'nickname update failed'})
  }
})

app.post('/chat/new', authMiddleWare, async(req,res)=> {
  console.log('ch create func');
  if(!Array.isArray(req.body.members)) return res.json({code:0, codeMsg: 'invalid request'});
  const chatId = req.user._id+Date.now().toString(); //toString needed?
  const hasUnknown = req.body.members.some(member=> !uemailMap.has(member))

  if (hasUnknown) {
    return res.json({code: 0, codeMsg: 'unknown memeber in list' })
  } 

  const members = Array.from(new Set([...req.body.members, req.user.uemail]))
  // bug, check and include creators name in members -const members = Array.from(new Set([...req.body.members, req.user.uemail]));  
  // the above thing is fixed
  const newChatId = {
    chatId: chatId,
    chatName: '',
    members: members, // make this into map
    admin: req.user.uemail,
    mods: []
  }
  try {
    await ChatId.create(newChatId);
    loadChatIdMap();
    res.json({code:1, codeMsg: 'chat created',chatId: chatId, members: members})
  }
  catch (err) {
    console.log('error::chatId/new::', err);
    res.json({ code:0, codeMsg: 'failed, server error'})
  }
})

app.get('/chats', authMiddleWare, async (req, res)=> {
  const chats = await ChatId.find({members: {$in: [req.user.uemail]}});
  return res.json({chats: Array.from(chats)})
})

// socket replacing POST /messages
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
    if(!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    }
    else {
      callback(new Error('Not allowed by CORS'));
    }
  },
    credentials: true
  }
})

const userSocketMap = new Map();

io.on('connection', (socket)=> {
  // auth area. move this to middleware later
  const tokenHeader = socket.handshake.headers.cookie || '';
  const token = tokenHeader.match(/(?:^;|\s*)token=([^;]*)/)?.[1];
  if(!token) {
    console.log(socket.id, ' : no token');
    socket.disconnect(true);
  }
  try {
  const userData = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const validIssuedAt = issuedAtMap.get(userData._id);
  if(!validIssuedAt || userData.issuedAt !== validIssuedAt) {
    console.log(socket.id, ' : Invalid token -IA');
    socket.disconnect(true);
  }
  socket.user = userData;
  userSocketMap.set(socket.user.uemail,socket.id);
  pushMessagesToClient();
  console.log(`SOCK: ${socket.user.uemail} connected`);
  }
  catch (err) {
    console.log(socket.id, ' : Invalid token');
    socket.disconnect(true)
  } // auth end
  
  socket.on('messagesToServer', (messages) => {
    if (!Array.isArray(messages) || !messages) {
      socket.emit('messagesToServer', {code:0, codeMsg: 'Malformed req, should be array'});
      return;
    }
    console.log('socMes:', messages);
    const isMalformed = messages.some(messageObj => {
      return (!('chatId' in messageObj) ||
      !('content' in messageObj) ||
      !chatIdMap.has(messageObj.chatId) ||
        !chatIdMap.get(messageObj.chatId).includes(socket.user.uemail) ||
        messageObj.content.trim() == ''
      );
    });
    
    if (isMalformed) {
      console.log('malformed req l316');
      socket.emit('messagesToServer', {code:0, codeMsg: 'malformed req l316'});
      return;
    }
    messages.forEach(message => {
      const timeStamp = Date.now();
      const mes_uid = socket.user._id + timeStamp + Math.floor(Math.random()*1000);

      message.timestamp = timeStamp;
      message.s_uid = mes_uid;
      message.sendPending = 0;

      THE_MESS.set(mes_uid, message);

      const members = chatIdMap.get(message.chatId);
      members.forEach(member => {
        if(member != socket.user.uemail) {
          if(!SORTED_MESS.has(member)) {
            SORTED_MESS.set(member, []);
          }
          if(!MESS_TRACKER.has(message.s_uid)) {
            MESS_TRACKER.set(message.s_uid, new Set());
          }
          SORTED_MESS.get(member).push(THE_MESS.get(mes_uid));

          MESS_TRACKER.get(message.s_uid).add(member);
        }
      })
    })
    socket.emit('messagesToServer',{code:1, codeMsg: 'messages accepted'});
    pushMessagesToClient();
    return;
  })
  
  socket.on('disconnect', ()=>{
    userSocketMap.delete(socket.user.uemail);
    console.log(`${socket.user.uemail} disconnected`);
  })
  
})

function pushMessagesToClient() {
  userSocketMap.forEach((socketId,uemail)=> {
    try {
      if(SORTED_MESS.has(uemail)) {
        io.to(socketId).emit('messagesToClient',SORTED_MESS.get(uemail));
        SORTED_MESS.delete(uemail);
        console.log('sent and deleted record in SORTED_MESS for ', uemail);

        // clearing up ?
        const member = uemail;
        MESS_TRACKER.forEach((mess, key)=> {
          mess.delete(member);
          if(!mess.size) {
            THE_MESS.delete(key);
          }
        })
      }
    }
    catch(err) {
    console.log('error on sending:', err)
    }

  })
}


server.listen(3000, ()=> {
  console.log('sock server running')
})


app.get('/chat-room', authMiddleWare, (req,res) => {
  const nickname = nicknameMap.get(req.user._id) || req.user.uemail;
  res.status(200).json({code: 1, msg :`Hello ${nickname}!`})
});

app.get('/auth/logout', authMiddleWare, (req, res)=> {
  res.clearCookie('token');
  res.status(200).json({code:1, codeMsg: 'logged out'});
})



// keeping for later
// app.use((err, req, res, next)=> {
//   console.error(err.stack);
//   res.status(500).json({code:0, codeMsg: 'server error'})
// })

app.listen(3000, ()=> {
  console.log('server running at http://127.0.0.1:3000');
})
