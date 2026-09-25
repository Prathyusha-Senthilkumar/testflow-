"use client";

import { useEffect, useState } from "react";
import { BarChart3, ChevronDown, FolderKanban, Gauge, History, LogOut, Menu, Settings, TerminalSquare } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "@/lib/navigation";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { suites, testCases } from "@/lib/demoData";

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
  const projectId=parts[0]==='projects'?parts[1]??"":"";
  const [projectName,setProjectName]=useState("");

  useEffect(()=>{
    if(!projectId){
      setProjectName("");
      return;
    }
    let cancelled=false;
    api.project(projectId)
      .then((item)=>{ if(!cancelled) setProjectName(item.name); })
      .catch(()=>{ if(!cancelled) setProjectName(""); });
    return ()=>{ cancelled=true; };
  },[projectId]);

  let crumbs:Crumb[]=[];

  if(parts[0]==='dashboard') crumbs=[{label:'Dashboard'}];
  else if(parts[0]==='projects'){
    crumbs=[{label:'Projects',to:'/projects'}];
    if(parts[1]) crumbs.push({label:projectName || "Project",to:`/projects/${parts[1]}`});
    if(parts[2]==='test-cases'){
      crumbs.push({label:'Test Cases',to:`/projects/${parts[1]}/test-cases`});
      if(parts[3]) crumbs.push({label:testCases.find(t=>t.id===parts[3])?.id || parts[3]});
    } else if(parts[2]==='suites'){
      crumbs.push({label:'Test Suites',to:`/projects/${parts[1]}/suites`});
      if(parts[3]==='review') crumbs.push({label:'Review Suggestions'});
      else if(parts[3]) crumbs.push({label:suites.find(s=>s.id===parts[3])?.name || parts[3]});
    } else if(parts[2]==='environments'){
      crumbs.push({label:'Environments'});
    } else if(parts[2]==='auth-profiles'){
      crumbs.push({label:'Auth Profiles'});
    } else if(parts[2]==='runs'){
      crumbs.push({label:'Live Execution'});
    } else if(parts[2]==='results'){
      crumbs.push({label:'Test Result'});
    }
  } else if(parts[0]==='runs'){
    crumbs=[{label:'Test Runs', to: parts[1] ? '/runs' : undefined}];
    if(parts[1]==='batches' && parts[2]) crumbs.push({label:'Run details'});
  }
  else if(parts[0]==='reports') crumbs=[{label:'Reports'}];
  else if(parts[0]==='settings') crumbs=[{label:'Settings'}];

  return <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
    {crumbs.map((c,i)=><span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
      {i>0&&<span className="text-slate-300">/</span>}
      {c.to&&i<crumbs.length-1?<Link to={c.to} className="transition hover:text-indigo-600 hover:underline">{c.label}</Link>:<span className={i===crumbs.length-1?'font-medium text-slate-700':''}>{c.label}</span>}
    </span>)}
  </nav>
}

export function AppShell({children}:{children?:React.ReactNode}){
  const navigate=useNavigate(); const location=useLocation(); const [collapsed,setCollapsed]=useState(false);
  return <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
    <aside className={`fixed inset-y-0 left-0 z-40 border-r border-slate-200 bg-white transition-[width] duration-200 ${collapsed?"w-20":"w-60"}`}>
      <div className={`flex h-16 items-center border-b border-slate-200 ${collapsed?"justify-center px-0":"gap-3 px-3"}`}><button type="button" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?"Expand navigation sidebar":"Collapse navigation sidebar"} title={collapsed?"Expand sidebar":"Collapse sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><Menu size={22}/></button>{!collapsed&&<><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm"><TerminalSquare size={20}/></span><div className="font-bold leading-none">TestFlow</div></>}</div>
      <div className="px-3 pt-5"><p className={`px-2 text-xs font-medium uppercase tracking-wider text-slate-400 ${collapsed?"sr-only":""}`}>Workspace</p><nav className="mt-2 space-y-1">{nav.map(([to,label,Icon])=><NavLink key={to} to={to} title={collapsed?label:undefined} className={({isActive})=>`flex items-center rounded-md py-2.5 text-sm font-medium transition ${collapsed?"justify-center px-3":"gap-3 px-3"} ${isActive?"bg-indigo-600 text-white":"text-slate-600 hover:bg-slate-100"}`}><Icon size={18}/>{!collapsed&&<span className="flex-1">{label}</span>}{!collapsed&&label==="Projects"&&<span className={`rounded px-1.5 text-[11px] ${location.pathname.startsWith('/projects')?'bg-white/20':'bg-indigo-100 text-indigo-700'}`}>3</span>}</NavLink>)}</nav><div className="my-4 border-t border-slate-200"/><p className={`px-2 text-xs font-medium uppercase tracking-wider text-slate-400 ${collapsed?"sr-only":""}`}>Preferences</p><NavLink to="/settings" title={collapsed?"Settings":undefined} className={({isActive})=>`mt-2 flex items-center rounded-md py-2.5 text-sm font-medium ${collapsed?"justify-center px-3":"gap-3 px-3"} ${isActive?"bg-indigo-600 text-white":"text-slate-600 hover:bg-slate-100"}`}><Settings size={18}/>{!collapsed&&"Settings"}</NavLink></div>
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-3"><div className={`flex items-center rounded-lg py-2 ${collapsed?"justify-center px-0":"gap-3 px-2"}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">SC</div>{!collapsed&&<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">Sarah Chen</p><p className="truncate text-xs text-slate-500">QA Automation Lead</p></div>}{!collapsed&&<ChevronDown size={16} className="text-slate-400"/>}</div><button onClick={async()=>{await supabase.auth.signOut();navigate('/login')}} className="mt-1 hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"><LogOut size={15}/>Sign out</button></div>
    </aside>
    <div className={`min-h-screen transition-[margin] duration-200 ${collapsed?"ml-20":"ml-60"}`}><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Breadcrumbs/></header><main>{children}</main></div>
  </div>
}
