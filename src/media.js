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
 * Splits text into chunks of approximately 4-5 words
 * @param {string} text - The full text to split
 * @param {number} wordsPerChunk - Number of words per chunk (default 4)
 * @returns {string[]} - Array of text chunks
 */
function splitTextIntoChunks(text, wordsPerChunk = 4) {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const chunks = [];

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(" ");
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Escapes special characters for FFmpeg drawtext filter
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeDrawtext(text) {
  // Escape characters that have special meaning in FFmpeg drawtext
  return text
    .replace(/\\/g, "\\\\\\\\") // Backslash
    .replace(/'/g, "\u2019") // Replace apostrophe with unicode right single quote
    .replace(/:/g, "\\:") // Colon
    .replace(/\[/g, "\\[") // Square brackets
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%") // Percent
    .replace(/;/g, "\\;"); // Semicolon
}

/**
 * Generates FFmpeg drawtext filter string for subtitles
 * @param {string} text - The full text to display as subtitles
 * @param {number} audioDuration - Total duration of the audio in seconds
 * @returns {string} - FFmpeg filter string for drawtext
 */
function generateSubtitleFilter(text, audioDuration) {
  const chunks = splitTextIntoChunks(text, 4);
  const chunkDuration = audioDuration / chunks.length;

  // Build drawtext filters for each chunk
  const drawtextFilters = chunks.map((chunk, index) => {
    const startTime = index * chunkDuration;
    const endTime = (index + 1) * chunkDuration;
    const escapedText = escapeDrawtext(chunk);

    // drawtext filter with:
    // - Yellow text (fontcolor=yellow)
    // - Black border/outline (borderw=2, bordercolor=black)
    // - Font size 24
    // - Centered position
    // - Enable only during chunk's time window
    return (
      `drawtext=text='${escapedText}':` +
      `fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:` +
      `fontsize=24:` +
      `fontcolor=yellow:` +
      `borderw=2:` +
      `bordercolor=black:` +
      `x=(w-text_w)/2:` +
      `y=(h-text_h)/2:` +
      `enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})'`
    );
  });

  return drawtextFilters.join(",");
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
 * Processes video with audio overlay and subtitles for TikTok format
 * @param {string} audioPath - Path to the audio file
 * @param {number} audioDuration - Duration of the audio in seconds
 * @param {string} text - The text to display as subtitles
 * @returns {Promise<string>} - Path to the final video file
 */
async function processVideo(audioPath, audioDuration, text) {
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

  // Generate subtitle filter string
  const subtitleFilter = generateSubtitleFilter(text, audioDuration);

  // Build the complete filter chain: crop -> subtitles
  const filterChain = `[0:v]crop=ih*(9/16):ih[cropped];[cropped]${subtitleFilter}[final]`;

  console.log(
    `Processing video: start=${startTime.toFixed(2)}s, duration=${audioDuration.toFixed(2)}s`
  );
  console.log(`Subtitle chunks: ${splitTextIntoChunks(text, 4).length}`);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(backgroundVideo)
      .inputOptions([`-ss ${startTime}`, `-t ${audioDuration}`])
      .input(audioPath)
      .complexFilter(filterChain)
      .outputOptions([
        "-map [final]",
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
    "Hello, this is a test of the ElevenLabs text to speech API. This audio will be used to create a TikTok video with subtitles burned in.";

  console.log("Testing media generation...\n");

  generateAudio(testText)
    .then(async ({ path: audioPath, duration }) => {
      console.log(`\nAudio generated successfully!`);
      console.log(`Path: ${audioPath}`);
      console.log(`Duration: ${duration.toFixed(2)} seconds\n`);

      console.log("Processing video with subtitles...\n");
      const videoPath = await processVideo(audioPath, duration, testText);
      console.log(`\nFinal video: ${videoPath}`);
    })
    .catch((error) => {
      console.error("Error:", error.message);
    });
}

