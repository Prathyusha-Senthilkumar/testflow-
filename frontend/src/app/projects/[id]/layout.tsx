import { ProjectTabs } from "@/components/projects/ProjectTabs";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProjectTabs />
      {children}
    </>
  );
}
