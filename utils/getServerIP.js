import os from 'os'

function getServerIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if(net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1"
}

console.log(getServerIP())
export {getServerIP}