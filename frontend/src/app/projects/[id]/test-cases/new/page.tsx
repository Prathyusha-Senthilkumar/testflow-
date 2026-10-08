import type { Metadata } from "next";
import { TestCaseCreatePage } from "@/views/TestCaseCreatePage";

export const metadata: Metadata = { title: "New test case" };

export default function Page() {
  return <TestCaseCreatePage />;
}
