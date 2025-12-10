require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

/**
 * Creates an authenticated Google Drive client using OAuth2
 * @returns {google.drive_v3.Drive} - Authenticated Drive client
 */
function getDriveClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing OAuth2 credentials. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env"
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.drive({ version: "v3", auth: oauth2Client });
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
