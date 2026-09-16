import type { DemoStatus } from "@/lib/demoData";
const styles: Record<DemoStatus,string> = {
  Passed:"bg-teal-100 text-teal-800", Failed:"bg-red-100 text-red-700", Running:"bg-indigo-100 text-indigo-700", Untested:"bg-slate-200 text-slate-600", Skipped:"bg-slate-100 text-slate-500"
};
export function StatusBadge({status}:{status:DemoStatus}){return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{status}</span>}
