const AWS = require("aws-sdk");

// Configure AWS SDK
// AWS.config.update({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   region: process.env.AWS_REGION || "us-east-1",
// });

// const s3 = new AWS.S3();

// const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

/**
 * Upload file to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} key - S3 object key (file path in bucket)
 * @param {string} mimetype - File MIME type
 * @returns {Promise<Object>} S3 upload result with Location URL
 */
// const uploadToS3 = async (fileBuffer, key, mimetype) => {
//   try {
//     const params = {
//       Bucket: BUCKET_NAME,
//       Key: key,
//       Body: fileBuffer,
//       ContentType: mimetype,
//       ACL: "public-read", // Makes file publicly accessible
//     };

//     const result = await s3.upload(params).promise();
//     console.log("File uploaded to S3:", result.Location);
//     return result;
//   } catch (error) {
//     console.error("Error uploading to S3:", error);
//     throw error;
//   }
// };

/**
 * Delete file from S3
 * @param {string} key - S3 object key to delete
 * @returns {Promise<Object>}
 */
// const deleteFromS3 = async (key) => {
//   try {
//     const params = {
//       Bucket: BUCKET_NAME,
//       Key: key,
//     };

//     const result = await s3.deleteObject(params).promise();
//     console.log("File deleted from S3:", key);
//     return result;
//   } catch (error) {
//     console.error("Error deleting from S3:", error);
//     throw error;
//   }
// };

// module.exports = {
//   uploadToS3,
//   deleteFromS3,
//   s3,
//   BUCKET_NAME,
// };
