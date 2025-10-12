import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser';


import { uemailMap } from "../cache/nicknameCache.js";
import { User } from "../models/User.js";
import { host, isProduction, uemailVerificationTokensMap } from "../utils/constVars.js"; 
import { sendEmailVerification } from "../utils/verifyEmail.js";

async function handleLogin(req, res, bypassPassword=false) {
  try{
  const user = await User.findOne({uemail: req.body.loginEmail});
    if(!user){
      console.log('user not found',req.body.loginEmail);
      return res.json({code:0, codeMsg: 'auth failed - unregistered user'})
    }
  let passwordMatched = false;
  if(!bypassPassword) {
    passwordMatched = await bcrypt.compare(req.body.loginPw,user.password);
  }
  if (passwordMatched || bypassPassword) {
    console.log(req.body.loginEmail,' logged in @',new Date().toDateString());
    //
    const token = jwt.sign({
      _id: user._id.toString(),
      uemail: user.uemail,
      dbSaveEnabled: user.dbSaveEnabled,
      issuedAt: user.issuedAt,
      uemailVerified: user.uemailVerified,
    }, process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.JWT_EXPIRY });

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction? 'None': 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      partitioned: isProduction
    });
    // console.log(req.cookies);
    if(!user.uemailVerified) { // marking this
      if(!uemailVerificationTokensMap.has(user.uemail)) {
        sendEmailVerification(user.uemail, uemailVerificationTokensMap, host, true )
        return res.json({code:0, codeMsg: 'unverified uemail'})
      }
      // return res.json({code:0, codeMsg: 'unverified uemail'})
    }
    else {
      res.json({code:1, codeMsg: 'auth success', uemail: user.uemail, uid: user._id.toString()})
    }

  }
  else {
    console.log('auth failed:',req.body.loginEmail);
    res.json({code:0, codeMsg: 'auth failed, check email and password'})
  }
  }catch(err) {
    console.log('login error',err);
    return res.json({code:0, codeMsg: "auth failed - server's pain"})
  }
}

export {handleLogin}