// const sendEmail = require("../utils/sendEmail");
// const User = require("../models/User");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");

// exports.register = async (req, res) => {
//   const { name, email, password, role } = req.body;

//   const exists = await User.findOne({ email });
//   if (exists) return res.status(400).json({ message: "User exists" });

//   const hashed = await bcrypt.hash(password, 10);

//   await User.create({ name, email, password: hashed, role });

//   res.json({ message: "Registered successfully" });
// };

// exports.login = async (req, res) => {
//   const { email, password } = req.body;

//   const user = await User.findOne({ email });
//   if (!user) return res.status(400).json({ message: "Invalid credentials" });

//   const match = await bcrypt.compare(password, user.password);
//   if (!match) return res.status(400).json({ message: "Invalid credentials" });

//   const token = jwt.sign(
//     { id: user._id, role: user.role },
//     process.env.JWT_SECRET,
//     { expiresIn: "1d" }
//   );

//   res.json({
//     token,
//     user: {
//       id: user._id,
//       role: user.role,
//       name: user.name,
//     },
//   });
// };
// exports.sendResetOTP = async (req, res) => {
//   try {
//     const { email } = req.body;

//     const user = await User.findOne({ email });
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const otp = Math.floor(100000 + Math.random() * 900000).toString();

//     user.otp = otp;
//     user.otpExpire = Date.now() + 5 * 60 * 1000; // 5 minutes

//     await user.save();

//     await sendEmail(
//       email,
//       "Password Reset OTP - MarketPulse",
//       `Your OTP for password reset is: ${otp}. It expires in 10 minutes.`
//     );

//     res.json({ message: "OTP sent to email successfully" });

//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };
// exports.verifyOTPAndReset = async (req, res) => {
//   try {
//     const { email, otp, newPassword } = req.body;

//     const user = await User.findOne({
//       email,
//       otp,
//       otpExpire: { $gt: Date.now() },
//     });

//     if (!user) {
//       return res.status(400).json({ message: "Invalid or expired OTP" });
//     }

//     const hashedPassword = await bcrypt.hash(newPassword, 10);

//     user.password = hashedPassword;
//     user.otp = undefined;
//     user.otpExpire = undefined;

//     await user.save();

//     res.json({ message: "Password reset successful" });

//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

const sendEmail = require("../utils/sendEmail");
const sendSMS = require("../utils/sendSMS"); // optional if using SMS API
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTER
exports.register = async (req, res) => {
  try {
    const { name, email, mobile, password, role, state, district } = req.body;

    if (!name || !password || (!email && !mobile)) {
      return res.status(400).json({ message: "Name, password, and at least an email or mobile number are required" });
    }

    const cleanEmail = email && email.trim() ? email.trim() : undefined;
    const cleanMobile = mobile && mobile.trim() ? mobile.trim() : undefined;

    const queryConditions = [];
    if (cleanEmail) queryConditions.push({ email: cleanEmail });
    if (cleanMobile) queryConditions.push({ mobile: cleanMobile });

    const exists = await User.findOne({ $or: queryConditions });
    if (exists) return res.status(400).json({ message: "A user with this email or mobile already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const userRole = role ? role.toLowerCase() : "customer";

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      mobile: cleanMobile,
      password: hashed,
      role: userRole,
      state: state || "",
      district: district || ""
    });

    res.json({ message: "Registered successfully", userId: user._id });
  } catch (error) {
    console.error("[AUTH] Register error:", error);
    res.status(500).json({ error: error.message });
  }
};

// LOGIN (EMAIL OR MOBILE)
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: "Please provide email/mobile and password" });
    }

    const cleanIdentifier = identifier.trim();

    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier },
        { mobile: cleanIdentifier }
      ]
    });

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "defaultsecret",
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        role: user.role || "customer",
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        state: user.state,
        district: user.district,
      },
    });
  } catch (error) {
    console.error("[AUTH] Login error:", error);
    res.status(500).json({ error: error.message });
  }
};

// SEND RESET OTP (EMAIL OR MOBILE)
exports.sendResetOTP = async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ message: "Email or mobile number is required" });
    }

    const cleanIdentifier = identifier.trim();

    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier },
        { mobile: cleanIdentifier }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: "User not found with this email or mobile" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;
    user.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    console.log(`🔑 [AUTH OTP] Generated OTP for user ${user.name} (${cleanIdentifier}): ${otp}`);

    if (user.email) {
      try {
        await sendEmail(
          user.email,
          "Password Reset OTP - MarketPulse",
          `Your OTP for password reset is: ${otp}. It expires in 10 minutes.`
        );
      } catch (emailErr) {
        console.error("[AUTH] Email sending error:", emailErr.message);
      }
    }

    res.json({ message: "OTP sent successfully", devOtp: otp });
  } catch (error) {
    console.error("[AUTH] sendResetOTP error:", error);
    res.status(500).json({ error: error.message });
  }
};

// VERIFY OTP AND RESET PASSWORD
exports.verifyOTPAndReset = async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;
    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields (identifier, OTP, new password) are required" });
    }

    const cleanIdentifier = identifier.trim();
    const cleanOtp = otp.trim();

    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier },
        { mobile: cleanIdentifier }
      ],
      otp: cleanOtp,
      otpExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpire = undefined;

    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("[AUTH] verifyOTPAndReset error:", error);
    res.status(500).json({ error: error.message });
  }
};