import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}
