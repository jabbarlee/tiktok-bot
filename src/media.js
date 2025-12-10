require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffprobeStatic = require("ffprobe-static");

// Set ffprobe path for fluent-ffmpeg
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Ensure temp directory exists
const tempDir = path.join(__dirname, "..", "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Gets the duration of a media file in seconds
 * @param {string} filePath - Path to the media file
 * @returns {Promise<number>} - Duration in seconds
 */
function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration);
    });
  });
}

/**
 * Generates audio from text using ElevenLabs API
 * @param {string} text - The text to convert to speech
 * @returns {Promise<{path: string, duration: number}>} - Audio file path and duration in seconds
 */
async function generateAudio(text) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default to Rachel voice
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set in environment variables");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      data: {
        text: text,
        model_id: "eleven_monolingual_v1",
        output_format: "mp3_44100_128",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      responseType: "arraybuffer",
    });

    const audioPath = path.join(tempDir, "audio.mp3");
    fs.writeFileSync(audioPath, response.data);

    // Get the duration of the generated audio
    const duration = await getMediaDuration(audioPath);

    console.log(`Audio generated: ${audioPath} (${duration.toFixed(2)}s)`);

    return {
      path: audioPath,
      duration: duration,
    };
  } catch (error) {
    if (error.response) {
      throw new Error(
        `ElevenLabs API error: ${error.response.status} - ${error.response.statusText}`
      );
    }
    throw error;
  }
}

/**
 * Processes video with audio overlay for TikTok format
 * @param {string} audioPath - Path to the audio file
 * @param {number} audioDuration - Duration of the audio in seconds
 * @returns {Promise<string>} - Path to the final video file
 */
async function processVideo(audioPath, audioDuration) {
  const assetsDir = path.join(__dirname, "..", "assets");
  const backgroundVideo = path.join(assetsDir, "gameplay.mp4");
  const outputPath = path.join(tempDir, "final_video.mp4");

  if (!fs.existsSync(backgroundVideo)) {
    throw new Error(
      `Background video not found at ${backgroundVideo}. Please add a gameplay.mp4 file to the assets folder.`
    );
  }

  // Get the total duration of the background video
  const videoTotalDuration = await getMediaDuration(backgroundVideo);

  if (videoTotalDuration < audioDuration) {
    throw new Error(
      `Background video (${videoTotalDuration.toFixed(2)}s) is shorter than audio (${audioDuration.toFixed(2)}s)`
    );
  }

  // Calculate random start time
  const maxStartTime = videoTotalDuration - audioDuration;
  const startTime = Math.random() * maxStartTime;

  console.log(
    `Processing video: start=${startTime.toFixed(2)}s, duration=${audioDuration.toFixed(2)}s`
  );

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(backgroundVideo)
      .inputOptions([`-ss ${startTime}`, `-t ${audioDuration}`])
      .input(audioPath)
      .complexFilter([
        // Crop to 9:16 vertical ratio (TikTok format)
        // crop=ih*(9/16):ih centers the crop horizontally
        {
          filter: "crop",
          options: "ih*(9/16):ih",
          inputs: "0:v",
          outputs: "cropped",
        },
      ])
      .outputOptions([
        "-map [cropped]",
        "-map 1:a",
        "-c:v libx264",
        "-c:a aac",
        "-shortest",
      ])
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log("FFmpeg command:", commandLine);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          process.stdout.write(`\rProcessing: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on("end", () => {
        console.log(`\nVideo processed: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err.message);
        reject(err);
      })
      .run();
  });
}

module.exports = { generateAudio, processVideo };

// Run directly for testing
if (require.main === module) {
  const testText =
    "Hello, this is a test of the ElevenLabs text to speech API. This audio will be used to create a TikTok video.";

  console.log("Testing media generation...\n");

  generateAudio(testText)
    .then(async ({ path: audioPath, duration }) => {
      console.log(`\nAudio generated successfully!`);
      console.log(`Path: ${audioPath}`);
      console.log(`Duration: ${duration.toFixed(2)} seconds\n`);

      console.log("Processing video...\n");
      const videoPath = await processVideo(audioPath, duration);
      console.log(`\nFinal video: ${videoPath}`);
    })
    .catch((error) => {
      console.error("Error:", error.message);
    });
}

