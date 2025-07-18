
const nicknameMap = new Map();
const uemailMap = new Map();
import { User } from '../models/User.js'

async function loadNicknameMap() {
  const nicknames = await User.find({},'_id uemail nickname').lean();

  nicknames.forEach(nickname => {
    nicknameMap.set(nickname._id.toString(), nickname.nickname);
    uemailMap.set(nickname.uemail, nickname.nickname);
  });
  console.log('nicknameMap, uemailMap  loaded',nicknameMap.size, ' users');
  
}

loadNicknameMap().catch(err => console.error('Error loading nicknameMap/uemailMap', err));


export { nicknameMap, uemailMap, loadNicknameMap }
