import { redirect } from "next/navigation";

// Settings is split into pages (see the sidebar). The first one opens by default.
export default function SettingsPage() {
  redirect("/settings/pipeline");
}
