"use client";

import { useState } from "react";
import { useNavigate } from "@/lib/navigation";
import { Eye, EyeOff, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured, signInWithPasswordApi } from "@/lib/supabase";
export function LoginPage(){
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [show,setShow]=useState(false); const [error,setError]=useState(""); const [loading,setLoading]=useState(false); const navigate=useNavigate();
 async function submit(e:React.FormEvent){e.preventDefault();setError("");if(!isSupabaseConfigured){navigate('/dashboard');return;}setLoading(true);const {error}=await signInWithPasswordApi(email,password);setLoading(false);if(error){setError(error.message);return;}navigate('/dashboard');}
 return <div className="grid min-h-screen place-items-center bg-[#f7f9fc] px-4"><div className="w-full max-w-sm rounded-xl bg-white p-7 shadow-xl shadow-slate-200/60"><div className="mb-6 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-indigo-600 text-white"><TerminalSquare size={22}/></span><h1 className="mt-3 text-lg font-bold">TestFlow</h1><p className="mt-1 font-mono text-[11px] text-slate-500">Playwright Automation</p></div><form onSubmit={submit}><label className="text-xs font-medium text-slate-600">Email Address</label><Input className="mt-1.5" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="sarah@example.com" required/><label className="mt-4 block text-xs font-medium text-slate-600">Password</label><div className="relative mt-1.5"><Input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required className="pr-10"/><button type="button" onClick={()=>setShow(v=>!v)} className="absolute inset-y-0 right-3 text-slate-400">{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>{error&&<p className="mt-3 text-xs text-red-600">{error}</p>}<Button type="submit" className="mt-5 w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading}>{loading?'Signing in...':'Login'}</Button>{!isSupabaseConfigured&&<p className="mt-3 text-center text-[11px] text-slate-400">Demo mode is enabled because Supabase keys are not configured.</p>}</form></div></div>
}

export default LoginPage;
