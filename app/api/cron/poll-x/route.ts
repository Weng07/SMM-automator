import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserIdByHandle, getNewPostsSince, tweetUrl } from "@/lib/x-api";
import { submitOrderForLink } from "@/lib/place-order";

// Vercel Cron calls this on a schedule (see vercel.json). We protect it with
// a shared secret so it can't be triggered by randoms hitting the URL.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: accounts, error } = await supabase
    .from("watched_x_accounts")
    .select("*")
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary: Array<Record<string, unknown>> = [];

  for (const account of accounts ?? []) {
    try {
      // Resolve user id lazily and cache nothing extra — cheap call, rare polling.
      const userId = await getUserIdByHandle(account.handle);
      const newPosts = await getNewPostsSince(userId, account.last_seen_tweet_id ?? undefined);

      if (newPosts.length === 0) {
        summary.push({ handle: account.handle, newPosts: 0 });
        continue;
      }

      // API returns newest-first; process oldest-first so last_seen_tweet_id
      // ends up as the actual newest at the end.
      const ordered = [...newPosts].reverse();

      for (const post of ordered) {
        const link = tweetUrl(account.handle, post.id);
        await submitOrderForLink({
          platform: "x",
          tier: account.tier,
          link,
          source: "auto_x",
          commentPoolId: account.comment_pool_id ?? null,
        });
      }

      const newestId = newPosts[0].id;
      await supabase
        .from("watched_x_accounts")
        .update({ last_seen_tweet_id: newestId })
        .eq("id", account.id);

      summary.push({ handle: account.handle, newPosts: newPosts.length });
    } catch (error) {
      summary.push({ handle: account.handle, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
