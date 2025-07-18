import mongoose from 'mongoose';

const userSchema = mongoose.Schema({
  uemail: {
    type: String,
    required: true,
    unique: true
  },
  nickname: {
    type: String,
  },
  password: {
    type: String,
    required: true
  },
  uemailVerified: {
    type: Boolean,
    default: false
  },
  dbSaveEnabled: {
    type: Boolean,
    default: false
  },
  issuedAt: {
    type: Number,
    required: true,
    default: ()=> Math.floor(Date.now()/1000)
  }
});
const User = mongoose.model('User', userSchema);
export {User};
