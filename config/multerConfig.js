const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "..", "uploads", "profiles");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage for local file system
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: userId-timestamp-originalname
    const userId = req.user?._id || "user";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    cb(null, `${userId}-${uniqueSuffix}-${nameWithoutExt}${ext}`);
  },
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  // Allowed image types
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files (jpeg, jpg, png, gif, webp) are allowed!"));
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});


// Middleware to handle multer errors
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum size is 5MB",
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next();
};

// Export configurations
module.exports = {
  upload,
  handleMulterError,
};

// S3 Bucket image upload configration
// const multer = require("multer");
// const path = require("path");

// // File filter to accept only images
// const fileFilter = (req, file, cb) => {
//   const allowedTypes = /jpeg|jpg|png|gif|webp/;
//   const extname = allowedTypes.test(
//     path.extname(file.originalname).toLowerCase()
//   );
//   const mimetype = allowedTypes.test(file.mimetype);

//   if (mimetype && extname) {
//     return cb(null, true);
//   } else {
//     cb(new Error("Only image files (jpeg, jpg, png, gif, webp) are allowed!"));
//   }
// };

// // Memory storage (for AWS S3)
// const memoryStorage = multer.memoryStorage();

// const uploadToMemory = multer({
//   storage: memoryStorage,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB
//   },
//   fileFilter: fileFilter,
// });

// // Middleware to handle multer errors
// const handleMulterError = (err, req, res, next) => {
//   if (err instanceof multer.MulterError) {
//     if (err.code === "LIMIT_FILE_SIZE") {
//       return res.status(400).json({
//         success: false,
//         message: "File size too large. Maximum size is 5MB",
//       });
//     }
//     return res.status(400).json({
//       success: false,
//       message: err.message,
//     });
//   } else if (err) {
//     return res.status(400).json({
//       success: false,
//       message: err.message,
//     });
//   }
//   next();
// };

// module.exports = {
//   uploadToMemory,
//   handleMulterError,
// };






/*
USAGE EXAMPLES:

1. Single file upload:
   router.post('/upload', upload.single('profileImage'), handleMulterError, controller);

ACCESS UPLOADED FILE IN CONTROLLER:
- req.file.filename - filename stored on disk
- req.file.path - full path to file
- req.file.size - file size in bytes
- req.file.mimetype - file MIME type

FOR S3 UPLOAD:
- Use uploadToMemory instead of upload
- Access file buffer with req.file.buffer
- Pass buffer to S3 upload function
*/
