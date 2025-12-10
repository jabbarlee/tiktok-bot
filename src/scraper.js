require("dotenv").config();
const axios = require("axios");

// User-Agent header required to avoid being blocked by Reddit
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

/**
 * Expands Reddit shorthand into readable text for TTS
 * @param {string} text - Text with Reddit shorthand
 * @returns {string} - Expanded text
 */
function expandRedditShorthand(text) {
  let expanded = text;

  // Expand age/gender patterns like "34f", "35m", "28F", "30M"
  // Also handles formats like (34f), [35m], 34F, etc.
  expanded = expanded.replace(
    /\b(\d{1,2})\s*([fFmM])\b/g,
    (match, age, gender) => {
      const genderWord =
        gender.toLowerCase() === "f" ? "year old female" : "year old male";
      return `${age} ${genderWord}`;
    }
  );

  // Common Reddit abbreviations
  const abbreviations = {
    AITA: "Am I the asshole",
    YTA: "You're the asshole",
    NTA: "Not the asshole",
    ESH: "Everyone sucks here",
    NAH: "No assholes here",
    TIFU: "Today I fucked up",
    TLDR: "Too long, didn't read",
    IMO: "In my opinion",
    IMHO: "In my humble opinion",
    TBH: "To be honest",
    AFAIK: "As far as I know",
    IIRC: "If I remember correctly",
    SO: "significant other",
    BF: "boyfriend",
    GF: "girlfriend",
    DH: "dear husband",
    DW: "dear wife",
    MIL: "mother in law",
    FIL: "father in law",
    SIL: "sister in law",
    BIL: "brother in law",
  };

  for (const [abbr, full] of Object.entries(abbreviations)) {
    // Case insensitive replacement for standalone abbreviations
    const regex = new RegExp(`\\b${abbr}\\b`, "gi");
    expanded = expanded.replace(regex, full);
  }

  return expanded;
}

/**
 * Cleans post content by removing edit sections
 * @param {string} text - The raw post text
 * @returns {string} - Cleaned text
 */
function cleanContent(text) {
  // First expand Reddit shorthand
  let cleaned = expandRedditShorthand(text);

  // Remove "Edit:", "EDIT:", "Update:", "UPDATE:" sections and everything after them on that line
  cleaned = cleaned.replace(/\b(edit|update)\s*:.*$/gim, "");

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
 * Shuffles an array randomly (Fisher-Yates algorithm)
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetches a suitable Reddit post for TikTok content using public JSON endpoint
 * Randomizes subreddit, sorting method, and post selection for variety
 * @returns {Promise<{title: string, content: string, id: string} | null>}
 */
async function getRedditPost() {
  const subreddits = [
    "confessions",
    "TrueOffMyChest",
    "tifu",
    "AmItheAsshole",
    "relationship_advice",
    "pettyrevenge",
    "MaliciousCompliance",
    "entitledparents",
  ];

  // Different sorting options for variety
  const sortOptions = [
    { sort: "hot", params: "" },
    { sort: "new", params: "" },
    { sort: "top", params: "&t=day" },
    { sort: "top", params: "&t=week" },
    { sort: "rising", params: "" },
  ];

  const MIN_LENGTH = 600;
  const MAX_LENGTH = 2000;

  // Collect all valid posts from randomized sources
  const validPosts = [];

  // Shuffle subreddits and pick a few random ones
  const shuffledSubreddits = shuffleArray(subreddits).slice(0, 3);
  const randomSort = sortOptions[Math.floor(Math.random() * sortOptions.length)];

  console.log(
    `Searching: r/${shuffledSubreddits.join(", r/")} (${randomSort.sort})`
  );

  for (const subredditName of shuffledSubreddits) {
    try {
      const url = `https://www.reddit.com/r/${subredditName}/${randomSort.sort}.json?limit=25${randomSort.params}`;

      const response = await axios.get(url, {
        headers: {
          "User-Agent": USER_AGENT,
        },
      });

      const posts = response.data.data.children;

      for (const postWrapper of posts) {
        const post = postWrapper.data;

        // Skip if it's not a self post (text post)
        if (!post.is_self) {
          continue;
        }

        const rawContent = post.selftext;

        // Skip empty posts
        if (!rawContent || rawContent.length === 0) {
          continue;
        }

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

        validPosts.push({
          title: post.title,
          content: cleanedContent,
          id: post.id,
          subreddit: subredditName,
        });
      }
    } catch (error) {
      console.error(`Error fetching from r/${subredditName}:`, error.message);
    }
  }

  if (validPosts.length === 0) {
    console.log("No suitable posts found matching criteria.");
    return null;
  }

  // Pick a random post from all valid posts
  const randomIndex = Math.floor(Math.random() * validPosts.length);
  const selectedPost = validPosts[randomIndex];

  console.log(
    `Found ${validPosts.length} valid posts, selected from r/${selectedPost.subreddit}`
  );

  return {
    title: selectedPost.title,
    content: selectedPost.content,
    id: selectedPost.id,
  };
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
