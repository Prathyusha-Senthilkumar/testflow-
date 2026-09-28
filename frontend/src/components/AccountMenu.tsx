"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { Link, useNavigate } from "@/lib/navigation";
import { accountInitials, clearAccount, readAccount, type Account } from "@/lib/account";

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setAccount(readAccount());
    sync();
    window.addEventListener("testflow-account", sync);
    return () => window.removeEventListener("testflow-account", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function signOut() {
    clearAccount();
    setOpen(false);
    navigate("/login");
  }

  const label = account?.name || "Account";
  const email = account?.email || "";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? label : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center rounded-lg py-2 hover:bg-slate-50 ${collapsed ? "justify-center px-0" : "gap-3 px-2"}`}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {account ? accountInitials(account) : "?"}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className="truncate text-xs text-slate-500">{email || "Not signed in"}</p>
            </div>
            <ChevronDown size={16} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg ${collapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 right-0 mb-2"}`}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{label}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <Link
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Settings size={15} />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
