"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PostListItem } from "@/utils/wix-blog";
import { ViewPostModal } from "./components/ViewPostModal";

export default function Home() {
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/posts");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to load posts");
      setPosts(result.posts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load posts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const stored = sessionStorage.getItem("viewPostUrl");
    if (stored) {
      setViewUrl(stored);
      sessionStorage.removeItem("viewPostUrl");
    }
    const storedWarning = sessionStorage.getItem("postSaveWarning");
    if (storedWarning) {
      setWarning(storedWarning);
      sessionStorage.removeItem("postSaveWarning");
    }
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this post? This moves it to the trash bin.")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to delete post");
      await loadPosts();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete post");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to publish post");
      if (result.url) setViewUrl(result.url);
      await loadPosts();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Failed to publish post");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10 md:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Content Hub</h1>
        <Link href="/posts/new" className="glass-button-primary px-5 py-2.5 text-sm font-medium">
          New post
        </Link>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-300/60 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {warning && (
        <p
          role="status"
          className="rounded-2xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {warning}
        </p>
      )}

      <div className="glass-panel p-6">
        {isLoading ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No posts yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/30 text-zinc-600 dark:border-white/10 dark:text-zinc-400">
                <th className="py-2" scope="col">Title</th>
                <th className="py-2" scope="col">Status</th>
                <th className="py-2" scope="col">Hashtags</th>
                <th className="py-2" scope="col">Last edited</th>
                <th className="py-2" scope="col" />
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-b border-white/20 last:border-0 dark:border-white/5">
                  <td className="py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{post.title}</td>
                  <td className="py-2.5 capitalize text-zinc-600 dark:text-zinc-400">{post.status}</td>
                  <td className="py-2.5 text-zinc-600 dark:text-zinc-400">{post.hashtags.join(", ")}</td>
                  <td className="py-2.5 text-zinc-600 dark:text-zinc-400">
                    {post.editedDate ? new Date(post.editedDate).toLocaleDateString() : "-"}
                  </td>
                  <td className="py-2.5">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/posts/${post.id}/edit`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Edit
                      </Link>
                      {post.status === "draft" && (
                        <button
                          type="button"
                          disabled={busyId === post.id}
                          onClick={() => handlePublish(post.id)}
                          className="text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                        >
                          Publish
                        </button>
                      )}
                      {post.status === "published" && post.url && (
                        <button
                          type="button"
                          onClick={() => setViewUrl(post.url ?? null)}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          View live
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === post.id}
                        onClick={() => handleDelete(post.id)}
                        className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {viewUrl && <ViewPostModal url={viewUrl} onClose={() => setViewUrl(null)} />}
    </main>
  );
}
