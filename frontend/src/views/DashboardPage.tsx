"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, FolderKanban, FlaskConical, Plus, XCircle } from "lucide-react";
import { Link } from "@/lib/navigation";
import { api, type DashboardData } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const emptyDashboard: DashboardData = { projects: 0, testCases: 0, passed: 0, failed: 0, recentProjects: [] };

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard().then(setData).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const metrics = [
    { label: "Projects", value: data.projects, icon: FolderKanban, helper: "Applications under test" },
    { label: "Test Cases", value: data.testCases, icon: FlaskConical, helper: "Across all projects" },
    { label: "Passed", value: data.passed, icon: CheckCircle2, helper: "Latest recorded outcome" },
    { label: "Failed", value: data.failed, icon: XCircle, helper: "Needs QA attention" },
  ];

  return (
    <div className="p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-medium text-indigo-600">Workspace overview</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1><p className="mt-2 text-sm text-slate-500">Track projects, test coverage and the latest execution status from one place.</p></div>
        <Link to="/projects" className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"><Plus size={17} /> Manage Projects</Link>
      </div>
      {error && <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Could not refresh dashboard data: {error}</div>}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon, helper }) => <Card key={label} className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{loading ? "-" : value}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={19} /></span></div><p className="mt-3 text-xs text-slate-400">{helper}</p></Card>)}</div>
      <div className="mt-9 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Recent Projects</h2><p className="mt-1 text-sm text-slate-500">Open a project to review its suites and current test status.</p></div><Link to="/projects" className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">View all <ArrowRight size={15} /></Link></div>
      <Card className="mt-4 overflow-hidden">{data.recentProjects.length === 0 && !loading ? <div className="px-6 py-12 text-center"><FolderKanban className="mx-auto text-slate-300" size={34} /><h3 className="mt-3 font-semibold">No projects yet</h3><p className="mt-1 text-sm text-slate-500">Create your first project to start organizing tests.</p><Link to="/projects" className="mt-4 inline-flex text-sm font-semibold text-indigo-600">Go to Projects</Link></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Project", "Suites", "Cases", "Pass Rate", "Last Run", ""].map(label => <th className="px-5 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{data.recentProjects.map(project => <tr className="border-t border-slate-100" key={project.id}><td className="px-5 py-4"><div className="font-semibold text-slate-900">{project.name}</div><div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{project.baseUrl}</div></td><td className="px-5">{project.suites}</td><td className="px-5">{project.cases}</td><td className="px-5"><Badge status={project.passRate === 100 ? "Passed" : project.failed > 0 ? "Failed" : ""}>{project.passRate}%</Badge></td><td className="px-5 text-slate-500">{project.lastRun ? new Date(project.lastRun).toLocaleString() : "Not run"}</td><td className="px-5 text-right"><Link className="font-semibold text-indigo-600 hover:text-indigo-700" to={`/projects/${project.id}`}>Open</Link></td></tr>)}</tbody></table></div>}</Card>
    </div>
  );
}

export default DashboardPage;
