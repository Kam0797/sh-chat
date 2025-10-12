import { randomBytes } from "crypto";
import { getServerIP } from "./getServerIP.js";
import { sendGmail } from "./mailsender.js";
import { uemailVerificationTokensMap } from "./constVars.js";

const host = 'http://'+getServerIP()+':3000';



function generateEmailVerifToken(length=64) {
  return randomBytes(length)
    .toString('base64url')
    .slice(0,64)
}

function sendEmailVerification(uemail, uemailVerificationTokensMap, host, isVerification=true) {
  // generate rand token

  const token = generateEmailVerifToken()

  // set token
  uemailVerificationTokensMap.set(token, uemail)
  console.log('map:',uemailVerificationTokensMap) //debug

  const messageContents = [
    `<h2>Welcome to sh_chat!</h2>
        <p>Click the button to verify your email and create account</p>
        <a href=${host}/auth/verifyEmail?token=${token}><button>Verify Email</button></a>`,
      
    `<h2>Your password reset link </h2>
        <p>Click the button to set new password</p>
        <a href=${host}/auth/passwordReset?token=${token}><button>Reset Password</button></a>`
  ];

  const to = uemail;
  const subject = isVerification? "Verify you email" : "Reset your password";
  const message = isVerification? messageContents[0] : messageContents[1];

  sendGmail(uemail, subject, message )
    .then(() => console.info(`Gmail sent to ${to}`))
    .catch(err => console.error("Error while sending gmail", err))
}

// sendEmailVerification("gv.kamal2003@gmail.com", uemailVerificationTokensMap, host, true)
export {sendEmailVerification}