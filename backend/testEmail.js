require("dotenv").config();
const { sendEmail } = require("./utils/sendEmail");

(async () => {
  try {
    console.log("Testing email configuration...");

    await sendEmail(
      process.env.EMAIL_USER,
      "Email",
      "This email is from MoM Mining Inspection Management System."
    );

    console.log("Email sent successfully!");
  } catch (error) {
    console.error("Email test failed:", error.message);
  }
})();
