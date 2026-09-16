"use client";

import { Download, Play, Search } from "lucide-react";
import { Link } from "@/lib/navigation";
import { recentRuns } from "@/lib/demoData";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";

export function TestRunsPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Test Runs <span className="font-medium text-slate-500">(Execution History)</span></h1>
          <p className="mt-1 text-sm text-slate-500">Global execution timeline across automated test runs</p>
        </div>
        <div className="flex gap-2">
          <Button><Download size={15} /> Export CSV</Button>
          <Link to="/projects/demo-project/runs/104/live" className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-700"><Play size={15} /> Trigger New Run</Link>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex flex-wrap items-center border-b p-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input className="w-full rounded bg-indigo-50 py-2 pl-9 pr-3 text-sm" placeholder="Search runs..." />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3 text-left">Run ID</th><th className="px-4 py-3 text-left">Test / Suite</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Run By</th><th className="px-4 py-3 text-left">Duration</th><th className="px-4 py-3 text-left">Executed</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
          <tbody>{recentRuns.map(r => <tr key={r.id} className="border-t"><td className="px-4 py-4 font-mono text-indigo-700">#{r.id}</td><td className="px-4 font-medium">{r.title}</td><td className="px-4"><StatusBadge status={r.status} /></td><td className="px-4 text-slate-600">{r.runBy}</td><td className="px-4 font-mono text-xs">{r.duration}</td><td className="px-4 text-slate-500">{r.executed}</td><td className="px-4 text-right"><Link to={r.status === "Running" ? `/projects/demo-project/runs/${r.id}/live` : `/projects/demo-project/results/${r.id}${r.status === "Failed" ? "?status=failed" : ""}`} className="text-indigo-600">View</Link></td></tr>)}</tbody>
        </table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-slate-500"><span>Showing 1 to 5 of 48 runs</span><span>Previous &nbsp; <b className="rounded-lg bg-indigo-600 px-2 py-1 text-sm text-white">1</b> &nbsp; 2 &nbsp; 3 &nbsp; ... &nbsp; 10 &nbsp; <span className="text-indigo-600">Next</span></span></div>
      </div>
    </div>
  );
}

export default TestRunsPage;
