const nodemailer = require("nodemailer");
const logger = require("./logger"); // your custom logger

const sendEmail = async (to, subject, text) => {
  try {
    // Create transporter
    const transportConfig = {
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    };

    if (process.env.EMAIL_SERVICE === "gmail") {
      // Use the hardcoded IP address from nslookup to bypass the Node.js DNS 'queryA ETIMEOUT' issue
      transportConfig.host = "142.251.127.108"; 
      transportConfig.port = 465;
      transportConfig.secure = true;
      transportConfig.tls = {
        servername: "smtp.gmail.com" // Important: validates the SSL certificate correctly against the IP
      };
    } else {
      transportConfig.host = process.env.EMAIL_HOST || "smtp.gmail.com";
      transportConfig.port = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 465;
      transportConfig.secure = process.env.EMAIL_SECURE === "true" || true;
    }

    const transporter = nodemailer.createTransport(transportConfig);

    // Define mail options
    const mailOptions = {
      from: `"${process.env.APP_NAME || "Mining Inspection Management System"}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Log success
    logger.info(`Email sent to ${to} | Subject: ${subject}`);
  } catch (error) {
    // Log error
    logger.error(`Failed to send email to ${to} | Subject: ${subject} | Error: ${error.message}`);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = { sendEmail };
