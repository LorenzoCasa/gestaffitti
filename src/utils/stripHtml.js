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
export function extractSubitoLink(rawMetadata) {
  if (!rawMetadata) return null;

  // Direct fields (future Make integration)
  if (rawMetadata.subito_url) return rawMetadata.subito_url;
  if (rawMetadata.reply_url)  return rawMetadata.reply_url;

  // Extract from html_body: prefer links to messaggi/conversazione paths
  const html = rawMetadata.html_body;
  if (!html) return null;

  // Try message/conversation specific links first
  const msgMatch = html.match(/href="(https?:\/\/(?:www\.)?subito\.it\/(?:messaggi|my-messages|il-mio-profilo\/messaggi)[^"]*)"/i);
  if (msgMatch) return msgMatch[1];

  // Fallback: any subito.it link that isn't an image or tracking pixel
  const anyMatch = html.match(/href="(https?:\/\/(?:www\.)?subito\.it\/[^"]{10,})"/i);
  if (anyMatch) return anyMatch[1];

  return null;
}
