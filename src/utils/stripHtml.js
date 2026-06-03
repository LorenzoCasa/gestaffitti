export function looksLikeHtml(text) {
  return typeof text === "string" && /<[a-z][\s\S]*>/i.test(text);
}

export function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extracts the Subito reply/conversation link from raw_metadata.
 * Checks direct fields first, then scans html_body for subito.it hrefs.
 * Returns null if no link found.
 */
const SUBITO_MSG_RE = /href="(https?:\/\/(?:www\.)?subito\.it\/(?:messaggi|my-messages|il-mio-profilo\/messaggi)[^"]*)"/i;
const SUBITO_ANY_RE = /href="(https?:\/\/(?:www\.)?subito\.it\/[^"]{10,})"/i;
const SUBITO_URL_RE = /https?:\/\/(?:www\.)?subito\.it\/(?:messaggi|my-messages|il-mio-profilo\/messaggi)\S+/i;

function extractFromHtml(html) {
  if (!html) return null;
  const m = html.match(SUBITO_MSG_RE) ?? html.match(SUBITO_ANY_RE);
  return m ? m[1] : null;
}

/**
 * Extracts the Subito reply/conversation link from raw_metadata (and optionally raw_text).
 * Priority: direct fields → html_body → email_html_body → raw_text plain URL.
 * Returns null if no link found.
 */
export function extractSubitoLink(rawMetadata, rawText) {
  if (!rawMetadata) return null;

  // Direct fields (Make can send these explicitly)
  if (rawMetadata.subito_url) return rawMetadata.subito_url;
  if (rawMetadata.reply_url)  return rawMetadata.reply_url;

  // HTML body variants (webhook saves as html_body; Make might use email_html_body)
  const fromHtml = extractFromHtml(rawMetadata.html_body)
                ?? extractFromHtml(rawMetadata.email_html_body);
  if (fromHtml) return fromHtml;

  // Last resort: scan raw_text for a plain Subito message URL
  if (rawText) {
    const m = rawText.match(SUBITO_URL_RE);
    if (m) return m[0];
  }

  return null;
}
