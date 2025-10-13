
let nicknameMap = new Map();  // {_id,nickname}  //used to track email verif
let uemailMap = new Map();   // {uemail, nickname}

let chatIdMap = new Map();  // {chatId, [members]}
import { User, ChatId } from '../models/User.js'

async function loadNicknameMap() {
  const newNicknameMap = new Map();
  const newUemailMap = new Map();
  const nicknames = await User.find({},'_id uemail nickname uemailVerified').lean();

  nicknames.forEach(nickname => {
    if(nickname.uemailVerified) {
    newNicknameMap.set(nickname._id.toString(), nickname.nickname);
    }
    newUemailMap.set(nickname.uemail, nickname.nickname);
  });
  nicknameMap = newNicknameMap;
  uemailMap = newUemailMap;

  console.log('nicknameMap, uemailMap  loaded',nicknameMap.size, ' users');
  
}

loadNicknameMap().catch(err => console.error('Error loading nicknameMap/uemailMap', err));

async function loadChatIdMap() {
  const newMap = new Map();

  const chatIds = await ChatId.find({}, 'chatId members').lean();

  chatIds.forEach(chatId => {
    newMap.set(chatId.chatId,chatId.members);
  });
  chatIdMap = newMap;
  console.log('chatids on cache:', chatIdMap.size)
}

export { nicknameMap, uemailMap, chatIdMap, loadNicknameMap, loadChatIdMap }
