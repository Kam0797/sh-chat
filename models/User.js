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

const chatIdSchema = mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true
  },
  chatName: {
    type: String
  },
  members: {
    type: Array,
    required: true
  },
  admin: {
    type: String,
    required: true
  },
  mods: {
    type: Array
  }
});

const ChatId = mongoose.model('ChatId', chatIdSchema);
export { ChatId };
