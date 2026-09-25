import { createBrowserRouter, Navigate } from "react-router";
import { AdminShell } from "@/app/shell/admin-shell";
import { BookingsPage } from "@/features/bookings/bookings-page";
import { ResourcesPage } from "@/features/resources/resources-page";
import { SchedulePage } from "@/features/schedule/schedule-page";
import { ServicesPage } from "@/features/services/services-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { TeamPage } from "@/features/team/team-page";

const developmentOrganizationId = "00000000-0000-7000-8000-000000000001";

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Navigate replace to={`/app/${developmentOrganizationId}/bookings`} />
    ),
  },
  {
    path: "/app/:organizationId",
    element: <AdminShell />,
    children: [
      { index: true, element: <Navigate replace to="bookings" /> },
      { path: "bookings", element: <BookingsPage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "resources", element: <ResourcesPage /> },
      { path: "schedule", element: <SchedulePage /> },
      { path: "team", element: <TeamPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
