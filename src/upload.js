require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// Path to service account credentials
const SERVICE_ACCOUNT_PATH = path.join(
  __dirname,
  "..",
  "service_account.json"
);

/**
 * Creates an authenticated Google Drive client using Service Account
 * @returns {google.drive_v3.Drive} - Authenticated Drive client
 */
function getDriveClient() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `Service account file not found at ${SERVICE_ACCOUNT_PATH}. ` +
        `Please download it from Google Cloud Console and save it as service_account.json`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  return google.drive({ version: "v3", auth });
}

/**
 * Uploads a file to Google Drive
 * @param {string} filePath - Path to the file to upload
 * @param {string} fileName - Name for the file in Google Drive
 * @returns {Promise<string>} - WebViewLink (shareable URL) of the uploaded file
 */
async function uploadToDrive(filePath, fileName) {
  const folderId = process.env.DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error(
      "DRIVE_FOLDER_ID is not set in environment variables. " +
        "Please add your Google Drive folder ID to .env"
    );
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`Uploading ${fileName} to Google Drive...`);

  const drive = getDriveClient();

  // File metadata
  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  // Media content
  const media = {
    mimeType: "video/mp4",
    body: fs.createReadStream(filePath),
  };

  try {
    // Upload the file
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink",
    });

    const fileId = response.data.id;
    let webViewLink = response.data.webViewLink;

    // If webViewLink is not returned, construct it manually
    if (!webViewLink) {
      webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
    }

    // Make the file accessible to anyone with the link
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    console.log(`✅ Upload complete: ${response.data.name}`);
    console.log(`   File ID: ${fileId}`);

    return webViewLink;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Google Drive API error: ${error.response.status} - ${error.response.data.error.message}`
      );
    }
    throw error;
  }
}

module.exports = { uploadToDrive };

// Run directly for testing
if (require.main === module) {
  const testFile = process.argv[2];

  if (!testFile) {
    console.log("Usage: node src/upload.js <path-to-video>");
    console.log("Example: node src/upload.js output/test.mp4");
    process.exit(1);
  }

  uploadToDrive(testFile, path.basename(testFile))
    .then((url) => {
      console.log(`\n🔗 Shareable URL: ${url}`);
    })
    .catch((error) => {
      console.error("Error:", error.message);
      process.exit(1);
    });
}

