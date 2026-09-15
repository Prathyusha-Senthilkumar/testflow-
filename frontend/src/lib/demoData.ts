export type DemoStatus = "Passed" | "Failed" | "Running" | "Untested" | "Skipped";

export const project = {
  id: "demo-project",
  name: "SRM Website Testing",
  baseUrl: "https://srmist.edu.in",
  description: "Automated Playwright coverage for the public SRM website and admissions journeys.",
};

export const suites = [
  { id: "admissions", name: "Admissions Suite", description: "Admissions workflow and form verification", cases: 124, passed: 116, failed: 8, notRun: 0, passRate: 93.5, lastRun: "10 mins ago", lastRunBy: "Priya" },
  { id: "smoke", name: "Smoke Testing", description: "Academics portal & core critical paths", cases: 68, passed: 60, failed: 8, notRun: 0, passRate: 88.2, lastRun: "35 mins ago", lastRunBy: "Priya" },
  { id: "student", name: "Student Portal", description: "Course registration and grade viewer", cases: 36, passed: 36, failed: 0, notRun: 0, passRate: 100, lastRun: "1 hour ago", lastRunBy: "Priya" },
  { id: "login", name: "Login & Authentication", description: "SSO, 2FA, and session persistence", cases: 20, passed: 14, failed: 6, notRun: 0, passRate: 70, lastRun: "2 hours ago", lastRunBy: "Priya" },
];

export const testCases = [
  { id:"TC-001", name:"Open Admissions Page", automation:"Visual Setup", suites:["Login & Authentication","Smoke Testing"], status:"Passed" as DemoStatus, lastRun:"10 mins ago", runBy:"Priya", runtime:"1.4s", script:"tests/admissions/test_open_admissions.py" },
  { id:"TC-002", name:"Verify Academic Programs Form", automation:"Write Script", suites:["Login & Authentication"], status:"Passed" as DemoStatus, lastRun:"15 mins ago", runBy:"Arun", runtime:"2.1s", script:"tests/academics/test_programs_form.py" },
  { id:"TC-003", name:"Verify Apply Now Button", automation:"Write Script", suites:["Login & Authentication"], status:"Failed" as DemoStatus, lastRun:"35 mins ago", runBy:"Priya", runtime:"4.2s", script:"tests/admissions/test_apply_button.py" },
  { id:"TC-004", name:"International Admissions Form", automation:"Visual Setup", suites:["Smoke Testing"], status:"Passed" as DemoStatus, lastRun:"1 hour ago", runBy:"Arun", runtime:"5.0s", script:"tests/admissions/test_international_form.py" },
  { id:"TC-005", name:"Admission Fee Calculator", automation:"Write Script", suites:["Admissions Suite"], status:"Passed" as DemoStatus, lastRun:"1 hour ago", runBy:"Priya", runtime:"3.2s", script:"tests/admissions/test_fee_calculator.py" },
  { id:"TC-006", name:"Check Campus Tour Booking", automation:"Visual Setup", suites:["Admissions Suite","Smoke Testing"], status:"Untested" as DemoStatus, lastRun:"Never", runBy:"Arun", runtime:"—", script:"tests/admissions/test_campus_tour.py" },
  { id:"TC-007", name:"Student Scholarship Directory", automation:"Write Script", suites:[], status:"Passed" as DemoStatus, lastRun:"2 hours ago", runBy:"Priya", runtime:"2.8s", script:"tests/admissions/test_scholarships.py" },
  { id:"TC-008", name:"Contact Admissions Helpdesk", automation:"Visual Setup", suites:["Admissions Suite"], status:"Passed" as DemoStatus, lastRun:"3 hours ago", runBy:"Arun", runtime:"1.9s", script:"tests/admissions/test_helpdesk.py" },
];

export const recentRuns = [
  { id:"104", title:"Admissions Suite", subtitle:"TC-001 · Admissions", status:"Running" as DemoStatus, runBy:"Priya", duration:"8.4s", executed:"10 mins ago" },
  { id:"103", title:"TC-004 International Form", subtitle:"Admissions", status:"Passed" as DemoStatus, runBy:"Arun", duration:"12.1s", executed:"35 mins ago" },
  { id:"102", title:"Fee Calculator Flow", subtitle:"Admissions", status:"Failed" as DemoStatus, runBy:"Priya", duration:"3m 12s", executed:"1 hour ago" },
  { id:"101", title:"Daily Smoke Test", subtitle:"Smoke Testing", status:"Passed" as DemoStatus, runBy:"GitHub Actions", duration:"1m 20s", executed:"Yesterday" },
  { id:"100", title:"International Students Flow", subtitle:"Admissions", status:"Passed" as DemoStatus, runBy:"Arun", duration:"2m 10s", executed:"Yesterday" },
];

export const suggestedSuites = [
  { id:"sg1", name:"Login & Authentication", description:"Validates session establishment, authentication tokens, password recovery pipelines, and brute-force lockouts.", cases:["TC-001","TC-002","TC-003"] },
  { id:"sg2", name:"Smoke Testing", description:"High-priority healthcheck validations intended for staging deployment gates and pre-commit checks.", cases:["TC-001","TC-004"] },
  { id:"sg3", name:"Admissions", description:"Tracks multi-step student admission application portals, document upload verifications, and status callbacks.", cases:["TC-006"] },
];

export const dashboardProjects = [
  { name:"SRM Website Testing", suites:4, tests:124, passRate:95, lastRun:"10 mins ago", runBy:"Priya", id:"demo-project" },
  { name:"Student Portal", suites:2, tests:68, passRate:100, lastRun:"2 hours ago", runBy:"Sarah", id:"student-portal" },
  { name:"Faculty Portal", suites:1, tests:56, passRate:78, lastRun:"35 mins ago", runBy:"Arun", id:"faculty-portal" },
];

export const reportTrend = [
  { day:"Mon", passed:182, failed:10 }, { day:"Tue", passed:191, failed:9 }, { day:"Wed", passed:176, failed:12 },
  { day:"Thu", passed:201, failed:8 }, { day:"Fri", passed:188, failed:11 }, { day:"Sat", passed:148, failed:5 }, { day:"Sun", passed:210, failed:7 },
];
