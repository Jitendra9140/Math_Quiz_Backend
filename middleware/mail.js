const nodemailer = require("nodemailer");

// Create transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "developer.clumpcoder@gmail.com",
    pass: process.env.EMAIL_PASS || "xnuz wias bwnt psrw",
  },
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("Email transporter verification failed:", error);
  } else {
    console.log("Email server is ready to send messages");
  }
});

/**
 * Send email utility function
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content (optional)
 * @returns {Promise}
 */
const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: `Clumpcoder <${
        process.env.EMAIL_USER || "developer.clumpcoder@gmail.com"
      }>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(info)

    console.log("Email sent successfully:", options.to);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

/**
 * Send OTP email
 */
const sendOTPEmail = async (email, otp, type = "verification") => {
  const subjects = {
    verification: "Email Verification OTP - Clumpcoder",
    password: "Password Reset OTP - Clumpcoder",
    signup: "Complete Your Registration - Clumpcoder",
  };

  const messages = {
    verification: "verify your email",
    password: "reset your password",
    signup: "complete your registration",
  };

  await sendEmail({
    to: email,
    subject: subjects[type],
    text: `Your OTP code is ${otp}. It is valid for 5 minutes.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #4CAF50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: white;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .otp-box {
            background-color: #f0f0f0;
            border: 2px dashed #4CAF50;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
            border-radius: 5px;
          }
          .otp-code {
            font-size: 32px;
            font-weight: bold;
            color: #4CAF50;
            letter-spacing: 5px;
          }
          .warning {
            color: #ff5722;
            font-size: 14px;
            margin-top: 20px;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Clumpcoder</h1>
          </div>
          <div class="content">
            <h2>OTP Verification</h2>
            <p>Hello,</p>
            <p>You requested an OTP to ${
              messages[type]
            }. Please use the code below:</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            
            <p><strong>Important:</strong></p>
            <ul>
              <li>This OTP is valid for <strong>5 minutes</strong></li>
              <li>You have <strong>3 attempts</strong> to enter the correct OTP</li>
              <li>After 3 failed attempts, you'll need to wait 1 hour</li>
            </ul>
            
            <p class="warning">⚠️ If you didn't request this OTP, please ignore this email and secure your account.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Clumpcoder. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
};

/**
 * Send welcome email after successful registration
 */
const sendWelcomeEmail = async (email, username) => {
  await sendEmail({
    to: email,
    subject: "Welcome to Clumpcoder! 🎮",
    text: `Welcome ${username}! Thank you for joining Clumpcoder.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .content {
            background-color: white;
            padding: 30px;
            border: 1px solid #e0e0e0;
            border-top: none;
            border-radius: 0 0 10px 10px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Clumpcoder!</h1>
          </div>
          <div class="content">
            <h2>Hello ${username}! 👋</h2>
            <p>Congratulations on successfully creating your account!</p>
            <p>We're excited to have you join our gaming community. Your account is now active and ready to use.</p>
            
            <h3>What's Next?</h3>
            <ul>
              <li>Complete your profile</li>
              <li>Connect with other players</li>
              <li>Start your gaming journey</li>
            </ul>
            
            <div style="text-align: center;">
              <a href="#" class="button">Get Started</a>
            </div>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
            
            <p>Happy gaming! 🎮</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Clumpcoder. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  transporter,
};
