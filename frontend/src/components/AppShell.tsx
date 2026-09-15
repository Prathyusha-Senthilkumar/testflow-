"use client";

import { BarChart3, ChevronDown, FolderKanban, Gauge, History, LogOut, Settings, TerminalSquare } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { project, suites, testCases } from "@/lib/demoData";

const nav=[
  ["/dashboard","Dashboard",Gauge],
  ["/projects","Projects",FolderKanban],
  ["/runs","Test Runs",History],
  ["/reports","Reports",BarChart3],
] as const;

type Crumb={label:string;to?:string};
function Breadcrumbs(){
  const {pathname}=useLocation();
  const parts=pathname.split('/').filter(Boolean);
  let crumbs:Crumb[]=[];

  if(parts[0]==='dashboard') crumbs=[{label:'Dashboard'}];
  else if(parts[0]==='projects'){
    crumbs=[{label:'Projects',to:'/projects'}];
    if(parts[1]) crumbs.push({label:project.name,to:`/projects/${parts[1]}`});
    if(parts[2]==='test-cases'){
      crumbs.push({label:'Test Cases',to:`/projects/${parts[1]}/test-cases`});
      if(parts[3]) crumbs.push({label:testCases.find(t=>t.id===parts[3])?.id || parts[3]});
    } else if(parts[2]==='suites'){
      crumbs.push({label:'Test Suites',to:`/projects/${parts[1]}/suites`});
      if(parts[3]==='review') crumbs.push({label:'Review Suggestions'});
      else if(parts[3]) crumbs.push({label:suites.find(s=>s.id===parts[3])?.name || parts[3]});
    } else if(parts[2]==='runs'){
      crumbs.push({label:'Live Execution'});
    } else if(parts[2]==='results'){
      crumbs.push({label:'Test Result'});
    }
  } else if(parts[0]==='runs') crumbs=[{label:'Test Runs'}];
  else if(parts[0]==='reports') crumbs=[{label:'Reports'}];
  else if(parts[0]==='settings') crumbs=[{label:'Settings'}];

  return <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
    {crumbs.map((c,i)=><span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
      {i>0&&<span className="text-slate-300">/</span>}
      {c.to&&i<crumbs.length-1?<Link to={c.to} className="transition hover:text-blue-600 hover:underline">{c.label}</Link>:<span className={i===crumbs.length-1?'font-medium text-slate-700':''}>{c.label}</span>}
    </span>)}
  </nav>
}

export function AppShell({children}:{children:React.ReactNode}){
  const navigate=useNavigate(); const location=useLocation();
  return <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-40 w-60 border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white shadow-sm"><TerminalSquare size={20}/></span><div><div className="font-bold leading-none">TestFlow</div><div className="mt-1 font-mono text-[11px] text-slate-500">Playwright Automation</div></div></div>
      <div className="px-3 pt-5"><p className="px-2 text-xs font-medium uppercase tracking-wider text-slate-400">Workspace</p><nav className="mt-2 space-y-1">{nav.map(([to,label,Icon])=><NavLink key={to} to={to} className={({isActive})=>`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${isActive?"bg-blue-600 text-white":"text-slate-600 hover:bg-slate-100"}`}><Icon size={18}/><span className="flex-1">{label}</span>{label==="Projects"&&<span className={`rounded px-1.5 text-[11px] ${location.pathname.startsWith('/projects')?'bg-white/20':'bg-blue-100 text-blue-700'}`}>3</span>}</NavLink>)}</nav><div className="my-4 border-t border-slate-200"/><p className="px-2 text-xs font-medium uppercase tracking-wider text-slate-400">Preferences</p><NavLink to="/settings" className={({isActive})=>`mt-2 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${isActive?"bg-blue-600 text-white":"text-slate-600 hover:bg-slate-100"}`}><Settings size={18}/>Settings</NavLink></div>
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-3"><div className="flex items-center gap-3 rounded-lg px-2 py-2"><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">SC</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">Sarah Chen</p><p className="truncate text-xs text-slate-500">QA Automation Lead</p></div><ChevronDown size={16} className="text-slate-400"/></div><button onClick={async()=>{await supabase.auth.signOut();navigate('/login')}} className="mt-1 hidden w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"><LogOut size={15}/>Sign out</button></div>
    </aside>
    <div className="ml-60 min-h-screen"><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Breadcrumbs/><div className="flex items-center gap-5 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1.5 font-mono text-slate-600"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-teal-600"/>Production: srmist.edu.in</span><span className="font-medium text-slate-600">▣ Docs</span></div></header><main>{children}</main></div>
  </div>
}
