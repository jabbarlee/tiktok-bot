require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getRedditPost } = require("./src/scraper");
const { generateAudio, processVideo } = require("./src/media");
const { uploadToDrive } = require("./src/upload");

// Ensure output directory exists
const outputDir = path.join(__dirname, "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Main bot execution function
 */
async function runBot() {
  console.log("🤖 TikTok Bot Starting...\n");
  console.log("=".repeat(50));

  try {
    // Step 1: Fetch Reddit post
    console.log("\n📖 Step 1: Fetching Reddit post...");
    const post = await getRedditPost();

    if (!post) {
      console.log("❌ No suitable post found. Exiting.");
      return;
    }

    console.log(`✅ Post found: ${post.title}`);
    console.log(`   ID: ${post.id}`);
    console.log(`   Content length: ${post.content.length} characters`);

    // Step 2: Generate audio from post content
    console.log("\n🎙️ Step 2: Generating audio...");
    const { path: audioPath, duration } = await generateAudio(post.content);
    console.log(`✅ Audio generated: ${audioPath}`);
    console.log(`   Duration: ${duration.toFixed(2)} seconds`);

    // Step 3: Process video with subtitles
    console.log("\n🎬 Step 3: Processing video...");
    const tempVideoPath = await processVideo(audioPath, duration, post.content);
    console.log(`✅ Video processed: ${tempVideoPath}`);

    // Step 4: Move final video to output folder
    console.log("\n📦 Step 4: Moving to output folder...");
    const finalOutputPath = path.join(outputDir, `${post.id}.mp4`);

    // Copy file to output directory
    fs.copyFileSync(tempVideoPath, finalOutputPath);

    // Clean up temp file
    fs.unlinkSync(tempVideoPath);

    console.log(`✅ Final video saved: ${finalOutputPath}`);

    // Step 5: Upload to Google Drive
    console.log("\n☁️ Step 5: Uploading to Google Drive...");
    const driveUrl = await uploadToDrive(finalOutputPath, `${post.id}.mp4`);
    console.log(`✅ Uploaded to Drive!`);

    console.log("\n" + "=".repeat(50));
    console.log("🎉 Bot completed successfully!");
    console.log(`📹 Local: ${finalOutputPath}`);
    console.log(`🔗 Drive: ${driveUrl}`);

    return { localPath: finalOutputPath, driveUrl };
  } catch (error) {
    console.error("\n❌ Bot encountered an error:");
    console.error(`   ${error.message}`);

    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run the bot
runBot();
