import * as nodemailer from "nodemailer";
import { systemLogger, errorLogger } from "./logger";
import { config } from "./config";

const user: string = config.mail.user;
const pass: string = config.mail.pass;
const to: string = config.mail.to;

const transporter = nodemailer.createTransport({
  service: "gmail",
  port: 465,
  secure: true,
  auth: {
    user,
    pass,
  },
});

export const sendGmail = async (subject: string, text: string): Promise<void> => {
  if (!config.mail.sendEmailEnabled) {
    systemLogger.info("Email sending is disabled in config");
    return;
  }
  
  try {
    const info = await transporter.sendMail({
      from: user,
      to,
      subject,
      text,
    });
    systemLogger.info(`Email sent: ${info.response}`);
  } catch (error) {
    errorLogger.error("Failed to send email:", error);
  }
};