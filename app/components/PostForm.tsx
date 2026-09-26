// app/components/PostForm.tsx
"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PostFormSnapshot } from "@/utils/wix-blog";

export type PostFormValues = Omit<PostFormSnapshot, "status">;

export const DEFAULT_POST_FORM_VALUES: PostFormValues = {
  title: "",
  html: "",
  excerpt: "",
  hashtags: "",
  featured: false,
  commentingEnabled: true,
  language: "en",
  coverImageUrl: "",
  seoTitle: "",
  seoDescription: "",
};

interface PostFormProps {
  postId?: string;
  initialValues?: PostFormValues;
}

export function PostForm({ postId, initialValues }: PostFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<PostFormValues>(initialValues ?? DEFAULT_POST_FORM_VALUES);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof PostFormValues>(key: K, value: PostFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publish = submitter?.value === "publish";

    setIsSaving(true);
    setError(null);
    try {
      const seoTitle = values.seoTitle.trim() || values.title;
      const seoDescription = values.seoDescription.trim() || values.excerpt;
      const payload = { ...values, seoTitle, seoDescription, publish };
      const url = postId ? `/api/posts/${postId}` : "/api/posts";
      const method = postId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
      }

      if (result.url) sessionStorage.setItem("viewPostUrl", result.url);
      router.push("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="glass-panel mx-auto flex max-w-2xl flex-col gap-6 px-8 py-8"
      onSubmit={handleSubmit}
    >
      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-red-300/60 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Title</span>
        <input
          className="glass-input px-3 py-2 text-sm"
          value={values.title}
          onChange={(event) => updateField("title", event.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">HTML content</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          Converted to Wix&apos;s rich-content format on save.
        </span>
        <textarea
          className="glass-input h-48 px-3 py-2 font-mono text-sm"
          value={values.html}
          onChange={(event) => updateField("html", event.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Excerpt</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          Leave blank. Wix generates one from your content automatically.
        </span>
        <textarea
          className="glass-input h-20 px-3 py-2 text-sm"
          value={values.excerpt}
          onChange={(event) => updateField("excerpt", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Hashtags</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Comma-separated.</span>
        <input
          className="glass-input px-3 py-2 text-sm"
          value={values.hashtags}
          onChange={(event) => updateField("hashtags", event.target.value)}
        />
      </label>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            className="accent-blue-600"
            checked={values.featured}
            onChange={(event) => updateField("featured", event.target.checked)}
          />
          Featured
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            className="accent-blue-600"
            checked={values.commentingEnabled}
            onChange={(event) => updateField("commentingEnabled", event.target.checked)}
          />
          Commenting enabled
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Language</span>
        <input
          className="glass-input px-3 py-2 text-sm"
          value={values.language}
          onChange={(event) => updateField("language", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Cover image URL</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          Imported into Wix Media so it can be used as the post&apos;s cover.
        </span>
        <input
          className="glass-input px-3 py-2 text-sm"
          value={values.coverImageUrl}
          onChange={(event) => updateField("coverImageUrl", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">SEO title</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          Written to the page&apos;s SEO tags once the post exists. A separate Wix API from the
          post itself. Defaults to the title above if left blank.
        </span>
        <input
          className="glass-input px-3 py-2 text-sm"
          value={values.seoTitle}
          onChange={(event) => updateField("seoTitle", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">SEO meta description</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Defaults to the excerpt above if left blank.</span>
        <textarea
          className="glass-input h-20 px-3 py-2 text-sm"
          value={values.seoDescription}
          onChange={(event) => updateField("seoDescription", event.target.value)}
        />
      </label>

      <div className="flex gap-3">
        <button
          type="submit"
          name="action"
          value="draft"
          disabled={isSaving}
          className="glass-button px-5 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save as draft"}
        </button>
        <button
          type="submit"
          name="action"
          value="publish"
          disabled={isSaving}
          className="glass-button-primary px-5 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save & publish"}
        </button>
      </div>
    </form>
  );
}
