"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Truck } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function emailInitial(email: string) {
  return email.trim().charAt(0).toUpperCase() || "?";
}

type SiteHeaderAuthProps = {
  user: User | null;
  className?: string;
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
};

export function SiteHeaderAuth({
  user,
  className,
  onNavigate,
  variant = "desktop",
}: SiteHeaderAuthProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    onNavigate?.();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/");
  };

  if (!user) {
    if (variant === "mobile") {
      return (
        <div className={cn("space-y-2", className)}>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/login" onClick={onNavigate}>
              Sign in
            </Link>
          </Button>
        </div>
      );
    }

    return (
      <Button variant="ghost" size="sm" className={className} asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }

  if (variant === "mobile") {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="px-3 text-xs text-muted-foreground truncate">{user.email}</p>
        <Button variant="outline" className="w-full justify-start gap-2" asChild>
          <Link href="/dashboard" onClick={onNavigate}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
        </Button>
        <Button variant="outline" className="w-full justify-start gap-2" asChild>
          <Link href="/dashboard/fleet" onClick={onNavigate}>
            <Truck className="w-4 h-4" />
            My Fleet
          </Link>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("rounded-full", className)}
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {emailInitial(user.email ?? "")}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="truncate text-sm font-medium">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/fleet" className="cursor-pointer">
            <Truck className="w-4 h-4" />
            My Fleet
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
