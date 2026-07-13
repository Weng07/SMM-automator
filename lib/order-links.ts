const URL_EXTRACT_REGEX = /https?:\/\/.*?(?=https?:\/\/|[\s,]|$)/gi;

export function parseOrderLinks(input: string): string[] {
  if (!input) return [];

  return input
    .split(/\r?\n|,/) 
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return [];

      const matchedUrls = trimmed.match(URL_EXTRACT_REGEX);

      if (matchedUrls && matchedUrls.length > 0) {
        return matchedUrls.map((url) => url.trim()).filter(Boolean);
      }

      return [trimmed];
    })
    .filter(Boolean);
}
