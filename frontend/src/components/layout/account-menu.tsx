"use client";

import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { Link, useNavigate } from "@/lib/navigation";
import { accountInitials, clearAccount } from "@/lib/account";
import { useAccount } from "@/hooks/useAccount";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Clears the stored session and returns to /login. */
export function useSignOut() {
  const navigate = useNavigate();
  return () => {
    clearAccount();
    navigate("/login");
  };
}

export function AccountMenu({ collapsed = false }: { collapsed?: boolean }) {
  const account = useAccount();
  const signOut = useSignOut();
  const label = account?.name || "Account";
  const email = account?.email || "";
  const initials = account ? accountInitials(account) : "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${label}`}
        className={cn(
          "flex w-full items-center rounded-md text-left outline-none transition-colors duration-150 hover:bg-state-hover focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-state-hover",
          collapsed ? "size-9 justify-center" : "gap-2.5 px-2 py-1.5"
        )}
      >
        <Avatar className="size-7 rounded-md">
          <AvatarFallback className="rounded-md bg-accent text-[11px] font-semibold text-brand-accent">{initials}</AvatarFallback>
        </Avatar>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{email || "Not signed in"}</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-faint" aria-hidden />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-[13px] font-medium text-foreground">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
