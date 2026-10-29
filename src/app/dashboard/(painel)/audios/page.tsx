import { redirect } from "next/navigation";
import { AudioManager } from "@/features/dashboard/audio/audio-manager";
import { getStaffSession } from "@/lib/auth/dal";

export const metadata = { title: "Áudios" };

export default async function AudiosPage() {
  const session = await getStaffSession();
  if (!session?.isAdmin) redirect("/dashboard");
  return <AudioManager />;
}
