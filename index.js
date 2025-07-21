import express from 'express';
// const bodyParser = imp('body-parser');
import 'dotenv/config';
import mongoose from 'mongoose';
// dotenv.config();
import validator from 'validator'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'
import cors from 'cors'



import { ChatId, User, chatId } from './models/User.js'
import { issuedAtMap, loadIssuedAtMap } from './cache/issuedAtCache.js';
import { nicknameMap, uemailMap, chatIdMap, loadNicknameMap, loadChatIdMap } from './cache/nicknameCache.js';

const app = express();

// mongoose part

async function addUser(userData) {
  if (validator.isEmail(userData.uemail) && userData.pw1 === userData.pw2){
    // checking for existing user
    if(uemailMap.get(userData.uemail)) return { code: 'ougl'};
    
    const pwHash = await bcrypt.hash(userData.pw1,12);
    // userData.name = 'nick';
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
      // if(err.code == 11000) { //handled by cache
      //   console.log('existing user', err.keyValue);
      //   return {code: 'ougl'}
      // }
      // else {
      console.log('db error', err);
      return null;
      // }
    }
  }
  else {
    return null;
  }
}

function authMiddleWare(req,res,next) {
  const token = req.cookies.token;

  if (!token) return res.status(401).json({code:0, codeMsg: 'not signed in'});

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, userData) => {
    const issuedAt = issuedAtMap.get(userData._id);
    if(err) return res.status(403).json({ code:0, codeMsg: 'Unauthorised -invalid token'});
    else if(!issuedAt || issuedAt !== userData.issuedAt) return res.status(403).json({ code:0, codeMsg: 'unauthorised - invalid token'})

    req.user = userData;
    console.log('CC:',req.user);
    // console.log('fg:',userData, req.user);
    // res.json({code: 'ok'})
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
    console.log('caches loaded');
  }
  catch (err) {
    console.error('mongoDB connect failed',err)
  }
})();

// console.log('map sizes:',issuedAtMap.size, nicknameMap.size);
app.get('/', (req,res)=> {
  res.send('<h1>Hello sh-chat!</h1>') // exception to code-codeMsg convention
});

const allowedOrigins = ['http://127.0.0.1:5500','https://Kam0797.github.io']

app.use(express.urlencoded({extended:false}));
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


app.post('/auth/signup', async (req,res)=> {
  console.log("request received");
  const userData = {
    uemail: req.body.uemail,
    pw1: req.body.pw1,
    pw2: req.body.pw2,
    name: ""
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
    else if(result.code == 'ougl') res.json({code: 'Existing user, go to login'})
  }
  catch (err) {
    console.log(err);
    // if(err.code == 110000) res.json({code: 'Existing user, go to Login'});
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

    //samaSite seems to be changed
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
  if(Array.isArray(req.body.members)) return res.json({code:0, codeMsg: 'invalid request'});
  const chatId = req.user._id+Date.now().toString();
  const hasUnknown = req.members.some(member=> !uemailMap.has(member))

  if (hasUnknown) {
    return res.json({code: 0, codeMsg: 'unknown memeber in list' })
  } 
  // bug, check and include creators name in members -
  const newChatId = {
    chatId: chatId,
    chatName: '',
    members: req.body.members,
    admin: req.user.uemail,
    mods: []
  }
  try {
    await ChatId.create(newChatId);
    loadChatIdMap();
    res.json({code:1, codeMsg: 'chat created', members: req.body.members})
  }
  catch (err) {
    console.log('error::chatId/new::', err);
    res.json({ code:0, codeMsg: 'failed, server error'})
  }
})


app.get('/chat-room', authMiddleWare, (req,res) => {
  const nickname = nicknameMap.get(req.user._id) || req.user.uemail;
  res.status(200).json({code: 1, msg :`Hello ${nickname}!`})
});

app.get('/auth/logout', authMiddleWare, (req, res)=> {
  res.clearCookie('token');
  res.status(200).json({code:1, codeMsg: 'logged out'});
})

app.listen(3000, ()=> {
  console.log('server running at http://127.0.0.1:3000');
})
