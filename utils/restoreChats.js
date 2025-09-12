import { Message } from "../models/User.js"

const THE_MESS = new Map();
const SORTED_MESS = new Map();
const MESS_TRACKER = new Map();
const MONGO_SAVED_MESS = new Set();

async function restoreChats(chatIdMap) {
  try {

    const the_mess_arr = await Message.find({}, {_id:0,__v:0});
    if(the_mess_arr.length == 0) {
      console.log('nothing to restore')
      return 0;
    }
    the_mess_arr.forEach(mess => {
      THE_MESS.set(mess.s_uid, mess.message);
      MONGO_SAVED_MESS.add(mess.s_uid)
    });


    [...THE_MESS].map(([s_uid, message]) => {
      // console.log('e',s_uid,'f', message);
      if(!MESS_TRACKER.has(s_uid)) {
        MESS_TRACKER.set(s_uid, new Set())
      }
      chatIdMap.get(message.chatId).map(mem => {
        // console.log('g',mem)
        if(mem != message.sender) {
          if(!SORTED_MESS.has(mem)) {
            SORTED_MESS.set(mem, new Map())
          }
          SORTED_MESS.get(mem).set(s_uid, THE_MESS.get(s_uid));
          MESS_TRACKER.get(s_uid).add(mem)
        }
      })
    })


    console.log('restored from Mongo')
    return 0

    
  } catch(err) {
    console.error('data restore broke');
    return 1
  }
  
}
export { THE_MESS, SORTED_MESS, MESS_TRACKER, MONGO_SAVED_MESS, restoreChats }
