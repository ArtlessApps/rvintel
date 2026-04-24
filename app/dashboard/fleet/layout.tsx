import { Suspense } from "react";
import FleetSidebar from "./_sidebar";

export default function FleetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex bg-background">
      <Suspense fallback={<div className="w-72 shrink-0 bg-muted/40 h-screen" />}>
        <FleetSidebar />
      </Suspense>
      <div className="flex-1 min-w-0 min-h-screen">{children}</div>
    </div>
  );
}
