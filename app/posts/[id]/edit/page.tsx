import { PostForm } from "@/app/components/PostForm";
import { loadPostFormSnapshot } from "@/utils/wix-blog";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialValues = await loadPostFormSnapshot(id);

  return (
    <main className="flex flex-1 justify-center px-6">
      <PostForm postId={id} initialValues={initialValues} />
    </main>
  );
}
