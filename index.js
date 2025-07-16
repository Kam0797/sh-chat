import express from 'express';
// const bodyParser = imp('body-parser');
import 'dotenv/config';
import mongoose from 'mongoose';
// dotenv.config();
import validator from 'validator'
import bcrypt from 'bcrypt'



const app = express();

// mongoose part
const userSchema = mongoose.Schema({
  _id: {
    type: 'String',
    required: true
  },
  nickname: {
    type: 'String',
  },
  password: {
    type: 'String',
    required: true
  },
  uemailVerified: {
    type: 'Boolean'

  },
  dbSaveEnabled: {
    type: 'Boolean'
  }
});

async function addUser(userData) {
  if (validator.isEmail(userData.uemail) && userData.pw1 === userData.pw2){

    const pwHash = await bcrypt.hash(userData.pw1,12);
    // userData.name = 'nick';
    const passedUserData = {
      _id: userData.uemail,
      nickname: userData.name,
      password: pwHash,
      uemailVerified: false,
      dbSaveEnabled: false
    }
    try {
    const newUser = await User.create(passedUserData);
    return newUser;
    }
    catch(err) {
      if(err.code == 11000) {
        console.log('existing user', err.keyValue);
        return {code: 'ougl'}
      }
      else {
      console.log('db error', err);
      return null;
      }
    }
  }
  else {
    return null;
  }
}

const User = mongoose.model('User', userSchema);

mongoose.connect(process.env.MONGO_SH_CHAT_URI)
  .then(console.log('connected to mongoDB'))
  .catch(err => console.error('mongoDB connect failed',err));

app.get('/', (req,res)=> {
  res.send('<h1>Hello sh-chat!</h1>')
});

app.use(express.urlencoded({extended:false}));
app.use(express.json());

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
    res.json({
      code: 'success -signed by server'
    });
    }
    else if(result.code == 'ougl') res.json({code: 'go yo login'})
  }
  catch (err) {
    console.log(err);
    // if(err.code == 110000) res.json({code: 'Existing user, go to Login'});
    res.json({code: 'failed -signed by server'});
  }
});

app.post('/auth/login', async(req, res)=> {
  console.log(req.body.loginEmail,"##",req.body.loginPw);
  try{
  const user = await User.findOne({_id: req.body.loginEmail});
    if(!user){
      console.log('user not found',req.body.loginEmail);
      return res.json({code: 'auth failed - unregistered user'})
    }
    // console.log('#@#@#@#@',storedHash);
  const passwordMatched = await bcrypt.compare(req.body.loginPw,user.password);
  if (passwordMatched) {
    console.log(req.body.loginEmail,' logged in @',new Date().toISOString());
    res.json({code: 'auth success'})
  }
  else {
    console.log('auth failed:',req.body.loginEmail);
    res.json({code: 'auth failed, check email and password'})
  }
  }catch(err) {
    console.log('login error',err);
    return res.json({code: "auth failed - server's pain"})
  }
})


app.listen(3000, ()=> {
  console.log('server running at http://127.0.0.1:3000');
})
