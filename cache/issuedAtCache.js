
const issuedAtMap = new Map();
import { User } from '../models/User.js'

async function loadIssuedAtMap() {
  const users = await User.find({},'_id issuedAt').lean();
  users.forEach(user => {
    issuedAtMap.set(user._id.toString(), user.issuedAt);
  });
  console.log('issuedAtMap loaded', issuedAtMap.size, 'users')
}

loadIssuedAtMap().catch(err => console.error('error loading issuedAtMap:', err));

export { issuedAtMap, loadIssuedAtMap }
