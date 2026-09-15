import type { ReactNode } from "react";
export function PageHeader({eyebrow,title,description,actions}:{eyebrow?:ReactNode,title:string,description?:string,actions?:ReactNode}){
 return <div className="flex flex-wrap items-start justify-between gap-5"><div>{eyebrow&&<div className="mb-2 text-sm text-slate-500">{eyebrow}</div>}<h1 className="text-3xl font-bold tracking-tight text-slate-950">{title}</h1>{description&&<p className="mt-1.5 text-sm text-slate-500">{description}</p>}</div>{actions&&<div className="flex flex-wrap gap-2">{actions}</div>}</div>
}
