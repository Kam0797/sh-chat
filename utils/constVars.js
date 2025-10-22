
import "dotenv/config" 
import { getServerIP } from "./getServerIP.js";

const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';
const isProduction = process.env.NODE_ENV == 'production';

const host = ENV === 'production'
  ? 'https://sh-chat.onrender.com'
  : `http://${getServerIP()}:${PORT}`;

const allowedOrigins = ['http://localhost:5173','https://kam0797.github.io', 'http://localhost:4173', 'http://192.168.165.94:5173'] //:5173 used for vite dev :4173 for vite preview :for LAN





const uemailVerificationTokensMap = new Map()


export {PORT, isProduction, host, allowedOrigins, uemailVerificationTokensMap}
