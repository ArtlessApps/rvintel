"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { RefreshCw, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketView } from "@/components/market-view";

type DateWindow = "7d" | "30d" | "90d";

export default function DashboardPage() {
  const router = useRouter();
  const [market, setMarket] = useState("san-diego-ca");
  const [rvClass, setRvClass] = useState("Class B");
  const [dateWindow, setDateWindow] = useState<DateWindow>("30d");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshToken((t) => t + 1);
    // Brief visual cue; MarketView reloads on refreshToken change and will
    // flip its own loading state. We reset the spinner after a short delay.
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-[20px] border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center">
              <Logo />
            </Link>
            <span className="text-border">|</span>
            <span className="text-sm text-muted-foreground">Market Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/fleet"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Truck className="w-3.5 h-3.5" />
              My Fleet
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Market</label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="san-diego-ca">San Diego, CA</SelectItem>
                <SelectItem value="riverside-county-ca">Riverside County, CA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">RV Class</label>
            <Select value={rvClass} onValueChange={setRvClass}>
              <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Class B">Class B</SelectItem>
                <SelectItem value="Class A">Class A</SelectItem>
                <SelectItem value="Class C">Class C</SelectItem>
                <SelectItem value="Travel Trailer">Travel Trailer</SelectItem>
                <SelectItem value="Fifth Wheel">Fifth Wheel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Window</label>
            <Select value={dateWindow} onValueChange={(v) => setDateWindow(v as DateWindow)}>
              <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <MarketView
          market={market}
          rvClass={rvClass}
          dateWindow={dateWindow}
          onDateWindowChange={setDateWindow}
          refreshToken={refreshToken}
        />
      </main>
    </div>
  );
}
