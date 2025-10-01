const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = (folder, buffer, filename) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: folder, public_id: filename, format: "jpeg" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

module.exports = { cloudinary, uploadToCloudinary };
