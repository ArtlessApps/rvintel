"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { RefreshCw, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketView } from "@/components/market-view";
import { liveMarkets } from "@/lib/markets";

type DateWindow = "7d" | "30d" | "90d";

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMarket = searchParams.get("market") ?? "san-diego-ca";
  const [market, setMarket] = useState(initialMarket);
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
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="min-h-screen bg-background">
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Market</label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="w-48 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                {Array.from(
                  liveMarkets().reduce((acc, m) => {
                    const list = acc.get(m.region) ?? [];
                    list.push(m);
                    acc.set(m.region, list);
                    return acc;
                  }, new Map<string, ReturnType<typeof liveMarkets>>()),
                ).map(([region, markets]) => (
                  <SelectGroup key={region}>
                    <SelectLabel className="text-[0.6875rem] uppercase tracking-[0.05em]">
                      {region}
                    </SelectLabel>
                    {markets.map((m) => (
                      <SelectItem key={m.slug} value={m.slug}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
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
