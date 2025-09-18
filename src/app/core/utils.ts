/**
 * Generate a slug from a string using hyphens instead of underscores
 * @param text The text to convert to a slug
 * @returns A slugified string with hyphens
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')        // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
    .replace(/\-\-+/g, '-')      // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '')          // Trim hyphen from start
    .replace(/-+$/, '');         // Trim hyphen from end
}

/**
 * Generate a current date string in ISO format
 */
export function generateDate(): string {
  return new Date().toISOString();
}
