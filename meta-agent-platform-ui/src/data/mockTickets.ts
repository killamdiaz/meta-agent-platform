export type Ticket = {
  id: string;
  key: string;
  title: string;
  description: string;
  priority: "P1" | "P2" | "P3" | "P4";
  status: "open" | "in-progress" | "closed";
  reporter: string;
  createdAt: string;
  source: string;
  comments?: Array<{ author?: string; body?: string; created?: string }>;
};

export const mockTickets: Ticket[] = [
  {
    id: "1",
    key: "SUP-1",
    title: "Atlas Issue URGENT",
    description: "Not able to process payments. need help ASAP!",
    priority: "P1",
    status: "open",
    reporter: "Zaid Mallik",
    createdAt: "2024-12-03",
    source: "Portal",
  },
  {
    id: "2",
    key: "SUP-2",
    title: "Login page not loading",
    description: "Users report blank screen on login attempt.",
    priority: "P1",
    status: "open",
    reporter: "Sarah Chen",
    createdAt: "2024-12-02",
    source: "Email",
  },
  {
    id: "3",
    key: "SUP-3",
    title: "Dashboard performance slow",
    description: "Dashboard takes 10+ seconds to load.",
    priority: "P2",
    status: "in-progress",
    reporter: "Mike Johnson",
    createdAt: "2024-12-01",
    source: "Portal",
  },
  {
    id: "4",
    key: "SUP-4",
    title: "Export feature broken",
    description: "CSV export returns empty file.",
    priority: "P2",
    status: "open",
    reporter: "Emma Wilson",
    createdAt: "2024-11-30",
    source: "Slack",
  },
  {
    id: "5",
    key: "SUP-5",
    title: "Update documentation",
    description: "API docs need updating for v2.",
    priority: "P3",
    status: "open",
    reporter: "Alex Brown",
    createdAt: "2024-11-29",
    source: "Portal",
  },
  {
    id: "6",
    key: "SUP-6",
    title: "Minor UI alignment issue",
    description: "Button spacing off on mobile.",
    priority: "P4",
    status: "closed",
    reporter: "Lisa Park",
    createdAt: "2024-11-28",
    source: "Email",
  },
];
