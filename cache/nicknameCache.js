
const nicknameMap = new Map();
const uemailMap = new Map();

const chatIdMap = new Map();
import { User, ChatId } from '../models/User.js'

async function loadNicknameMap() {
  const nicknames = await User.find({},'_id uemail nickname').lean();

  nicknames.forEach(nickname => {
    nicknameMap.set(nickname._id.toString(), nickname.nickname);
    uemailMap.set(nickname.uemail, nickname.nickname);
  });
  console.log('nicknameMap, uemailMap  loaded',nicknameMap.size, ' users');
  
}

loadNicknameMap().catch(err => console.error('Error loading nicknameMap/uemailMap', err));

async function loadChatIdMap() {
  const chatIds = await ChatId.find({}, 'chatId members').lean();

  chatIds.forEach(chatId => {
    chatIdMap.set(chatId.chatId,chatId.members);
  });
  console.log('chats on cache:', chatIdMap.size)
}

export { nicknameMap, uemailMap, chatIdMap, loadNicknameMap, loadChatIdMap }
