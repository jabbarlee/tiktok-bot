require("dotenv").config();
const Snoowrap = require("snoowrap");

const reddit = new Snoowrap({
  userAgent: "TikTok Bot v1.0",
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  username: process.env.REDDIT_USERNAME,
  password: process.env.REDDIT_PASSWORD,
});

/**
 * Cleans post content by removing edit sections
 * @param {string} text - The raw post text
 * @returns {string} - Cleaned text
 */
function cleanContent(text) {
  // Remove "Edit:", "EDIT:", "Update:", "UPDATE:" sections and everything after them on that line
  let cleaned = text.replace(/\b(edit|update)\s*:.*$/gim, "");

  // Remove multiple consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Trim whitespace
  return cleaned.trim();
}

/**
 * Checks if text contains URLs
 * @param {string} text - Text to check
 * @returns {boolean} - True if URLs found
 */
function containsUrl(text) {
  const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
  return urlPattern.test(text);
}

/**
 * Fetches a suitable Reddit post for TikTok content
 * @returns {Promise<{title: string, content: string, id: string} | null>}
 */
async function getRedditPost() {
  const subreddits = ["confessions", "scarystories"];
  const MIN_LENGTH = 600;
  const MAX_LENGTH = 2000;

  for (const subredditName of subreddits) {
    try {
      const subreddit = reddit.getSubreddit(subredditName);
      const posts = await subreddit.getTop({ time: "day", limit: 3 });

      for (const post of posts) {
        // Skip if it's not a self post (text post)
        if (!post.is_self) {
          continue;
        }

        const rawContent = post.selftext;

        // Skip posts with URLs
        if (containsUrl(rawContent)) {
          continue;
        }

        // Clean the content
        const cleanedContent = cleanContent(rawContent);

        // Check length requirements
        if (
          cleanedContent.length < MIN_LENGTH ||
          cleanedContent.length > MAX_LENGTH
        ) {
          continue;
        }

        return {
          title: post.title,
          content: cleanedContent,
          id: post.id,
        };
      }
    } catch (error) {
      console.error(`Error fetching from r/${subredditName}:`, error.message);
    }
  }

  console.log("No suitable posts found matching criteria.");
  return null;
}

module.exports = { getRedditPost };

// Run directly for testing
if (require.main === module) {
  getRedditPost()
    .then((post) => {
      if (post) {
        console.log("Found post:");
        console.log("Title:", post.title);
        console.log("ID:", post.id);
        console.log("Content length:", post.content.length);
        console.log("Content preview:", post.content.substring(0, 200) + "...");
      }
    })
    .catch(console.error);
}
