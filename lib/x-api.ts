/**
 * X API v2 client — used only to poll for new posts from watched accounts.
 * Requires a paid X API developer tier (Basic or above) with a Bearer token.
 */

import { supabaseAdmin } from "./supabase";

const X_API_BASE = "https://api.twitter.com/2";

async function getBearerToken(): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("app_settings")
    .select("x_bearer_token")
    .eq("id", 1)
    .single();

  if (error || !data?.x_bearer_token) {
    throw new Error("X API bearer token is not configured. Add it in Settings first.");
  }
  return data.x_bearer_token as string;
}

async function xFetch(path: string) {
  const token = await getBearerToken();
  const res = await fetch(`${X_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function getUserIdByHandle(handle: string): Promise<string> {
  const clean = handle.replace(/^@/, "");
  const data = await xFetch(`/users/by/username/${clean}`);
  if (!data?.data?.id) {
    throw new Error(`Could not resolve X user id for @${clean}`);
  }
  return data.data.id;
}

export type XPost = {
  id: string;
  text: string;
  created_at: string;
};

/**
 * Fetch tweets newer than `sinceId` for a given user.
 * Returns posts in reverse-chronological order (newest first), matching the API.
 */
export async function getNewPostsSince(
  userId: string,
  sinceId?: string
): Promise<XPost[]> {
  const params = new URLSearchParams({
    max_results: "10",
    "tweet.fields": "created_at",
    exclude: "replies,retweets",
  });
  if (sinceId) params.set("since_id", sinceId);

  const data = await xFetch(`/users/${userId}/tweets?${params.toString()}`);
  return (data?.data as XPost[]) ?? [];
}

export function tweetUrl(handle: string, tweetId: string): string {
  return `https://x.com/${handle.replace(/^@/, "")}/status/${tweetId}`;
}
