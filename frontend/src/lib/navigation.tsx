"use client";

import NextLink from "next/link";
import { usePathname, useRouter, useParams as useNextParams, useSearchParams as useNextSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & { to: string };
export function Link({to,...props}:LinkProps){ return <NextLink href={to} {...props}/>; }

type NavLinkProps = Omit<LinkProps,"className"> & { className?: string | ((state:{isActive:boolean})=>string); children?:ReactNode };
export function NavLink({to,className,...props}:NavLinkProps){
  const pathname=usePathname() ?? "";
  const isActive=to==="/dashboard" ? pathname===to : pathname===to || pathname.startsWith(to+"/");
  const resolved=typeof className==="function" ? className({isActive}) : className;
  return <NextLink href={to} className={resolved} {...props}/>;
}

export function useNavigate(){
  const router=useRouter();
  return (to:string, options?:{replace?:boolean}) => options?.replace ? router.replace(to) : router.push(to);
}
export function useLocation(){ return {pathname:usePathname() ?? ""}; }
export function useParams(){ return useNextParams() as Record<string,string>; }
export function useSearchParams(){ return useNextSearchParams(); }
